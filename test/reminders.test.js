import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./helpers/load.js";
const fixed = Date.parse("2026-10-16T23:45:00Z");
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }
async function reminderFixture() {
  const shown = [];
  let tick;
  class Notification { static isSupported() { return true; } constructor(options) { this.options = options; } on() {} show() { shown.push(this.options); } }
  const service = await loadSource("app/utils/classNotifier.js", {
    electron: { Notification }, "./logger.js": { logger: { info() {}, warn() {} } },
  }, { Date: FixedDate, Intl, console, setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = null; } });
  return { service, shown, tick: () => tick?.() };
}
test("class/exam reminders use Vietnam day/time and do not duplicate in one service", async () => {
  const { service, shown, tick } = await reminderFixture();
  service.startClassReminderService({ getTodaySchedule: async () => [{ day: "2026-10-17", subject: "Demo", type: "Thi", periods: [1, 2], room: "Room" }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shown.length, 1); assert.match(shown[0].title, /thi/); assert.match(shown[0].body, /07:00/);
  await tick(); assert.equal(shown.length, 1);
  service.stopClassReminderService();
});
test("logout while schedule load is pending cancels reminder emission", async () => {
  const { service, shown } = await reminderFixture();
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  service.startClassReminderService({ getTodaySchedule: () => pending });
  service.stopClassReminderService();
  resolve([{ day: "2026-10-17", subject: "Demo", periods: [1] }]);
  await new Promise(done => setImmediate(done));
  assert.equal(shown.length, 0);
});
