import fs from "fs/promises";
import path from "path";
import { getStoreDir } from "./storePath.js";

const SCHEDULES_FILE = "schedules.json";
let memoryCache = null;
let writeQueue = Promise.resolve();

function queueWrite(fn) {
  const next = writeQueue.then(fn, fn);
  writeQueue = next;
  return next;
}

async function getSchedulesPath() {
  const storeDir = getStoreDir();
  return path.join(storeDir, SCHEDULES_FILE);
}

async function loadSchedulesFromDisk() {
  if (memoryCache !== null) {
    return memoryCache;
  }
  try {
    const filePath = await getSchedulesPath();
    const exists = await fs
      .stat(filePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      memoryCache = {};
      return memoryCache;
    }

    const data = await fs.readFile(filePath, "utf8");
    try {
      memoryCache = JSON.parse(data) || {};
      return memoryCache;
    } catch {
      memoryCache = {};
      return memoryCache;
    }
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

async function saveSchedulesToDisk(schedules) {
  try {
    memoryCache = schedules;
    const storeDir = getStoreDir();
    await fs.mkdir(storeDir, { recursive: true });
    const filePath = await getSchedulesPath();
    const rand = Math.random().toString(36).slice(2);
    const tmp = path.join(storeDir, `schedules.${Date.now()}.${rand}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(schedules, null, 2), "utf8");
    await fs.rename(tmp, filePath);
  } catch (err) {
    console.warn("[scheduleDb] save failed:", err?.message);
  }
}

export async function saveSchedule(weekKey, weekStart, data, offsets) {
  return queueWrite(async () => {
    const schedules = await loadSchedulesFromDisk();
    schedules[weekKey] = {
      week_start: weekStart,
      data,
      offsets,
      updated_at: Date.now(),
    };
    await saveSchedulesToDisk(schedules);
  });
}

export async function saveAllSchedules(batch) {
  return queueWrite(async () => {
    const schedules = await loadSchedulesFromDisk();
    for (const [wKey, val] of Object.entries(batch)) {
      schedules[wKey] = val;
    }
    await saveSchedulesToDisk(schedules);
  });
}

export async function loadScheduleAsync(weekKey) {
  const schedules = await loadSchedulesFromDisk();
  return schedules[weekKey] || null;
}

export async function deleteAllSchedules() {
  return queueWrite(async () => {
    memoryCache = {};
    await saveSchedulesToDisk({});
  });
}

export function closeDatabase() {
  memoryCache = null;
}
