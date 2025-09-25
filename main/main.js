import { app } from "./bootstrap.js";
import {
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
import pkg from "electron-updater";
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray, win, refreshTimer;
const autoLauncher = new AutoLaunch({
  name: "UNETI Schedule Widget",
  path: process.execPath,
});

ipcMain.handle("get-userData-path", () => app.getPath("userData"));

ipcMain.handle("widget:refresh", async () => {
  try {
    await ensureScheduleReady({ gentle: true });
  } finally {
    win?.webContents.send("reload");
  }
});
ipcMain.handle("widget:hide", () => win?.hide());
ipcMain.handle("widget:quit", () => app.quit());

ipcMain.handle("widget:login", async () => {
  await showLoginWindow(win);
  await ensureScheduleReady({ gentle: false });
  win?.webContents.send("reload");
  win?.webContents.send("login-success");

  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
});

ipcMain.handle("app:check-update", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (
      result?.updateInfo?.version &&
      result.updateInfo.version !== app.getVersion()
    ) {
      win?.webContents.send(
        "toast-update",
        `Có bản cập nhật mới (v${result.updateInfo.version}). Bấm để cập nhật ngay.`
      );
      return { update: true, version: result.updateInfo.version };
    }
    return { update: false, version: app.getVersion() };
  } catch (e) {
    console.error("check update error:", e);
    return { error: e?.message ?? String(e) };
  }
});

ipcMain.handle("app:install-update", async () => {
  try {
    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall();
    return true;
  } catch (e) {
    console.error("install update error:", e);
    return false;
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

async function ensureScheduleReady({ gentle = false } = {}) {
  try {
    win?.webContents.send("status", "Đang tải lịch...");
    const data = await getSchedule();
    win?.webContents.send("status", "Lịch đã sẵn sàng");
    return data;
  } catch (err) {
    const msg = String(err?.message || err);
    console.warn("[ensureScheduleReady] fetch failed:", msg);

    if (/Cookies not found|AUTH|HTTP\s*401|hết hạn/i.test(msg)) {
      win?.webContents.send(
        "status",
        "Phiên đăng nhập đã hết hạn. Bấm “Đăng nhập lại” để cập nhật lịch."
      );
      return null;
    }

    win?.webContents.send(
      "status",
      "Không tải được lịch, đang dùng dữ liệu cũ. Bạn có thể bấm Làm mới."
    );
    return null;
  }
}

function createWindow() {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    width: 800,
    height: 635,
    backgroundColor: "#141414",
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
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
  win.on("blur", () => win?.hide());

  return win;
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  const pos = tray.getBounds();
  const bounds = win.getBounds();
  const width = bounds.width;
  const height = bounds.height;
  const x = Math.max(0, pos.x - width + 20);
  const y = Math.max(0, pos.y - height - 10);
  win.setBounds({ x, y, width, height });
  win.showInactive();
}

function sendToRenderer(channel, msg) {
  if (win && !win.isDestroyed()) {
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => {
        win.webContents.send(channel, msg);
      });
    } else {
      win.webContents.send(channel, msg);
    }
  }
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
    { type: "separator" },
    { label: "Thoát", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  await createTray();

  try {
    await ensureScheduleReady({ gentle: true });
    createWindow();
  } catch {
    createWindow();
  }

  autoUpdater.checkForUpdates().catch(() => {});

  // refresh data mỗi 12h
  refreshTimer = setInterval(async () => {
    try {
      await ensureScheduleReady({ gentle: true });
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
