import path from "path";
import { getStoreDir } from "./storePath.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

const SCHEDULES_FILE = "schedules.json";
let memoryCache = null;
let writeQueue = Promise.resolve();

function queueWrite(fn) {
  const next = writeQueue.then(fn, fn);
  writeQueue = next;
  return next;
}

function getSchedulesPath() {
  const storeDir = getStoreDir();
  return path.join(storeDir, SCHEDULES_FILE);
}

async function loadSchedulesFromDisk() {
  if (memoryCache !== null) {
    return memoryCache;
  }
  const filePath = getSchedulesPath();
  const data = await readJson(filePath, {});
  memoryCache = data && typeof data === "object" ? data : {};
  return memoryCache;
}

async function saveSchedulesToDisk(schedules) {
  try {
    memoryCache = schedules;
    const filePath = getSchedulesPath();
    await writeJsonAtomic(filePath, schedules);
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
