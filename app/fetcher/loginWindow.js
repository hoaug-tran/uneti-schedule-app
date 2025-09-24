import { BrowserWindow, session } from "electron";
import fs from "fs/promises";
import { getStoreDir, getPaths } from "./storePath.js";

const { COOKIE_TXT } = getPaths();

export async function showLoginWindow(parent) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      parent,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.loadURL("https://sinhvien.uneti.edu.vn/sinh-vien-dang-nhap.html");

    win.webContents.on("did-navigate", async (_, url) => {
      if (url.includes("dashboard")) {
        const cookies = await session.defaultSession.cookies.get({
          url: "https://sinhvien.uneti.edu.vn",
        });

        const cookieHeader = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");

        await fs.mkdir(getStoreDir(), { recursive: true });
        await fs.writeFile(COOKIE_TXT, cookieHeader, "utf8");

        win.close();
        resolve(cookieHeader);
      }
    });

    win.on("closed", () => reject(new Error("Login cancelled")));
  });
}
