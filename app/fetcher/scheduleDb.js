import fs from "fs/promises";
import path from "path";
import { getStoreDir } from "./storePath.js";
import { CONFIG } from "../config.js";

const SCHEDULES_FILE = "schedules.json";

async function getSchedulesPath() {
  const storeDir = getStoreDir();
  return path.join(storeDir, SCHEDULES_FILE);
}

async function loadSchedulesFromDisk() {
  try {
    const filePath = await getSchedulesPath();
    const exists = await fs
      .stat(filePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) return {};

    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data) || {};
  } catch (err) {
    console.warn("[scheduleDb] load failed:", err?.message);
    return {};
  }
}

async function saveSchedulesToDisk(schedules) {
  try {
    const storeDir = getStoreDir();
    await fs.mkdir(storeDir, { recursive: true });
    const filePath = await getSchedulesPath();
    await fs.writeFile(filePath, JSON.stringify(schedules, null, 2), "utf8");
  } catch (err) {
    console.warn("[scheduleDb] save failed:", err?.message);
  }
}

export async function saveSchedule(weekKey, weekStart, data, offsets) {
  const schedules = await loadSchedulesFromDisk();
  schedules[weekKey] = {
    week_start: weekStart,
    data,
    offsets,
    updated_at: Date.now(),
  };
  await saveSchedulesToDisk(schedules);
}

export function loadSchedule(weekKey) {
  try {
    const storeDir = getStoreDir();
    const filePath = path.join(storeDir, SCHEDULES_FILE);
    const raw = require("fs").readFileSync(filePath, "utf8");
    const schedules = JSON.parse(raw);
    return schedules[weekKey] || null;
  } catch {
    return null;
  }
}

export async function loadScheduleAsync(weekKey) {
  const schedules = await loadSchedulesFromDisk();
  return schedules[weekKey] || null;
}

export async function deleteAllSchedules() {
  await saveSchedulesToDisk({});
}

export function closeDatabase() {
}
