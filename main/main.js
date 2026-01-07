import dotenv from "dotenv";
dotenv.config();

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
  shell,
  dialog,
} from "electron";
import AutoLaunch from "auto-launch";
import pkg from "electron-updater";
const { autoUpdater } = pkg;

import { CONFIG } from "../app/config.js";
import { getSchedule, clearAllSchedules } from "../app/fetcher/getSchedule.js";
import { showLoginWindow } from "../app/fetcher/loginWindow.js";
import {
  bootstrapCookiesToSession,
  attachCookieAutoPersist,
  getCookiePartition,
  hasCookies,
  areCookiesValid,
} from "../app/fetcher/cookieManager.js";
import {
  startCookieRefreshService,
  stopCookieRefreshService,
} from "../app/fetcher/cookieRefresh.js";
import { closeDatabase, loadSchedule } from "../app/fetcher/scheduleDb.js";
import { i18nInstance as i18n } from "../app/utils/i18n.js";

import { logger } from "../app/utils/logger.js";
import { store } from "../app/utils/store.js";

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";
if (isDev && process.env.USE_LOCAL_UPDATE_SERVER === "true") {
  autoUpdater.setFeedURL({
    provider: "generic",
    url: "http://localhost:8080"
  });
  logger.info("[autoUpdater] Using local update server: http://localhost:8080");
}

autoUpdater.autoDownload = false;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let tray, win;
const autoLauncher = new AutoLaunch({
  name: CONFIG.APP_NAME,
  path: process.execPath,
});

ipcMain.handle("get-userData-path", () => app.getPath("userData"));

ipcMain.handle("schedule:cookies-exists", async () => {
  return await hasCookies();
});

ipcMain.on("logger:log", (_, level, message) => {
  if (logger[level]) {
    logger[level](`[renderer] ${message}`);
  } else {
    logger.info(`[renderer] ${message}`);
  }
});

ipcMain.handle("widget:refresh", async () => {
  try {
    logger.debug("[IPC] widget:refresh");

    const cookiesValid = await areCookiesValid();
    logger.debug(`[widget:refresh] areCookiesValid result: ${cookiesValid}`);

    if (!cookiesValid) {
      logger.warn("[widget:refresh] Cookies expired or missing, triggering login");
      win?.webContents.send("login-required");
      return;
    }

    logger.info("[widget:refresh] Cookies valid, refreshing schedule");

    await getSchedule(0);
    await getSchedule(1);

    win?.webContents.send("reload");
  } catch (err) {
    logger.warn(`[widget:refresh] fail: ${err?.message}`);
    const msg = String(err || "");
    if (msg.includes("Cookie expired") || msg.includes("No cookies")) {
      win?.webContents.send("login-required");
    } else {
      win?.webContents.send("reload");
    }
  }
});

ipcMain.handle("widget:hide", () => win?.hide());
ipcMain.handle("widget:quit", () => {
  app.isQuitting = true;
  app.removeAllListeners("window-all-closed");
  app.quit();
});

ipcMain.handle("widget:login", async () => {
  try {
    logger.debug("[IPC] widget:login START");
    await showLoginWindow(win);
    logger.debug("[IPC] widget:login window closed, cookies saved");
    startCookieRefreshService();

    logger.debug("[IPC] widget:login sending login-success event");
    win?.webContents.send("login-success");
    win?.webContents.send("status", "Login success, loading schedule...");

    logger.debug("[IPC] widget:login clearing schedules");
    await clearAllSchedules();

    logger.debug("[IPC] widget:login fetching schedule");
    try {
      await getSchedule(0);
      logger.debug("[IPC] widget:login fetched offset 0");
      await getSchedule(1);
      logger.debug("[IPC] widget:login fetched offset 1");
    } catch (e) {
      logger.warn(
        `[widget:login] getSchedule after login failed: ${e?.message || e}`
      );
    }

    logger.debug("[IPC] widget:login sending status ready + reload");
    win?.webContents.send("status", "Schedule ready");
    win?.webContents.send("reload");

    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
    logger.debug("[IPC] widget:login COMPLETE");
  } catch (err) {
    logger.error(`[IPC] widget:login error: ${err?.message}`);
    win?.webContents.send("status", "Login failed.");
  }
});

