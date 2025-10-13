import { contextBridge, ipcRenderer } from "electron";
import fs from "fs";
import path from "path";
import { weekKey } from "../app/utils/date.js";

console.log("[preload] injected successfully (ESM):", import.meta.url);

async function getUserDataPath() {
  return ipcRenderer.invoke("get-userData-path");
}

async function getStoreDir() {
  const userDataPath = await getUserDataPath();
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
    if (!raw?.updatedAt) return true;
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
      const file = await getScheduleFile(isoDate);
      if (!fs.existsSync(file)) return null;
      const raw = fs.readFileSync(file, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("[scheduleAPI.load] error:", err);
      return null;
    }
  },
  cookiesExists: async () => {
    try {
      const storeDir = await getStoreDir();
      const txt = path.join(storeDir, "cookies.txt");
      const json = path.join(storeDir, "cookies.json");
      return fs.existsSync(txt) || fs.existsSync(json);
    } catch {
      return false;
    }
  },
  needsUpdate: scheduleNeedsUpdate,
  onReload: (cb) => ipcRenderer.on("reload", () => cb?.()),
});

contextBridge.exposeInMainWorld("statusAPI", {
  onStatus: (cb) => ipcRenderer.on("status", (_evt, msg) => cb?.(msg)),
});

contextBridge.exposeInMainWorld("widgetAPI", {
  hide: () => ipcRenderer.invoke("widget:hide"),
  quit: () => ipcRenderer.invoke("widget:quit"),
  refresh: () => ipcRenderer.invoke("widget:refresh"),
  fetchWeek: (offset, baseIso) =>
    ipcRenderer.invoke("widget:fetch-week", offset, baseIso),
  login: () => ipcRenderer.invoke("widget:login"),
  onLogin: (cb) => ipcRenderer.on("login-success", () => cb?.()),
  onLoginRequired: (cb) => ipcRenderer.on("login-required", () => cb?.()),
  resizeHeight: (height) => ipcRenderer.invoke("window:resize-height", height),
});

contextBridge.exposeInMainWorld("dateAPI", {
  weekKey: (isoDate) => {
    const d = isoDate ? new Date(isoDate) : new Date();
    return weekKey(d);
  },
});

contextBridge.exposeInMainWorld("updateAPI", {
  check: () => ipcRenderer.invoke("app:check-update"),
  install: () => ipcRenderer.invoke("app:install-update"),
  confirmInstall: () => ipcRenderer.invoke("app:confirm-install"),
  onUpdateToast: (cb) =>
    ipcRenderer.on("toast-update", (_evt, msg) => cb?.(msg)),
  onProgress: (cb) => ipcRenderer.on("update:progress", (_evt, p) => cb?.(p)),
  onDownloaded: (cb) => ipcRenderer.on("update:downloaded", () => cb?.()),
  onError: (cb) => ipcRenderer.on("update:error", (_evt, msg) => cb?.(msg)),
});

contextBridge.exposeInMainWorld("appAPI", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
});

contextBridge.exposeInMainWorld("scheduleAPI_ex", {
  cookiesExists: async () => {
    try {
      const storeDir = await getStoreDir();
      return (
        fs.existsSync(path.join(storeDir, "cookies.json")) ||
        fs.existsSync(path.join(storeDir, "cookies.txt"))
      );
    } catch {
      return false;
    }
  },
});
