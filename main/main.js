import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  globalShortcut,
  Menu,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { getSchedule } from "../app/fetcher/getSchedule.js";
import { showLoginWindow } from "../app/fetcher/loginWindow.js";
import AutoLaunch from "auto-launch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray, win, refreshTimer;
const autoLauncher = new AutoLaunch({
  name: "UNETI Schedule Widget",
  path: process.execPath,
});

async function ensureScheduleReady() {
  try {
    win?.webContents.send("status", "Đang tải lịch...");
    const data = await getSchedule();
    win?.webContents.send("status", "Lịch đã sẵn sàng");
    return data;
  } catch {
    win?.webContents.send("status", "Vui lòng đăng nhập UNETI...");
    await showLoginWindow(win);
    const data = await getSchedule();
    win?.webContents.send("status", "Lịch đã sẵn sàng");
    return data;
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
    },
  });

  win.loadFile(path.join(__dirname, "../app/index.html"));

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("status", "Đang khởi động...");
    win?.webContents.send("reload");
  });

  win.on("closed", () => (win = null));
  win.on("blur", () => win?.hide());

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

async function createTray() {
  const iconPath = path.join(__dirname, "../app/assets/uneti.ico");
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip("UNETI Lịch học");

  tray.on("click", () => {
    if (!win || win.isDestroyed()) return;
    win.isVisible() ? win.hide() : showWindow();
  });

  const enabled = await autoLauncher.isEnabled();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Khởi động cùng Windows",
      type: "checkbox",
      checked: enabled,
      click: async (menuItem) => {
        if (menuItem.checked) await autoLauncher.enable();
        else await autoLauncher.disable();
      },
    },
    { type: "separator" },
    {
      label: "Thoát",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(contextMenu);
}

ipcMain.handle("widget:refresh", async () => {
  await ensureScheduleReady().catch(() => {});
  win?.webContents.send("reload");
});

app.whenReady().then(async () => {
  await createTray();

  try {
    await ensureScheduleReady();
    createWindow();
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
    if (win?.isVisible()) win.hide();
  });
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (refreshTimer) clearInterval(refreshTimer);
});

app.on("window-all-closed", (e) => e.preventDefault());