ipcMain.handle("app:check-update", async () => {
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

  if (isDev) {
    const mockState = process.env.MOCK_UPDATE;

    if (mockState === 'available') {
      logger.debug("[mock] Simulating update available");
      return { update: true, version: "1.6.0" };
    } else if (mockState === 'error') {
      logger.debug("[mock] Simulating update error");
      return { error: "Network error" };
    }

    logger.debug("[mock] skip checkForUpdates (dev mode)");
    return { update: false, version: app.getVersion() };
  }

  logger.info("[autoUpdater] Checking for updates...");
  const timeoutMs = 10000;

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
      logger.warn("[autoUpdater] checkForUpdates() timed out");
      return { error: "Request timed out" };
    }

    if (
      result?.updateInfo?.version &&
      result.updateInfo.version !== app.getVersion()
    ) {
      logger.info(`[autoUpdater] Update available: ${result.updateInfo.version}`);
      return { update: true, version: result.updateInfo.version };
    }

    logger.info("[autoUpdater] No update available");
    return { update: false, version: app.getVersion() };
  } catch (e) {
    logger.error(`[autoUpdater] check update error: ${e?.message}`, { stack: e?.stack });
    return { error: e?.message ?? String(e) };
  }
});

ipcMain.handle("app:install-update", async () => {
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

  if (isDev && process.env.MOCK_UPDATE === 'available') {
    logger.debug("[mock] Simulating download with progress");

    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      win?.webContents.send("update:progress", {
        percent: i,
        transferred: i * 1024 * 1024,
        total: 100 * 1024 * 1024
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    win?.webContents.send("update:downloaded");
    logger.debug("[mock] Download complete");
    return true;
  }
  try {
    downloading = true;
    lastTransferred = 0;
    resetStallWatch();
    await autoUpdater.downloadUpdate();
    return true;
  } catch (e) {
    logger.error(`install update error: ${e?.message}`);
    downloading = false;
    if (stallTimer) clearTimeout(stallTimer);
    return false;
  }
});

ipcMain.handle("app:confirm-install", async () => {
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

  if (isDev && process.env.MOCK_UPDATE === 'available') {
    logger.debug("[mock] Simulating app restart for update install");
    dialog.showMessageBox(win, {
      type: "info",
      title: "Mock Update",
      message: "In production, app would restart now to install update v1.6.0",
      buttons: ["OK"]
    });
    return true;
  }
  try {
    logger.info("[autoUpdater] Installing update - preparing to quit");

    stopCookieRefreshService();

    BrowserWindow.getAllWindows().forEach(w => {
      try {
        w.destroy();
      } catch (e) {
        logger.warn(`Failed to destroy window: ${e?.message}`);
      }
    });

    app.removeAllListeners("window-all-closed");
    logger.info("[autoUpdater] Calling quitAndInstall");
    autoUpdater.quitAndInstall(false, true);

    return true;
  } catch (e) {
    logger.error(`confirm install error: ${e?.message}`);
    return false;
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle("widget:fetch-week", async (_, offset, baseIso) => {
  try {
    logger.debug(`[IPC] widget:fetch-week offset: ${offset} baseIso: ${baseIso}`);
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
    logger.warn(`fetch-week error: ${err?.message}`);
    return null;
  }
});

ipcMain.handle("window:resize-height", (_, height) => {
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
    const newHeight = Math.max(
      CONFIG.WINDOW_MIN_HEIGHT,
      Math.min(CONFIG.WINDOW_MAX_HEIGHT, Math.round(height))
    );
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
        "Network unstable, update interrupted. Please check connection and retry."
      );
      downloading = false;
      lastTransferred = 0;
    }
  }, CONFIG.NETWORK_STALL_TIMEOUT_MS);
}

autoUpdater.on("download-progress", (p) => {
  logger.debug(
    `[autoUpdater] progress: ${p.percent?.toFixed(1)}% (${(
      p.transferred /
      1024 /
      1024
    ).toFixed(1)}MB / ${(p.total / 1024 / 1024).toFixed(1)}MB)`
  );

  if (p.transferred > lastTransferred) {
    lastTransferred = p.transferred;
    resetStallWatch();
  }

  win?.webContents.send("update:progress", {
    percent: p.percent,
    transferred: p.transferred,
    total: p.total,
    bytesPerSecond: p.bytesPerSecond,
  });
});

autoUpdater.on("update-downloaded", () => {
  logger.info("[autoUpdater] update downloaded, ready to install");
  downloading = false;
  if (stallTimer) clearTimeout(stallTimer);
  win?.webContents.send("update:downloaded");

  win?.webContents.executeJavaScript(`sessionStorage.setItem('justUpdated', 'true')`).catch(() => { });
});

autoUpdater.on("error", (err) => {
  const msg = err?.message || String(err);
  logger.error(`[autoUpdater] error: ${msg}`);

  downloading = false;
  if (stallTimer) clearTimeout(stallTimer);

  let userMessage = "Lỗi khi kiểm tra cập nhật";
  if (msg.includes("ENOTFOUND") || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED")) {
    userMessage = "Không thể kết nối đến server. Vui lòng kiểm tra mạng.";
  } else if (msg.includes("timeout")) {
    userMessage = "Kết nối quá chậm. Vui lòng thử lại sau.";
  }

  win?.webContents.send("update:error", userMessage);
});

function createWindow() {
  if (win && !win.isDestroyed()) return win;

  win = new BrowserWindow({
    width: CONFIG.WINDOW_DEFAULT_WIDTH,
    height: CONFIG.WINDOW_DEFAULT_HEIGHT,
    maxWidth: CONFIG.WINDOW_DEFAULT_WIDTH,
    maxHeight: CONFIG.WINDOW_MAX_HEIGHT,
    minHeight: CONFIG.WINDOW_MIN_HEIGHT,
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

  const isDev = !app.isPackaged || process.env.NODE_ENV === "development";
  if (!isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        event.preventDefault();
      }
      if (input.control && input.shift && input.key === 'I') {
        event.preventDefault();
      }
      if (input.control && input.shift && input.key === 'J') {
        event.preventDefault();
      }
    });
  }

  win.webContents.on("did-finish-load", () => {
    logger.debug("[main] did-finish-load");
    win?.webContents.send(
      "status",
      '<span class="loading-text">Loading</span>'
    );
    win?.webContents.send("reload");
  });

  win.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => (win = null));

  let blurTimer = null;
  win.on("blur", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      if (win && !win.isDestroyed() && !win.isFocused()) win.hide();
    }, CONFIG.WINDOW_BLUR_HIDE_DELAY_MS);
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
  const appVersion = app.getVersion();
  const iconPath = path.join(__dirname, "../app/assets/uneti.ico");
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip("UNETI Schedule Widget");

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
      label: i18n.t("trayStartWithWindows"),
      type: "checkbox",
      checked: enabled,
      click: async (menuItem) => {
        if (menuItem.checked) await autoLauncher.enable();
        else await autoLauncher.disable();
      },
    },
    { type: "separator" },
    {
      label: i18n.t("trayClearSchedule"),
      click: async () => {
        try {
          await clearAllSchedules();
          logger.info("[Tray] Schedule data cleared by user");
          if (win && !win.isDestroyed()) {
            win.webContents.send("login-required");
          }
        } catch (err) {
          logger.error(`[Tray] Failed to clear schedule data: ${err?.message}`);
        }
      },
    },
    {
      label: i18n.t("trayClearUserData"),
      click: async () => {
        try {
          const { clearAllCookies } = await import("../app/fetcher/cookieManager.js");
          await clearAllCookies();
          await clearAllSchedules();
          logger.info("[Tray] User data cleared by user");
          win?.webContents.send("login-required");
        } catch (err) {
          logger.error(`[Tray] Failed to clear user data: ${err?.message}`);
        }
      },
    },
    {
      label: i18n.t("trayViewLogs"),
      click: () => {
        const logFile = logger.getCurrentLogFile();
        if (logFile) {
          shell.openPath(logFile).catch((err) => {
            logger.error(`[Tray] Failed to open log file: ${err?.message}`);
          });
        }
      },
    },
    {
      label: i18n.t("trayAbout"),
      submenu: [
        {
          label: `Widget Lịch học UNETI v${appVersion}`,
          enabled: false
        },
        { type: "separator" },
        {
          label: `${i18n.t("aboutDeveloper")}: Trần Kính Hoàng (hoaug)`,
          enabled: false
        },
        {
          label: "GitHub: hoaug-tran",
          click: () => {
            shell.openExternal("https://github.com/hoaug-tran").catch(err => {
              logger.error(`Failed to open GitHub: ${err?.message}`);
            });
          }
        },
        {
          label: "Facebook: hoaugtr",
          click: () => {
            shell.openExternal("https://facebook.com/hoaugtr").catch(err => {
              logger.error(`Failed to open Facebook: ${err?.message}`);
            });
          }
        },
        {
          label: `${i18n.t("aboutEmail")}: hi@trkhoang.com`,
          click: () => {
            shell.openExternal("mailto:hi@trkhoang.com").catch(err => {
              logger.error(`Failed to open email: ${err?.message}`);
            });
          }
        },
        { type: "separator" },
        {
          label: "© 2026 Trần Kính Hoàng",
          enabled: false
        }
      ]
    },
    { type: "separator" },
    {
      label: i18n.t("trayAutoUpdate"),
      type: "checkbox",
      checked: store.get("autoUpdate", true),
      click: (menuItem) => {
        store.set("autoUpdate", menuItem.checked);
        logger.info(`[Tray] Auto-update ${menuItem.checked ? 'enabled' : 'disabled'}`);
        createTray();
      },
    },
    { type: "separator" },
    {
      label: i18n.t("trayExit"), click: () => {
        app.isQuitting = true;
        app.removeAllListeners("window-all-closed");
        app.quit();
      }
    },
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
  const margin = CONFIG.TRAY_SHOW_POSITION_MARGIN;

  let x = Math.min(
    Math.max(display.workArea.x, cursor.x - Math.round(width / 2)),
    display.workArea.x + display.workArea.width - width
  );

  let y = display.workArea.y + display.workArea.height - height - margin;

  win.setBounds({ x, y, width, height });
  win.show();
  try {
    win.focus();
  } catch { }
}

