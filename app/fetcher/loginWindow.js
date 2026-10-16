import { BrowserWindow, screen } from "electron";
import {
  saveCookiesToSecureStorage,
  saveCookieHeaderToTxt,
  getCookiePartition,
  getJwtExpiration,
  resumeCookiePersister,
  isUnetiDomain,
  suspendCookiePersister,
  clearAllCookies,
} from "./cookieManager.js";
import { saveUser, clearUser } from "./userStore.js";
import { captureSession, assertSession } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

let activeLoginWindow = null;
let activeLoginPromise = null;
let activeReject = null;

function sanitizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(rawUrl || "").split("?")[0];
  }
}

function isTrustedUnetiUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return host === "support.uneti.edu.vn" || host === CONFIG.UNETI_DOMAIN || host.endsWith("." + CONFIG.UNETI_DOMAIN);
  } catch {
    return false;
  }
}

function studentIdOf(data) {
  return data?.MaSinhVien || data?.studentId || data?.username || data?.user?.MaSinhVien || null;
}

export function cancelLoginWindow() {
  if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
    try {
      activeLoginWindow.close();
      return;
    } catch {}
  }
  if (activeReject) {
    const rej = activeReject;
    activeLoginWindow = null;
    activeLoginPromise = null;
    activeReject = null;
    rej(new Error("Login cancelled"));
  }
}

