import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./helpers/load.js";
import { API_FIELDS as F } from "../app/constants.js";
import * as session from "../app/fetcher/sessionState.js";
const logger = { info() {}, warn() {}, debug() {}, error() {} };
function mocks(call, save = async () => {}) {
  return {
    "./sessionState.js": session,
    "./supportApi.js": { callSupportApi: call },
    "./userStore.js": { getStudentId: async () => "STUDENT-A" },
    "./academicDb.js": { loadAcademicResults: async () => null, saveAcademicResults: save },
    "../utils/logger.js": { logger },
  };
}
test("academic preserves mapped course/grade rules, owner and deduplicated active requests", async () => {
  let writes = 0, calls = 0;
  const row = { [F.GRADES_COURSE_ID]: "C1", [F.GRADES_SUBJECT_NAME]: "Subject", [F.GRADES_CREDITS]: "3", [F.GRADES_LETTER]: "A", [F.GRADES_FINAL_SCORE]: 9, [F.GRADES_GRADE_POINT]: 4 };
  const mod = await loadSource("app/fetcher/getAcademicResults.js", mocks(async ({ label }) => {
    calls++;
    return { body: label === "academic-grades" ? [row] : [] };
  }, async (payload, options) => { writes++; assert.equal(options.owner, "STUDENT-A"); assert.equal(payload.subjects[0].credits, 3); }));
  const [first, second] = await Promise.all([mod.getAcademicResults(), mod.getAcademicResults()]);
  assert.equal(first, second);
  assert.equal(writes, 1); assert.equal(calls, 4);
  assert.equal(first.subjects[0].letter, "A");
});
test("academic response after session change cannot persist", async () => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let writes = 0;
  const mod = await loadSource("app/fetcher/getAcademicResults.js", mocks(async () => { entered(); await gate; return { body: [] }; }, async () => { writes++; }));
  const request = mod.getAcademicResults();
  await started;
  session.invalidateSession();
  release();
  await assert.rejects(request, /Session changed/);
  assert.equal(writes, 0);
});
test("invalid academic payload rejects without overwriting cached data", async () => {
  let writes = 0;
  const mod = await loadSource("app/fetcher/getAcademicResults.js", mocks(async () => ({ body: "not an array" }), async () => { writes++; }));
  await assert.rejects(mod.getAcademicResults(), /Invalid academic response/);
  assert.equal(writes, 0);
});
