import { BrowserWindow } from "electron";
import {
  saveCookiesToSecureStorage,
  saveCookieHeaderToTxt,
  getCookiePartition,
} from "./cookieManager.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

export async function showLoginWindow(parent) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      parent,
      modal: true,
      webPreferences: {
        contextIsolation: true,
        partition: getCookiePartition(),
      },
    });

    win.loadURL(CONFIG.UNETI_LOGIN_URL);
    logger.debug(`[loginWindow] loading URL: ${CONFIG.UNETI_LOGIN_URL}`);

    win.webContents.on("did-navigate", async (_, url) => {
      logger.debug(`[loginWindow] navigated to: ${url}`);
      if (
        url.includes("cloudflare") ||
        url.includes("cf-browser-verification")
      ) {
        logger.warn(`[loginWindow] Cloudflare challenge detected on: ${url}`);
      }

      if (
        url.includes("dashboard") ||
        (url.includes("sinh-vien-dang-nhap.html") === false &&
          url !== CONFIG.UNETI_LOGIN_URL)
      ) {
        if (url.includes("dashboard") || url.includes("lich-theo-tuan")) {
          logger.info(
            `[loginWindow] Successfully logged in, capturing cookies from ${url}`,
          );
          const cookies = await win.webContents.session.cookies.get({
            url: `https://${CONFIG.UNETI_DOMAIN}`,
          });
          const cookieHeader = cookies
            .map((c) => `${c.name}=${c.value}`)
            .join("; ");

          await saveCookiesToSecureStorage(cookies);
          await saveCookieHeaderToTxt(cookieHeader);

          logger.info(`[loginWindow] Saved ${cookies.length} cookies.`);
          win.close();
          resolve(cookieHeader);
        }
      }
    });

    win.on("closed", () => {
      logger.warn("[loginWindow] Window closed");
      reject(new Error("Login cancelled"));
    });
  });
}
