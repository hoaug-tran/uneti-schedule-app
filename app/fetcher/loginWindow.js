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

    win.webContents.on("did-navigate", async (_, url) => {
      if (url.includes("dashboard")) {
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
    });

    win.on("closed", () => reject(new Error("Login cancelled")));
  });
}
