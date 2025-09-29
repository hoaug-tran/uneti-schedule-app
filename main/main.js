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
import { getScheduleB } from "../app/fetcher/getScheduleB.js";
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
    console.log("[IPC] widget:refresh -> getScheduleB(0)");
    await getScheduleB(0);
    win?.webContents.send("status", "Lịch đã sẵn sàng");
  } catch (err) {
    console.warn("[widget:refresh] fail:", err);
    win?.webContents.send(
      "status",
      "Không tải được lịch, đang dùng dữ liệu cũ."
    );
  } finally {
    win?.webContents.send("reload");
  }
});

ipcMain.handle("widget:hide", () => win?.hide());
ipcMain.handle("widget:quit", () => app.quit());

ipcMain.handle("widget:login", async () => {
  try {
    console.log("[IPC] widget:login -> mở cửa sổ login");
    await showLoginWindow(win);
    console.log("[IPC] widget:login -> gọi getScheduleB(0)");
    await getScheduleB(0);
    console.log("[IPC] widget:login -> fetch thành công");
    win?.webContents.send("reload");
    win?.webContents.send("login-success");

    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  } catch (err) {
    console.error("[widget:login] fail:", err);
    win?.webContents.send("status", "Đăng nhập thất bại.");
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

ipcMain.handle("widget:fetch-week", async (_, offset) => {
  try {
    console.log("[IPC] widget:fetch-week offset:", offset);
    const data = await getScheduleB(offset);
    console.log("[IPC] widget:fetch-week done, items:", data?.data?.length);
    return data;
  } catch (err) {
    console.warn("fetch-week error:", err);
    return null;
  }
});

function createWindow() {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    width: 800,
    height: 615,
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
    console.log("[main] did-finish-load -> gửi reload");
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
    console.log("[main] app ready -> gọi getScheduleB(0)");
    await getScheduleB(0);
    console.log("[main] getScheduleB ok!");
    createWindow();
  } catch (err) {
    console.error("[main] getScheduleB fail:", err);
    createWindow();
  }

  autoUpdater.checkForUpdates().catch(() => {});

  refreshTimer = setInterval(async () => {
    try {
      console.log("[main] refreshTimer -> gọi getScheduleB(0)");
      await getScheduleB(0);
      win?.webContents.send("reload");
    } catch (err) {
      console.error("[main] refreshTimer fail:", err);
    }
  }, 6 * 60 * 60 * 1000);

  globalShortcut.register("Esc", () => {
    if (win?.isVisible()) win.hide();
  });
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (refreshTimer) clearInterval(refreshTimer);
});

app.on("window-all-closed", (e) => e.preventDefault());
