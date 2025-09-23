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
      return JSON.parse(fs.readFileSync(scheduleFile, "utf8"));
    } catch {
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
