import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createUpdateScheduler } from "../main/updateScheduler.js";
import { isTrustedSender, validateIpc, externalUrl, clampWindow } from "../main/security.js";
import { vietnamNow, formatYMDLocal } from "../app/utils/date.js";

test("updater respects off-on setting without requiring login or duplicate schedules", async () => {
  let enabled = false, checks = 0, next, pending = 0;
  const timers = { setTimeout(fn) { next = fn; pending++; return 1; }, clearTimeout() { pending--; next = null; } };
  const scheduler = createUpdateScheduler({ enabled: () => enabled, check: async () => { checks++; }, timers });
  scheduler.start(); scheduler.start();
  assert.equal(pending, 1);
  pending--; await next(); assert.equal(checks, 0);
  enabled = true;
  pending--; await next(); assert.equal(checks, 1);
  enabled = false;
  pending--; await next(); assert.equal(checks, 1);
  scheduler.stop(); assert.equal(next, null);
});

test("IPC accepts only main frame of exact widget file and blocks malformed inputs", () => {
  const file = new URL("../app/index.html", import.meta.url);
  const frame = { url: file.href };
  const wc = { mainFrame: frame };
  const win = { isDestroyed: () => false, webContents: wc };
  const entry = new URL(file); const pathname = process.platform === "win32" ? decodeURIComponent(entry.pathname.slice(1)) : entry.pathname;
  assert.equal(isTrustedSender({ sender: wc, senderFrame: frame }, win, pathname), true);
  assert.equal(isTrustedSender({ sender: wc, senderFrame: { url: file.href } }, win, pathname), false);
  frame.url = "https://support.uneti.edu.vn";
  assert.equal(isTrustedSender({ sender: wc, senderFrame: frame }, win, pathname), false);
  for (const height of [NaN, Infinity, -1, "600"]) assert.throws(() => validateIpc("window:resize-height", [height]));
  assert.throws(() => validateIpc("widget:fetch-week", [999999, "bad"]));
  assert.throws(() => validateIpc("academic:refresh", [{ force: "true" }]));
  assert.throws(() => externalUrl("file:///etc/passwd"));
  assert.throws(() => externalUrl("https://user:pass@example.com"));
  assert.equal(externalUrl("https://github.com/hoaug-tran"), "https://github.com/hoaug-tran");
  assert.deepEqual(clampWindow({ width: 500, height: 400 }, 800, 610), { width: 500, height: 400 });
});

test("Vietnam civil day is independent of host timezone across UTC midnight", () => {
  assert.equal(formatYMDLocal(vietnamNow(new Date("2026-10-15T18:00:00Z"))), "2026-10-16");
  assert.equal(vietnamNow(new Date("2026-10-15T18:00:00Z")).getHours(), 1);
});
