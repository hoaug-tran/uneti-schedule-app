import path from "node:path";
import { getStoreDir } from "./storePath.js";
import { readJson, writeJsonAtomic, eraseJson } from "./jsonStore.js";
import { getStudentId } from "./userStore.js";
import { captureSession, assertSession, invalidateSession } from "./sessionState.js";
import { CONFIG } from "../config.js";
const getPath = () => path.join(getStoreDir(), "schedules.json");
let queue = Promise.resolve();
function enqueue(fn) { const next = queue.catch(() => {}).then(fn); queue = next; return next; }
async function loadEnvelope(owner) {
  const saved = await readJson(getPath());
  return saved?.owner === owner && saved?.schema === 1 ? saved.weeks ?? {} : {};
}
export async function loadScheduleAsync(key) {
  const snapshot = captureSession();
  const owner = await getStudentId();
  if (!owner) return null;
  const weeks = await loadEnvelope(owner);
  assertSession(snapshot);
  const entry = weeks[key];
  if (!entry || !Array.isArray(entry.data) || !Number.isFinite(entry.updated_at)) return null;
  const age = Date.now() - entry.updated_at;
  if (age < 0 || age > CONFIG.SCHEDULE_CACHE_MAX_AGE_MS) return null;
  return { ...entry, stale: age > CONFIG.SCHEDULE_CACHE_TTL_MS };
}
export function saveAllSchedules(batch, { owner, snapshot = captureSession(), replace = false } = {}) {
  return enqueue(async () => {
    assertSession(snapshot);
    const current = await getStudentId();
    if (!current || (owner && owner !== current)) throw new Error("Session owner changed");
    const previous = replace ? {} : await loadEnvelope(current);
    const weeks = { ...previous, ...batch };
    for (const [key, value] of Object.entries(weeks)) {
      if (!Number.isFinite(value?.updated_at) || Date.now() - value.updated_at > CONFIG.SCHEDULE_CACHE_MAX_AGE_MS) delete weeks[key];
    }
    await writeJsonAtomic(getPath(), { schema: 1, owner: current, weeks }, { guard: () => assertSession(snapshot) });
  });
}
export function saveSchedule(key, weekStart, data, offsets) {
  return saveAllSchedules({ [key]: { week_start: weekStart, data, offsets, updated_at: Date.now() } });
}
export function deleteAllSchedules() {
  invalidateSession();
  return enqueue(() => eraseJson(getPath()));
}
export async function closeDatabase() { await queue; }
