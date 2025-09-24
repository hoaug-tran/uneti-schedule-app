import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  globalShortcut,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { getSchedule } from "../app/fetcher/getSchedule.js";
import { showLoginWindow } from "../app/fetcher/loginWindow.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray, win, refreshTimer;

async function ensureScheduleReady() {
  try {
    win?.webContents.send("status", "Đang tải lịch...");
    const data = await getSchedule();
    win?.webContents.send("status", "Lịch đã sẵn sàng");
    return data;
  } catch (err) {
    console.warn("Lỗi tải lịch:", err.message);
    win?.webContents.send("status", "Vui lòng đăng nhập UNETI...");

    try {
      await showLoginWindow(win);
      win?.webContents.send("status", "Đăng nhập thành công, tải lại lịch...");
      const data = await getSchedule();
      win?.webContents.send("status", "Lịch đã sẵn sàng");
      return data;
    } catch (loginErr) {
      console.error("Lỗi khi đăng nhập:", loginErr.message);
      win?.webContents.send("status", "Đăng nhập thất bại. Vui lòng thử lại.");
      throw loginErr;
    }
  }
}

function createWindow() {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    width: 650,
    height: 635,
    backgroundColor: "#141414",
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.resolve(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "../app/index.html"));

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("status", "Đang khởi động...");
    win?.webContents.send("reload");
  });

  win.on("closed", () => (win = null));
  win.on("blur", () => {
    if (win && !win.isDestroyed()) win.hide();
  });

  return win;
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  const pos = tray.getBounds();
  const width = 650;
  const height = win.getBounds().height;
  const x = Math.max(0, pos.x - width + 20);
  const y = Math.max(0, pos.y - height - 10);

  win.setBounds({ x, y, width, height });
  win.showInactive();
}

function createTray() {
  const iconPath = path.join(__dirname, "../app/assets/uneti.ico");
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip("UNETI Lịch học");

  tray.on("click", () => {
    if (!win || win.isDestroyed()) return;
    win.isVisible() ? win.hide() : showWindow();
  });
}

ipcMain.handle("widget:hide", () => win?.hide());
ipcMain.handle("widget:quit", () => {
  win?.hide();
  app.quit();
});
ipcMain.handle("widget:refresh", async () => {
  await ensureScheduleReady().catch(() => {});
  win?.webContents.send("reload");
});
ipcMain.handle("get-userData-path", () => app.getPath("userData"));

app.whenReady().then(async () => {
  createTray();

  try {
    await ensureScheduleReady();
    createWindow();
    win?.webContents.send("reload");
  } catch {
    createWindow();
  }

  refreshTimer = setInterval(async () => {
    try {
      await getSchedule();
      win?.webContents.send("reload");
    } catch (err) {
      console.error("Refresh fail:", err.message);
    }
  }, 12 * 60 * 60 * 1000);

  globalShortcut.register("Esc", () => {
    if (win && win.isVisible()) win.hide();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (refreshTimer) clearInterval(refreshTimer);
});

app.on("window-all-closed", (e) => e.preventDefault());
