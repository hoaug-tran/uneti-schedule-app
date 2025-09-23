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
import { loginAndSaveCookies } from "../app/fetcher/loginAndSaveCookies.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray, win;

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

  // load bằng __dirname thay vì cwd
  win.loadFile(path.join(__dirname, "../app/index.html"));

  win.webContents.on("did-finish-load", () => win.webContents.send("reload"));
  win.on("closed", () => (win = null));

  // auto-hide khi mất focus
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
    if (win.isVisible()) {
      win.hide();
    } else {
      showWindow();
    }
  });
}

ipcMain.handle("widget:hide", () => {
  if (win && !win.isDestroyed()) win.hide();
});

ipcMain.handle("widget:quit", () => {
  if (win && !win.isDestroyed()) win.hide();
  app.quit();
});

ipcMain.handle("widget:refresh", async () => {
  await ensureScheduleReady().catch(() => {});
  if (win && !win.isDestroyed()) win.webContents.send("reload");
});

ipcMain.handle("get-userData-path", () => app.getPath("userData"));

async function ensureScheduleReady() {
  try {
    return await getSchedule();
  } catch (err) {
    console.warn("Lỗi tải lịch, thử đăng nhập lại:", err.message);
    await loginAndSaveCookies();
    return await getSchedule();
  }
}

app.whenReady().then(async () => {
  createTray();

  try {
    await ensureScheduleReady();
    createWindow();
    if (win && !win.isDestroyed()) win.webContents.send("reload");
  } catch (err) {
    console.error("Không thể tải lịch:", err.message);
    createWindow();
  }

  setInterval(async () => {
    try {
      await getSchedule();
      if (win && !win.isDestroyed()) win.webContents.send("reload");
    } catch (err) {
      console.error("Refresh fail:", err.message);
    }
  }, 12 * 60 * 60 * 1000);

  globalShortcut.register("Esc", () => {
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.hide();
    }
  });
});

// dọn shortcut khi thoát
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", (e) => e.preventDefault());
