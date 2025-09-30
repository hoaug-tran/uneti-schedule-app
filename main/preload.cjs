const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const { weekKey } = require("../app/utils/date.js");

console.log("[preload] injected successfully:", __filename);

async function getStoreDir() {
  const userDataPath = await ipcRenderer.invoke("get-userData-path");
  return path.join(userDataPath, "store");
}

async function getScheduleFile(isoDate) {
  const storeDir = await getStoreDir();
  const d = isoDate ? new Date(isoDate) : new Date();
  const key = weekKey(d);
  return path.join(storeDir, `schedule-${key}.json`);
}

function scheduleNeedsUpdate(file, maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!fs.existsSync(file)) return true;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!raw.updatedAt) return true;
    return Date.now() - raw.updatedAt > maxAgeMs;
  } catch {
    return true;
  }
}

async function getCookiesFile() {
  const storeDir = await getStoreDir();
  return path.join(storeDir, "cookies.txt");
}

contextBridge.exposeInMainWorld("scheduleAPI", {
  load: async (isoDate) => {
    try {
      const scheduleFile = await getScheduleFile(isoDate);
      if (!fs.existsSync(scheduleFile)) return null;
      const raw = fs.readFileSync(scheduleFile, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("[scheduleAPI.load] error:", err);
      return null;
    }
  },

  cookiesExists: async () => {
    const cookiesFile = await getCookiesFile();
    return fs.existsSync(cookiesFile);
  },
  needsUpdate: scheduleNeedsUpdate,
  onReload: (cb) => ipcRenderer.on("reload", () => cb()),
});

contextBridge.exposeInMainWorld("widgetAPI", {
  hide: () => ipcRenderer.invoke("widget:hide"),
  quit: () => ipcRenderer.invoke("widget:quit"),
  refresh: () => ipcRenderer.invoke("widget:refresh"),
  refreshWeek: (isoDate) => ipcRenderer.invoke("widget:refresh-week", isoDate),
  fetchWeek: (offset) => ipcRenderer.invoke("widget:fetch-week", offset),
  login: () => ipcRenderer.invoke("widget:login"),
  onLogin: (cb) => ipcRenderer.on("login-success", cb),
  onLoginRequired: (cb) => ipcRenderer.on("login-required", cb),
});

contextBridge.exposeInMainWorld("statusAPI", {
  onStatus: (cb) => ipcRenderer.on("status", (_, msg) => cb(msg)),
});

contextBridge.exposeInMainWorld("updateAPI", {
  check: () => ipcRenderer.invoke("app:check-update"),
  install: () => ipcRenderer.invoke("app:install-update"),
  confirmInstall: () => ipcRenderer.invoke("app:confirm-install"),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  onUpdateToast: (cb) => ipcRenderer.on("toast-update", (_, msg) => cb(msg)),

  onProgress: (cb) => ipcRenderer.on("update:progress", (_, p) => cb(p)),
  onDownloaded: (cb) => ipcRenderer.on("update:downloaded", cb),
  onError: (cb) => ipcRenderer.on("update:error", (_, msg) => cb(msg)),
});

contextBridge.exposeInMainWorld("dateAPI", {
  weekKey: (isoDate) => {
    const d = isoDate ? new Date(isoDate) : new Date();
    return weekKey(d);
  },
});

contextBridge.exposeInMainWorld("appAPI", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
});
