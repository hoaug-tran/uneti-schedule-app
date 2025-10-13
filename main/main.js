import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  ipcMain,
  Menu,
  screen,
  powerMonitor,
  session,
} from "electron";
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

function attachCookieAutoPersist() {
  const ses = session.fromPartition("persist:uneti-session");

  // tránh ghi file quá dày
  let debounce;
  const persist = async () => {
    try {
      const all = await ses.cookies.get({ domain: "sinhvien.uneti.edu.vn" });
      const dir = getStoreDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "cookies.json"),
        JSON.stringify(all, null, 2),
        "utf8"
      );
      await fs.writeFile(
        path.join(dir, "cookies.txt"),
        all.map((c) => `${c.name}=${c.value}`).join("; "),
        "utf8"
      );
      console.log(`[cookies] persisted ${all.length} cookies`);
    } catch (e) {
      console.warn("[cookies] persist fail:", e?.message || e);
    }
  };

  ses.cookies.on("changed", (_evt, cookie) => {
    if (!cookie?.domain?.includes("uneti.edu.vn")) return;
    clearTimeout(debounce);
    debounce = setTimeout(persist, 300);
  });
}

async function hasCookies() {
  try {
    const dir = getStoreDir();
    const txt = path.join(dir, "cookies.txt");
    const json = path.join(dir, "cookies.json");
    const [a, b] = await Promise.all([
      fs
        .stat(txt)
        .then((s) => s.isFile())
        .catch(() => false),
      fs
        .stat(json)
        .then((s) => s.isFile())
        .catch(() => false),
    ]);
    return a || b;
  } catch {
    return false;
  }
}

let tray, win;
const autoLauncher = new AutoLaunch({
  name: "UNETI Schedule Widget",
  path: process.execPath,
});

async function ensureCookiesBootstrapped() {
  const ses = session.fromPartition("persist:uneti-session");
  const exists = await ses.cookies.get({ domain: "sinhvien.uneti.edu.vn" });
  if (exists && exists.length > 0) return;
  try {
    const storeDir = getStoreDir();
    const jsonPath = path.join(storeDir, "cookies.json");
    const txtPath = path.join(storeDir, "cookies.txt");
    if (
      await fs
        .stat(jsonPath)
        .then(() => true)
        .catch(() => false)
    ) {
      const cookies = JSON.parse(await fs.readFile(jsonPath, "utf8"));
      for (const c of cookies) {
        try {
          await ses.cookies.set({
            name: c.name,
            value: c.value,
            domain: c.domain || "sinhvien.uneti.edu.vn",
            path: c.path || "/",
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            expirationDate: c.expirationDate,
            sameSite: c.sameSite || "no_restriction",
            url: "https://sinhvien.uneti.edu.vn",
          });
        } catch {}
      }
      try {
        await ses.flushStorageData();
      } catch {}
      console.log("[main] cookies restored from cookies.json");
      return;
    }
    if (
      await fs
        .stat(txtPath)
        .then(() => true)
        .catch(() => false)
    ) {
      const header = (await fs.readFile(txtPath, "utf8")).replace(/\r?\n/g, "");
      for (const kv of header.split(";")) {
        const [name, ...rest] = kv.trim().split("=");
        const value = (rest.join("=") || "").trim();
        if (!name || !value) continue;
        try {
          await ses.cookies.set({
            url: "https://sinhvien.uneti.edu.vn",
            name,
            value,
          });
        } catch {}
      }
      try {
        await ses.flushStorageData();
      } catch {}
      console.log("[main] cookies restored from cookies.txt");
    }
  } catch {}
}

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

    win?.webContents.send("login-success");
    win?.webContents.send("status", "Đăng nhập thành công, đang tải lịch...");
    await clearAllSchedules();
    try {
      await getSchedule(0);
      await getSchedule(1);
    } catch (e) {
      console.warn(
        "[widget:login] getSchedule after login failed:",
        e?.message || e
      );
    }

    win?.webContents.send("status", "Lịch đã sẵn sàng");
    win?.webContents.send("reload");

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
    let adjustedIso = null;
    if (baseIso) {
      const d = new Date(baseIso);
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + (Number(offset) || 0) * 7);
        adjustedIso = d.toISOString();
        offset = 0;
      }
    }
    const data = await getSchedule(offset, adjustedIso);
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
  let blurTimer = null;
  win.on("blur", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (win && !win.isDestroyed() && !win.isFocused()) win.hide();
    }, 150);
  });

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
    if (!win || win.isDestroyed()) {
      createWindow();
      setTimeout(() => showWindow(), 50);
      return;
    }
    if (win.isVisible()) win.hide();
    else showWindow();
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
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = win.getBounds();
  const width = bounds.width;
  const height = bounds.height;
  const margin = 12;
  let x = Math.min(
    Math.max(display.workArea.x, cursor.x - Math.round(width / 2)),
    display.workArea.x + display.workArea.width - width
  );
  let y = Math.min(
    Math.max(display.workArea.y, cursor.y - height - margin),
    display.workArea.y + display.workArea.height - height
  );
  win.setBounds({ x, y, width, height });
  win.show();
  try {
    win.focus();
  } catch {}
}

app.whenReady().then(async () => {
  await createTray();
  createWindow();
  await ensureCookiesBootstrapped();
  attachCookieAutoPersist();
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
      await getSchedule(1);
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

  powerMonitor.on("resume", async () => {
    try {
      await ensureCookiesBootstrapped();
      await getSchedule(0);
      win?.webContents.send("reload");
    } catch (e) {
      console.warn("[powerMonitor] resume refresh fail:", e?.message || e);
    }
  });
});

app.on("window-all-closed", (e) => e.preventDefault());

app.on("before-quit", async () => {
  try {
    const ses = session.fromPartition("persist:uneti-session");
    await ses.flushStorageData();
  } catch {}
});

app.on("second-instance", () => {
  if (win && !win.isDestroyed()) {
    showWindow();
  } else {
    createWindow();
  }
});
