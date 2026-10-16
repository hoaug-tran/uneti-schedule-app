import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
const queues = new Map();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function enqueue(file, task) {
  const next = (queues.get(file) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(file, next);
  next.finally(() => { if (queues.get(file) === next) queues.delete(file); }).catch(() => {});
  return next;
}
export async function flushJsonWrites() { await Promise.all([...queues.values()]); }
export async function readJson(filePath, fallback = null, { recoverBackup = true } = {}) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    if (!recoverBackup) return fallback;
    if (error instanceof SyntaxError) console.warn("[jsonStore] invalid JSON; attempting backup recovery");
    try { return JSON.parse(await fs.readFile(filePath + ".bak", "utf8")); }
    catch (backupError) {
      if (backupError.code !== "ENOENT" && !(backupError instanceof SyntaxError)) throw backupError;
      return fallback;
    }
  }
}
export function eraseJson(filePath) {
  return enqueue(filePath, async () => {
    await fs.rm(filePath + ".bak", { force: true });
    await fs.rm(filePath, { force: true });
  });
}
export function writeJsonAtomic(filePath, value, { guard = () => {}, backup = true } = {}) {
  if (value === null) return eraseJson(filePath);
  return enqueue(filePath, async () => {
    guard();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = path.join(path.dirname(filePath), "." + path.basename(filePath) + "." + randomUUID() + ".tmp");
    try {
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
      guard();
      try { if (backup) await fs.copyFile(filePath, filePath + ".bak"); else await fs.rm(filePath + ".bak", { force: true }); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      for (let attempt = 0; ; attempt++) {
        guard();
        try { await fs.rename(tmp, filePath); break; }
        catch (error) {
          if (attempt >= 3 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
          await sleep(60);
        }
      }
    } finally { await fs.rm(tmp, { force: true }); }
  });
}
