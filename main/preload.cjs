const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

async function getScheduleFile() {
  const userDataPath = await ipcRenderer.invoke("get-userData-path");
  return path.join(userDataPath, "store", "schedule.json");
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
  onReload: (cb) => ipcRenderer.on("reload", cb),
});

contextBridge.exposeInMainWorld("widgetAPI", {
  hide: () => ipcRenderer.invoke("widget:hide"),
  quit: () => ipcRenderer.invoke("widget:quit"),
  refresh: () => ipcRenderer.invoke("widget:refresh"),
});

contextBridge.exposeInMainWorld("statusAPI", {
  onStatus: (cb) => ipcRenderer.on("status", (_, msg) => cb(msg)),
});