export function showLoginWindow(parent) {
  if (activeLoginPromise && activeLoginWindow && !activeLoginWindow.isDestroyed()) {
    try {
      activeLoginWindow.show();
      activeLoginWindow.focus();
    } catch {}
    return activeLoginPromise;
  }

  const sessionSnapshot = captureSession();

  activeLoginPromise = new Promise((resolve, reject) => {
    activeReject = reject;
    let finished = false;
    let capturing = false;
    let pollTimer = null;
    let checkingAuth = false;
    let pageReady = false;

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { width: screenW, height: screenH, x: screenX, y: screenY } = display.workArea;

    const winW = Math.min(920, screenW - 40);
    const winH = Math.min(680, screenH - 40);

    const posX = Math.max(screenX + 20, screenX + screenW - winW - 20);
    const posY = Math.max(screenY + 20, screenY + Math.round((screenH - winH) / 2));

    const win = new BrowserWindow({
      width: winW,
      height: winH,
      x: posX,
      y: posY,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: "#141414",
      title: "Đăng nhập UNETI",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: getCookiePartition(),
      },
    });

    activeLoginWindow = win;
    win.webContents.setWindowOpenHandler?.(() => ({ action: "deny" }));
    for (const eventName of ["will-navigate", "will-redirect"]) win.webContents.on(eventName, (event, url) => { if (!isTrustedUnetiUrl(url)) event.preventDefault(); });
    suspendCookiePersister();
    (async () => {
      await win.webContents.session.clearStorageData?.();
      assertSession(sessionSnapshot);
      if (win.isDestroyed()) throw new Error("Login cancelled");
      await win.loadURL(CONFIG.UNETI_LOGIN_URL);
      pageReady = true;
    })().catch(error => { cancelLoginWindow(); logger.warn("[loginWindow] load failed", { error: error.message }); });
    logger.debug(`[loginWindow] loading URL: ${CONFIG.UNETI_LOGIN_URL} at x:${posX}, y:${posY}`);

    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    async function handleSuccessfulLogin(source) {
      if (finished || capturing) return;
      capturing = true;
      let transactionSnapshot = sessionSnapshot;
      let cookiesPersisted = false;

      try {
        const ses = win.webContents.session;
        const allCookies = await ses.cookies.get({});
        const cookies = allCookies.filter((c) => isUnetiDomain(c.domain || CONFIG.UNETI_DOMAIN));
        const hasAccessToken = cookies.some((c) => {
          if (c.name !== "access_token" || !c.value) return false;
          const exp = getJwtExpiration(c.value);
          return exp !== null && exp > Date.now() / 1000;
        });

        if (!cookies || cookies.length === 0 || !hasAccessToken) {
          capturing = false;
          return;
        }

        let userData = null;
        try {
          const raw = await win.webContents.executeJavaScript(`
            (() => {
              try {
                const u = localStorage.getItem("userData") || localStorage.getItem("userSV") || localStorage.getItem("studentData");
                if (u) return JSON.parse(u);
                const root = localStorage.getItem("persist:root");
                if (root) {
                  const p = JSON.parse(root);
                  const auth = p.auth ? JSON.parse(p.auth) : null;
                  return auth?.currentUser || null;
                }
              } catch {}
              return null;
            })()
          `);
          if (raw) userData = raw;
        } catch (e) {
          logger.warn(`[loginWindow] failed to read user data: ${e?.message}`);
        }

        const studentId = studentIdOf(userData);
        if (!studentId) {
          logger.debug("[loginWindow] waiting for student profile data");
          capturing = false;
          return;
        }

        cleanup();

        if (win && !win.isDestroyed()) {
          win.hide();
        }

        assertSession(sessionSnapshot);
        for (const cookie of cookies) {
          const jwtExp = getJwtExpiration(cookie.value);
          if (jwtExp && jwtExp > Date.now() / 1000) {
            try {
              const cleanDomain = (cookie.domain || CONFIG.UNETI_DOMAIN).replace(/^\./, "");
              const cleanPath = cookie.path || "/";
              await ses.cookies.set({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cleanPath,
                secure: typeof cookie.secure === "boolean" ? cookie.secure : true,
                httpOnly: !!cookie.httpOnly,
                expirationDate: jwtExp,
                url: `https://${cleanDomain}${cleanPath.startsWith("/") ? cleanPath : "/" + cleanPath}`,
              });
            } catch {}
          }
        }

        assertSession(sessionSnapshot);
        if (win.isDestroyed()) throw new Error("Login cancelled");
        const saved = await saveCookiesToSecureStorage(cookies);
        cookiesPersisted = !!saved;
        assertSession(sessionSnapshot);
        if (!saved) throw new Error("Failed to persist cookies securely");
        if (win.isDestroyed()) throw new Error("Login cancelled");
        const savedSnapshot = await saveUser(userData);
        transactionSnapshot = savedSnapshot;
        assertSession(savedSnapshot);
        if (win.isDestroyed()) throw new Error("Login cancelled");
        logger.info("[loginWindow] saved student profile");

        resumeCookiePersister();
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        await saveCookieHeaderToTxt(cookieHeader);
        assertSession(savedSnapshot);
        if (win.isDestroyed()) throw new Error("Login cancelled");

        const cleanSource = source.startsWith("http") ? sanitizeUrl(source) : source;
        logger.info(`[loginWindow] saved ${cookies.length} cookies from ${cleanSource}`);

        finished = true;
        activeLoginWindow = null;
        activeLoginPromise = null;
        activeReject = null;

        win.close();
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        resolve(cookieHeader);
      } catch (err) {
        logger.error(`[loginWindow] login capture error: ${err?.message}`);
        if (cookiesPersisted && (!activeLoginWindow || activeLoginWindow === win)) {
          try {
            assertSession(err.sessionSnapshot || transactionSnapshot);
            await clearUser();
            await clearAllCookies();
          } catch { /* A newer session owns cleanup, or the main logout reports a persistence failure. */ }
        }
        capturing = false;
        finished = true;
        cleanup();
        if (activeLoginWindow === win) {
          activeLoginWindow = null;
          activeLoginPromise = null;
          activeReject = null;
        }
        if (win && !win.isDestroyed()) {
          try { win.close(); } catch {}
        }
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        reject(err);
      }
    }

    const checkAuthState = async () => {
      if (!pageReady || finished || checkingAuth || win.isDestroyed() || win.webContents.isLoadingMainFrame?.()) return;
      checkingAuth = true;
      try {
        const currentUrl = win.webContents.getURL();
        if (!isTrustedUnetiUrl(currentUrl)) return;

        const isNotOnLoginUrl = !currentUrl.includes("/dang-nhap");
        const hasAuthStore = await win.webContents.executeJavaScript(`
          (() => {
            try {
              const root = localStorage.getItem("persist:root");
              if (root) {
                const p = JSON.parse(root);
                const auth = p.auth ? JSON.parse(p.auth) : null;
                if (auth?.isAuthenticated && auth?.currentUser) return true;
              }
              const u = localStorage.getItem("userData") || localStorage.getItem("userSV") || localStorage.getItem("studentData");
              if (u) return true;
            } catch {}
            return false;
          })()
        `).catch(() => false);

        if (isNotOnLoginUrl || hasAuthStore) {
          await handleSuccessfulLogin(currentUrl);
        }
      } catch {} finally { checkingAuth = false; }
    };

    pollTimer = setInterval(checkAuthState, 600);

    const onNavigate = (_, url) => {
      logger.debug(`[loginWindow] navigated to: ${sanitizeUrl(url)}`);
      if (pageReady && isTrustedUnetiUrl(url) && !url.includes("/dang-nhap")) {
        handleSuccessfulLogin(url);
      }
    };

    win.webContents.on("did-navigate", onNavigate);
    win.webContents.on("did-navigate-in-page", onNavigate);

    win.on("closed", () => {
      cleanup();
      const wasFinished = finished;
      finished = true;
      if (activeLoginWindow === win) {
        activeLoginWindow = null;
        activeLoginPromise = null;
        activeReject = null;
      }
      if (!wasFinished) {
        logger.warn("[loginWindow] Window closed before login");
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        reject(new Error("Login cancelled"));
      }
    });
  });

  return activeLoginPromise;
}
