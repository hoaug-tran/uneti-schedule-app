import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSource } from "./helpers/load.js";
import { readJson, writeJsonAtomic, eraseJson } from "../app/fetcher/jsonStore.js";
import { captureSession, invalidateSession, assertSession, isAuthError } from "../app/fetcher/sessionState.js";
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
test("cancelling an old session is not authentication expiry for the new session", () => {
  const previous = captureSession(); invalidateSession();
  assert.equal(previous.signal.reason.code, "SESSION_CHANGED");
  assert.equal(isAuthError(previous.signal.reason), false);
  assert.throws(() => assertSession(previous), { code: "SESSION_CHANGED" });
});

test("erase removes primary + recovery data and cannot be undone by a queued old write", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "uneti-storage-"));
  try {
    const file = path.join(temp, "data.json");
    await writeJsonAtomic(file, { studentId: "A" });
    await writeJsonAtomic(file, { studentId: "B" });
    const old = captureSession();
    const pending = writeJsonAtomic(file, { studentId: "A" }, { guard: () => assertSession(old) });
    invalidateSession();
    await assert.rejects(pending, /Session changed/);
    await eraseJson(file);
    await assert.rejects(access(file));
    await assert.rejects(access(file + ".bak"));
    assert.equal(await readJson(file), null);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("JSON corruption recovers valid backup, permission and write failures propagate", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "uneti-json-"));
  try {
    const file = path.join(temp, "data.json");
    await writeJsonAtomic(file, { revision: 1 });
    await writeJsonAtomic(file, { revision: 2 });
    await writeFile(file, "invalid");
    assert.equal((await readJson(file)).revision, 1);
    const blocker = path.join(temp, "file");
    await writeFile(blocker, "file");
    await assert.rejects(writeJsonAtomic(path.join(blocker, "bad.json"), {}));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("cache isolates owners, enforces TTL and rejects legacy/unowned data", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "uneti-owner-"));
  let owner = "A";
  try {
    const db = await loadSource("app/fetcher/scheduleDb.js", {
      "./storePath.js": { getStoreDir: () => temp }, "./userStore.js": { getStudentId: async () => owner },
    });
    const entry = { week_start: "2026-10-12", data: [{ subject: "A" }], updated_at: Date.now(), offsets: {} };
    await db.saveAllSchedules({ "2026-10-12": entry });
    assert.equal((await db.loadScheduleAsync("2026-10-12")).data[0].subject, "A");
    owner = "B";
    assert.equal(await db.loadScheduleAsync("2026-10-12"), null);
    owner = "A";
    await db.saveAllSchedules({ "2026-10-12": { ...entry, updated_at: Date.now() - 7 * 3600000 } });
    assert.equal((await db.loadScheduleAsync("2026-10-12")).stale, true);
    await db.saveAllSchedules({ "2026-10-12": { ...entry, updated_at: Date.now() - 31 * 86400000 } }, { replace: true });
    assert.equal(await db.loadScheduleAsync("2026-10-12"), null);
    await db.deleteAllSchedules();
    assert.equal(await readJson(path.join(temp, "schedules.json")), null);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("successful full snapshot clears removed weeks; invalid payload cannot erase cache", async () => {
  const batch = {};
  let rows = [{ NgayBatDau: "2026-10-12", TenMonHoc: "A", TuTiet: 1, DenTiet: 2 }, { NgayBatDau: "2026-10-19", TenMonHoc: "B" }];
  let invalid = false;
  const api = await loadSource("app/fetcher/getSchedule.js", {
    "./supportApi.js": { callSupportApi: async ({ label }) => ({ body: invalid ? "bad" : label === "schedule-classes" ? rows : [] }) },
    "./userStore.js": { getStudentId: async () => "A" },
    "./scheduleDb.js": {
      loadScheduleAsync: async key => batch[key] ?? null,
      deleteAllSchedules: async () => {},
      saveAllSchedules: async (next, options) => { assert.equal(options.replace, true); for (const k of Object.keys(batch)) delete batch[k]; Object.assign(batch, next); },
    }, "../utils/logger.js": { logger: quiet },
  });
  await api.getSchedule(0, "2026-10-12");
  assert.ok(batch["2026-10-19"]);
  rows = [rows[0]];
  await api.getSchedule(0, "2026-10-12");
  assert.equal(batch["2026-10-19"], undefined);
  invalid = true;
  assert.equal((await api.getSchedule(0, "2026-10-12")).stale, true);
  assert.ok(batch["2026-10-12"]);
});

test("in-flight fetch after logout never writes or returns old account data", async () => {
  let release;
  let started;
  const pending = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  let writes = 0;
  const session = await import("../app/fetcher/sessionState.js");
  const api = await loadSource("app/fetcher/getSchedule.js", {
    "./sessionState.js": session,
    "./supportApi.js": { callSupportApi: async () => { started(); await pending; return { body: [] }; } },
    "./userStore.js": { getStudentId: async () => "A" },
    "./scheduleDb.js": { loadScheduleAsync: async () => null, saveAllSchedules: async () => { writes++; }, deleteAllSchedules: async () => {} },
    "../utils/logger.js": { logger: quiet },
  });
  const fetching = api.getSchedule(0, "2026-10-12");
  await entered;
  session.invalidateSession();
  release();
  await assert.rejects(fetching, /Session changed/);
  assert.equal(writes, 0);
});