app.whenReady().then(async () => {
  await createTray();
  createWindow();
  await bootstrapCookiesToSession();
  attachCookieAutoPersist();
  const hasCookie = await hasCookies();
  if (hasCookie) {
    logger.info("[main] Cookies found, fetching schedule");
    startCookieRefreshService();
    try {
      await getSchedule(0);
      await getSchedule(1);
      logger.info("[main] fetched schedule in background");
    } catch (err) {
      logger.warn(`[main] fetch in background failed: ${err?.message}`);
    }
  } else {
    logger.warn("[main] no cookies, must login first");
    win?.webContents.send("status", "Not logged in, please login.");
    win?.webContents.send("login-required");
  }

  const autoUpdateEnabled = store.get("autoUpdate", true);
  if (autoUpdateEnabled && !isDev) {
    setTimeout(async () => {
      try {
        logger.info("[autoUpdater] Checking for updates on startup");
        await autoUpdater.checkForUpdates();
      } catch (err) {
        logger.warn(`[autoUpdater] initial check failed: ${err?.message}`);
      }
    }, 5000);

    setInterval(async () => {
      const isStillEnabled = store.get("autoUpdate", true);
      if (isStillEnabled) {
        try {
          logger.info("[autoUpdater] Periodic update check (6h interval)");
          await autoUpdater.checkForUpdates();
        } catch (err) {
          logger.warn(`[autoUpdater] periodic check failed: ${err?.message}`);
        }
      }
    }, 6 * 60 * 60 * 1000);
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
          `New update available (v${result.updateInfo.version}). Click to update.`
        );
      }
    } catch (e) {
      logger.warn(`[autoUpdater] initial check failed: ${e?.message}`);
    }
  }

  function inActiveHours() {
    const h = new Date().getHours();
    return h >= CONFIG.ACTIVE_HOURS_START && h <= CONFIG.ACTIVE_HOURS_END;
  }

  setInterval(async () => {
    if (!inActiveHours()) return;
    try {
      await getSchedule(0);
      await getSchedule(1);
      win?.webContents.send("reload");
    } catch (err) {
      logger.warn(`[main] autoRefresh current week failed: ${err?.message}`);
    }
  }, CONFIG.AUTO_REFRESH_INTERVAL_MS);

  setInterval(async () => {
    if (!inActiveHours()) return;
    try {
      await getSchedule(1);
      win?.webContents.send("reload");
    } catch (err) {
      logger.warn(`[main] autoRefresh next week failed: ${err?.message}`);
    }
  }, CONFIG.AUTO_REFRESH_NEXT_WEEK_MS);

  powerMonitor.on("resume", async () => {
    try {
      await bootstrapCookiesToSession();
      await getSchedule(0);
      win?.webContents.send("reload");
    } catch (e) {
      logger.warn(`[powerMonitor] resume refresh failed: ${e?.message}`);
    }
  });
});

app.on("window-all-closed", (e) => e.preventDefault());

app.on("before-quit", async () => {
  try {
    stopCookieRefreshService();
    const ses = session.fromPartition(getCookiePartition());
    await ses.flushStorageData();
    closeDatabase();
  } catch (err) {
    logger.warn(`[before-quit] cleanup failed: ${err?.message}`);
  }
});

app.on("second-instance", () => {
  if (win && !win.isDestroyed()) {
    showWindow();
  } else {
    createWindow();
  }
});

process.on("uncaughtException", (error) => {
  logger.error(`[UNCAUGHT EXCEPTION] ${error.message}`, { stack: error.stack });
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`[UNHANDLED REJECTION] ${reason}`, { promise: String(promise) });
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
