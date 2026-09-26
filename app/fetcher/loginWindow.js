import { BrowserWindow, screen } from "electron";
import {
  saveCookiesToSecureStorage,
  saveCookieHeaderToTxt,
  getCookiePartition,
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

export async function showLoginWindow(parent) {
  return new Promise((resolve, reject) => {
    let finished = false;

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
        contextIsolation: false,
        partition: getCookiePartition(),
      },
    });

    win.loadURL(CONFIG.UNETI_LOGIN_URL);
    logger.debug(`[loginWindow] loading URL: ${CONFIG.UNETI_LOGIN_URL} at x:${posX}, y:${posY}`);

    async function handleSuccessfulLogin(source) {
      if (finished) return;
      finished = true;

      try {
        if (win && !win.isDestroyed()) {
          win.hide();
        }
        await new Promise((r) => setTimeout(r, 400));

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

        const allCookies = await win.webContents.session.cookies.get({});
        const cookies = allCookies.filter((c) => c.domain?.includes(CONFIG.UNETI_DOMAIN));
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
        win.close();
        if (parent && !parent.isDestroyed()) {
          parent.show();
          parent.focus();
        }
        reject(err);
      }
    }

    win.webContents.session.webRequest.onCompleted(
      { urls: ["*://apiv3.uneti.edu.vn/api/auth/*"] },
      (details) => {
        if (details.statusCode === 200 && details.url.includes("login")) {
          handleSuccessfulLogin("API auth/login");
        }
      }
    );

    const onNavigate = (_, url) => {
      logger.debug(`[loginWindow] navigated to: ${sanitizeUrl(url)}`);
      if (url.includes("/uneti") || (url.includes("support.uneti.edu.vn") && !url.includes("/dang-nhap"))) {
        handleSuccessfulLogin(url);
      }
    };

    win.webContents.on("did-navigate", onNavigate);
    win.webContents.on("did-navigate-in-page", onNavigate);

    win.on("closed", () => {
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
