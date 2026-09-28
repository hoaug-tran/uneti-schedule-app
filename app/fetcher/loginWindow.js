import { BrowserWindow, screen } from "electron";
import {
  saveCookiesToSecureStorage,
  saveCookieHeaderToTxt,
  getCookiePartition,
  getJwtExpiration,
} from "./cookieManager.js";
import { saveUser } from "./userStore.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

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
    return parsed.hostname === "support.uneti.edu.vn" || parsed.hostname.endsWith(".uneti.edu.vn");
  } catch {
    return false;
  }
}

export async function showLoginWindow(parent) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let pollTimer = null;

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
        partition: getCookiePartition(),
      },
    });

    win.loadURL(CONFIG.UNETI_LOGIN_URL);
    logger.debug(`[loginWindow] loading URL: ${CONFIG.UNETI_LOGIN_URL} at x:${posX}, y:${posY}`);

    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    async function handleSuccessfulLogin(source) {
      if (finished) return;

      try {
        const ses = win.webContents.session;
        const allCookies = await ses.cookies.get({});
        const cookies = allCookies.filter((c) => c.domain?.includes(CONFIG.UNETI_DOMAIN));
        const hasAccessToken = cookies.some((c) => c.name === "access_token");

        if (!cookies || cookies.length === 0 || !hasAccessToken) {
          return;
        }

        finished = true;
        cleanup();

        if (win && !win.isDestroyed()) {
          win.hide();
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

        if (userData) {
          await saveUser(userData);
          const maskedId = userData.MaSinhVien ? `${String(userData.MaSinhVien).slice(0, 4)}****` : "unknown";
          logger.info(`[loginWindow] saved student profile: ${maskedId}`);
        }

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
                secure: !!cookie.secure,
                httpOnly: !!cookie.httpOnly,
                expirationDate: jwtExp,
                url: `https://${cleanDomain}${cleanPath}`,
              });
            } catch {}
          }
        }

        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        await saveCookiesToSecureStorage(cookies);
        await saveCookieHeaderToTxt(cookieHeader);
        const cleanSource = source.startsWith("http") ? sanitizeUrl(source) : source;
        logger.info(`[loginWindow] saved ${cookies.length} cookies from ${cleanSource}`);

        win.close();
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        resolve(cookieHeader);
      } catch (err) {
        logger.error(`[loginWindow] login capture error: ${err?.message}`);
        cleanup();
        win.close();
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        reject(err);
      }
    }

    const checkAuthState = async () => {
      if (finished || win.isDestroyed()) return;
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
      } catch {}
    };

    pollTimer = setInterval(checkAuthState, 600);

    const onNavigate = (_, url) => {
      logger.debug(`[loginWindow] navigated to: ${sanitizeUrl(url)}`);
      if (isTrustedUnetiUrl(url) && !url.includes("/dang-nhap")) {
        handleSuccessfulLogin(url);
      }
    };

    win.webContents.on("did-navigate", onNavigate);
    win.webContents.on("did-navigate-in-page", onNavigate);

    win.on("closed", () => {
      cleanup();
      if (!finished) {
        logger.warn("[loginWindow] Window closed before login");
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        reject(new Error("Login cancelled"));
      }
    });
  });
}
