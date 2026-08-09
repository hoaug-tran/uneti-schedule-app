const { contextBridge, ipcRenderer } = require("electron");

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYMDLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekKey(date = new Date()) {
  return formatYMDLocal(startOfWeek(date));
}

console.log("[preload] injected successfully");

async function getUserDataPath() {
  return ipcRenderer.invoke("get-userData-path");
}

contextBridge.exposeInMainWorld("scheduleAPI", {
  load: async (isoDate) => {
    return ipcRenderer.invoke("schedule:load-file", isoDate);
  },
  cookiesExists: async () => {
    return ipcRenderer.invoke("schedule:cookies-exists");
  },
  onReload: (cb) => ipcRenderer.on("reload", () => cb?.()),
});

contextBridge.exposeInMainWorld("statusAPI", {
  onStatus: (cb) => ipcRenderer.on("status", (_evt, msg) => cb?.(msg)),
  onToastWarning: (cb) => ipcRenderer.on("toast-warning", (_evt, key) => cb?.(key)),
  onToastStaleLogout: (cb) => ipcRenderer.on("toast-stale-logout", (_evt, key) => cb?.(key)),
});

contextBridge.exposeInMainWorld("widgetAPI", {
  hide: () => ipcRenderer.invoke("widget:hide"),
  quit: () => ipcRenderer.invoke("widget:quit"),
  refresh: () => ipcRenderer.invoke("widget:refresh"),
  fetchWeek: (offset, baseIso) =>
    ipcRenderer.invoke("widget:fetch-week", offset, baseIso),
  login: () => ipcRenderer.invoke("widget:login"),
  logout: () => ipcRenderer.invoke("widget:logout"),
  onLogin: (cb) => ipcRenderer.on("login-success", () => cb?.()),
  onLoginRequired: (cb) => ipcRenderer.on("login-required", () => cb?.()),
  resizeHeight: (height) => ipcRenderer.invoke("window:resize-height", height),
});

contextBridge.exposeInMainWorld("academicAPI", {
  load: () => ipcRenderer.invoke("academic:load-file"),
  refresh: () => ipcRenderer.invoke("academic:refresh"),
  plan: (target) => ipcRenderer.invoke("gpa:plan", target),
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
  onChecking: (cb) => ipcRenderer.on("update:checking", () => cb?.()),
  onNotAvailable: (cb) => ipcRenderer.on("update:not-available", () => cb?.()),
  onProgress: (cb) => ipcRenderer.on("update:progress", (_evt, p) => cb?.(p)),
  onDownloaded: (cb) => ipcRenderer.on("update:downloaded", () => cb?.()),
  onError: (cb) => ipcRenderer.on("update:error", (_evt, msg) => cb?.(msg)),
});

contextBridge.exposeInMainWorld("loggerAPI", {
  debug: (msg, context) => ipcRenderer.send("logger:log", "debug", msg, context),
  info: (msg, context) => ipcRenderer.send("logger:log", "info", msg, context),
  warn: (msg, context) => ipcRenderer.send("logger:log", "warn", msg, context),
  error: (msg, context) => ipcRenderer.send("logger:log", "error", msg, context),
});

contextBridge.exposeInMainWorld("appAPI", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  setLanguage: (lang) => ipcRenderer.send("i18n:set-lang", lang),
});

contextBridge.exposeInMainWorld("networkAPI", {
  isOnline: () => navigator.onLine,
});
