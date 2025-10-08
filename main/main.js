import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu } from "electron";
import AutoLaunch from "auto-launch";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

import { getStoreDir } from "../app/fetcher/storePath.js";
import { getSchedule, clearAllSchedules } from "../app/fetcher/getSchedule.js";
import { showLoginWindow } from "../app/fetcher/loginWindow.js";

autoUpdater.autoDownload = false;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

async function hasCookies() {
  try {
    const storeDir = getStoreDir();
    const cookiePath = path.join(storeDir, "cookies.txt");
    const stat = await fs.stat(cookiePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

let tray, win;
const autoLauncher = new AutoLaunch({
  name: "UNETI Schedule Widget",
  path: process.execPath,
});

ipcMain.handle("get-userData-path", () => app.getPath("userData"));

ipcMain.handle("widget:refresh", async () => {
  try {
    console.log("[IPC] widget:refresh -> clear & getSchedule(0)");
    await clearAllSchedules();
    await getSchedule(0);
    win?.webContents.send("status", "Lịch đã sẵn sàng");
    win?.webContents.send("reload");
  } catch (err) {
    console.warn("[widget:refresh] fail:", err);
    const msg = String(err || "");
    if (msg.includes("Cookie hết hạn") || msg.includes("No cookies")) {
      win?.webContents.send(
        "status",
        "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."
      );
      win?.webContents.send("login-required");
    } else {
      win?.webContents.send(
        "status",
        "Không tải được lịch, đang dùng dữ liệu cũ."
      );
      win?.webContents.send("reload");
    }
  }
});

ipcMain.handle("widget:hide", () => win?.hide());
ipcMain.handle("widget:quit", () => app.quit());

ipcMain.handle("widget:login", async () => {
  try {
    console.log("[IPC] widget:login : open login window");
    await showLoginWindow(win);
    await clearAllSchedules();
    await getSchedule(0);
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
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

  if (isDev) {
    console.log("[mock] skip real checkForUpdates (dev mode)");
    return { update: false, version: app.getVersion() };
  }

  console.log("[autoUpdater] Checking for updates...");
  const timeoutMs = 7000;

  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              timeout: true,
            }),
          ms
        )
      ),
    ]);

  try {
    const result = await withTimeout(autoUpdater.checkForUpdates(), timeoutMs);

    if (result.timeout) {
      console.warn("[autoUpdater] checkForUpdates() timed out");
      return { update: false, version: app.getVersion() };
    }

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
    console.error("[autoUpdater] check update error:", e);
    return { error: e?.message ?? String(e) };
  }
});

ipcMain.handle("app:install-update", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return true;
  } catch (e) {
    console.error("install update error:", e);
    return false;
  }
});

ipcMain.handle("app:confirm-install", async () => {
  try {
    await clearAllSchedules();
    app.removeAllListeners("window-all-closed");
    app.quit();
    autoUpdater.quitAndInstall(false, true);
    return true;
  } catch (e) {
    console.error("confirm install error:", e);
    return false;
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle("widget:fetch-week", async (_, offset, baseIso) => {
  try {
    console.log("[IPC] widget:fetch-week offset:", offset, "baseIso:", baseIso);
    const data = await getSchedule(offset, baseIso || null);
    return data;
  } catch (err) {
    console.warn("fetch-week error:", err);
    return null;
  }
});

ipcMain.handle("window:resize-height", (_, height) => {
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    const newHeight = Math.max(600, Math.min(900, Math.round(height)));
    win.setBounds({ ...bounds, height: newHeight });
    return { ok: true, height: newHeight };
  }
  return { ok: false };
});

let stallTimer = null;
let lastTransferred = 0;
let downloading = false;

function resetStallWatch() {
  if (stallTimer) clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    if (downloading) {
      win?.webContents.send(
        "update:error",
        "Mạng không ổn định, tải cập nhật bị gián đoạn. Vui lòng kiểm tra kết nối và thử lại."
      );
      downloading = false;
      lastTransferred = 0;
    }
  }, 20000);
}

autoUpdater.on("download-progress", (p) => {
  downloading = true;
  const { percent, transferred, total, bytesPerSecond } = p;
  win?.webContents.send("update:progress", {
    percent,
    transferred,
    total,
    bytesPerSecond,
  });
  if (transferred !== lastTransferred) {
    lastTransferred = transferred;
    resetStallWatch();
  }
});

autoUpdater.on("update-downloaded", () => {
  downloading = false;
  if (stallTimer) clearTimeout(stallTimer);
  win?.webContents.send("update:downloaded");
});

autoUpdater.on("error", (err) => {
  downloading = false;
  if (stallTimer) clearTimeout(stallTimer);
  win?.webContents.send("update:error", err?.message ?? String(err));
});

function createWindow() {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    width: 800,
    height: 650,
    maxHeight: 900,
    minHeight: 600,
    show: true,
    backgroundColor: "#141414",
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "../app/index.html"));

  win.webContents.on("did-finish-load", () => {
    console.log("[main] did-finish-load -> gửi reload");
    win?.webContents.send(
      "status",
      '<span class="loading-text">Đang tải</span>'
    );
    win?.webContents.send("reload");
  });

  win.on("closed", () => (win = null));
  win.on("blur", () => win?.hide());

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      if (win.isVisible()) win.hide();
    }
  });

  return win;
}

async function createTray() {
  const iconPath = path.join(__dirname, "../app/assets/uneti.ico");
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip("UNETI Lịch học");

  tray.on("click", () => {
    if (!win || win.isDestroyed()) createWindow();
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
    { label: "Thoát", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
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

app.whenReady().then(async () => {
  await createTray();
  createWindow();

  const hasCookie = await hasCookies();
  if (hasCookie) {
    console.log("[main] Cookie exists, start fetch after clear");
    try {
      await clearAllSchedules();
      await new Promise((r) => setTimeout(r, 300));
      await getSchedule(0);
      await getSchedule(1);
      console.log("[main] fetching in background!");
    } catch (err) {
      console.warn("[main] fetch in background fail:", err.message);
    }
  } else {
    console.warn("[main] not have cookies, must be login again");
    win?.webContents.send("status", "Chưa đăng nhập, vui lòng đăng nhập.");
    win?.webContents.send("login-required");
  }

  if (app.isPackaged) {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (
        result?.updateInfo?.version &&
        result.updateInfo.version !== app.getVersion()
      ) {
        win?.webContents.send(
          "toast-update",
          `Đã có bản cập nhật mới (v${result.updateInfo.version}). Bấm để cập nhật ngay.`
        );
      }
    } catch (e) {
      console.warn("[autoUpdater] initial check failed:", e.message);
    }
  }

  function inActiveHours() {
    const h = new Date().getHours();
    return h >= 6 && h <= 23;
  }

  setInterval(async () => {
    if (!inActiveHours()) return;
    try {
      await getSchedule(0);
      win?.webContents.send("reload");
    } catch (err) {
      console.error("[main] autoRefresh current week fail:", err);
    }
  }, 60 * 60 * 1000);

  setInterval(async () => {
    if (!inActiveHours()) return;
    try {
      await getSchedule(1);
      win?.webContents.send("reload");
    } catch (err) {
      console.error("[main] autoRefresh next week fail:", err);
    }
  }, 6 * 60 * 60 * 1000);
});

app.on("window-all-closed", (e) => e.preventDefault());
