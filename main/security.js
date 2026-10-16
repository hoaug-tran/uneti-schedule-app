import { fileURLToPath } from "node:url";
import path from "node:path";
export function isTrustedSender(event, window, entryPath) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== window.webContents.mainFrame) return false;
  try {
    const actual = new URL(frame.url);
    if (actual.protocol !== "file:" || actual.search) return false;
    const normalize = value => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
    return normalize(fileURLToPath(actual)) === normalize(entryPath);
  } catch { return false; }
}
export function externalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid external URL");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid external URL");
  return url.href;
}
export function validateIpc(channel, args) {
  const date = value => {
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length > 40 || !Number.isFinite(new Date(value).getTime()))) throw new Error("Invalid date");
  };
  const record = value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 1000 || JSON.stringify(value).length > 50000) throw new Error("Invalid parameters");
    if (Object.keys(value).some(key => ["__proto__", "constructor", "prototype"].includes(key))) throw new Error("Invalid parameter key");
  };
  if (channel === "schedule:load-file") date(args[0]);
  if (channel === "widget:fetch-week") {
    if (!Number.isInteger(args[0]) || Math.abs(args[0]) > 520) throw new Error("Invalid week offset");
    date(args[1]);
  }
  if (channel === "window:resize-height" && (!Number.isFinite(args[0]) || args[0] < 1 || args[0] > 10000)) throw new Error("Invalid window height");
  if (channel === "academic:refresh" && args[0] !== undefined) {
    record(args[0]);
    if (Object.keys(args[0]).some(k => k !== "force") || (args[0].force !== undefined && typeof args[0].force !== "boolean")) throw new Error("Invalid refresh options");
  }
  if (channel === "gpa:simulate") record(args[0]);
  if (["gpa:plan", "gpa:custom-plan"].includes(channel)) {
    const target = args[0];
    if (!["good", "fair", "excellent"].includes(target) && !(typeof target === "number" && Number.isFinite(target) && target >= 0 && target <= 4)) throw new Error("Invalid GPA target");
  }
  if (channel === "gpa:custom-plan") {
    if (!Array.isArray(args[1]) || args[1].length > 1000 || args[1].some(key => typeof key !== "string" || key.length > 128)) throw new Error("Invalid selected courses");
    if (args[2] !== undefined) record(args[2]);
  }
}
export function clampWindow(workArea, width, height) {
  return { width: Math.max(1, Math.min(Math.round(width), workArea.width)), height: Math.max(1, Math.min(Math.round(height), workArea.height)) };
}
