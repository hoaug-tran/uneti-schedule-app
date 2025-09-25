const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

console.log("[preload] injected successfully:", __filename);

async function getStoreDir() {
  const userDataPath = await ipcRenderer.invoke("get-userData-path");
  return path.join(userDataPath, "store");
}

async function getScheduleFile() {
  const storeDir = await getStoreDir();
  return path.join(storeDir, "schedule.json");
}

async function getCookiesFile() {
  const storeDir = await getStoreDir();
  return path.join(storeDir, "cookies.txt");
}

contextBridge.exposeInMainWorld("scheduleAPI", {
  load: async () => {
    try {
      const scheduleFile = await getScheduleFile();
      if (!fs.existsSync(scheduleFile)) return null;
      const raw = fs.readFileSync(scheduleFile, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("[scheduleAPI.load] error:", err);
      return null;
    }
  },
  onReload: (cb) => {
    console.log("[scheduleAPI] registered reload listener");
    ipcRenderer.on("reload", () => cb());
  },
  cookiesExists: async () => {
    try {
      const cookiesFile = await getCookiesFile();
      return fs.existsSync(cookiesFile);
    } catch {
      return false;
    }
  },
});

contextBridge.exposeInMainWorld("widgetAPI", {
  hide: () => ipcRenderer.invoke("widget:hide"),
  quit: () => ipcRenderer.invoke("widget:quit"),
  refresh: () => ipcRenderer.invoke("widget:refresh"),
  login: () => ipcRenderer.invoke("widget:login"),
  onLogin: (cb) => ipcRenderer.on("login-success", cb),
});

contextBridge.exposeInMainWorld("statusAPI", {
  onStatus: (cb) => ipcRenderer.on("status", (_, msg) => cb(msg)),
});

contextBridge.exposeInMainWorld("updateAPI", {
  check: () => ipcRenderer.invoke("app:check-update"),
  install: () => ipcRenderer.invoke("app:install-update"),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  onUpdateToast: (cb) => ipcRenderer.on("toast-update", (_, msg) => cb(msg)),
});
