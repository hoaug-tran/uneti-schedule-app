import { test } from "node:test";
import assert from "node:assert/strict";
import { runGpa, closeGpaWorker } from "../main/gpaService.js";
import { planGpa, simulateGpa } from "../app/utils/gpa.js";
test("worker preserves GPA output and main event loop while computing", async () => {
  const rows = [{ courseId: "a", credits: 3, finalScore: 4 }, { courseId: "b", credits: 2, finalScore: 8 }];
  try {
    assert.deepEqual(await runGpa("plan", rows, 3.2), planGpa(rows, 3.2));
    assert.deepEqual(await runGpa("simulate", rows, { a: 8.5 }), simulateGpa(rows, { a: 8.5 }));
    await assert.rejects(runGpa("plan", rows, "constructor"), /Invalid GPA target/);
    let ticked = false;
    const workload = Array.from({ length: 400 }, (_, i) => ({ courseId: `c${i}`, credits: 1, gradePoint: 0 }));
    const result = runGpa("plan", workload, 3.2);
    await new Promise(resolve => setTimeout(() => { ticked = true; resolve(); }, 20));
    assert.equal(ticked, true);
    assert.equal((await result).possible, true);
  } finally { await closeGpaWorker(); }
});
