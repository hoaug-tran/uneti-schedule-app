import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { numberOf, formatScore, rankOf } from "../app/utils/format.js";
import {
  calculateGpa,
  simulateGpa,
  planGpa,
  solveCustomGpaPlan,
  targetOf,
  deduplicateGpaSubjects,
  gradeOfScore10,
  gradePointOf,
  isGpaSubject,
  validateOverrides,
  validateSubjects,
  validateTargetGradeOverrides,
  MAX_SUBJECTS,
  MAX_SUBJECT_CREDIT,
  MAX_TOTAL_CREDITS,
} from "../app/utils/gpa.js";

describe("GPA and format validation", () => {
  describe("strict numberOf validation", () => {
    it("accepts valid finite numbers and decimal strings with dot or comma", () => {
      assert.equal(numberOf(4), 4);
      assert.equal(numberOf(8.5), 8.5);
      assert.equal(numberOf(0), 0);
      assert.equal(numberOf("8.5"), 8.5);
      assert.equal(numberOf("8,5"), 8.5);
      assert.equal(numberOf("  3.2  "), 3.2);
      assert.equal(numberOf("  3,2  "), 3.2);
      assert.equal(numberOf(".5"), 0.5);
      assert.equal(numberOf(",5"), 0.5);
      assert.equal(numberOf("4."), 4);
      assert.equal(numberOf("4,"), 4);
      assert.equal(numberOf("+2.5"), 2.5);
      assert.equal(numberOf("-1.5"), -1.5);
    });

    it("rejects junk strings, non-numeric values, and multi-delimiter garbage", () => {
      assert.equal(numberOf("3.5abc"), null);
      assert.equal(numberOf("12px"), null);
      assert.equal(numberOf("abc"), null);
      assert.equal(numberOf("1.2.3"), null);
      assert.equal(numberOf("1,2,3"), null);
      assert.equal(numberOf("1.2,3"), null);
      assert.equal(numberOf("constructor"), null);
      assert.equal(numberOf("toString"), null);
      assert.equal(numberOf(""), null);
      assert.equal(numberOf("   "), null);
      assert.equal(numberOf(null), null);
      assert.equal(numberOf(undefined), null);
      assert.equal(numberOf(true), null);
      assert.equal(numberOf(false), null);
      assert.equal(numberOf(NaN), null);
      assert.equal(numberOf(Infinity), null);
      assert.equal(numberOf(-Infinity), null);
      assert.equal(numberOf({}), null);
      assert.equal(numberOf([]), null);
    });

    it("formatScore and rankOf handle invalid junk safely", () => {
      assert.equal(formatScore("8,5"), "8.5");
      assert.equal(formatScore("3.5abc"), "");
      assert.equal(rankOf("3.6"), "Xuất sắc");
      assert.equal(rankOf("3,6"), "Xuất sắc");
      assert.equal(rankOf("constructor"), "");
      assert.equal(rankOf("3.6junk"), "");
    });
  });

  describe("own-property targetOf validation", () => {
    it("resolves named and numeric targets", () => {
      assert.equal(targetOf("excellent"), 3.6);
      assert.equal(targetOf("good"), 3.2);
      assert.equal(targetOf("fair"), 2.5);
      assert.equal(targetOf("3.5"), 3.5);
      assert.equal(targetOf("3,5"), 3.5);
      assert.equal(targetOf(3.6), 3.6);
    });

    it("rejects inherited prototype properties and junk keys", () => {
      assert.throws(() => targetOf("constructor"), /Invalid GPA target/);
      assert.throws(() => targetOf("toString"), /Invalid GPA target/);
      assert.throws(() => targetOf("valueOf"), /Invalid GPA target/);
      assert.throws(() => targetOf("__proto__"), /Invalid GPA target/);
      assert.throws(() => targetOf("hasOwnProperty"), /Invalid GPA target/);
      assert.throws(() => targetOf("3.6junk"), /Invalid GPA target/);
      assert.throws(() => targetOf(null), /Invalid GPA target/);
      assert.throws(() => targetOf(undefined), /Invalid GPA target/);
      assert.throws(() => targetOf({}), /Invalid GPA target/);
      assert.throws(() => targetOf(-0.5), /Invalid GPA target/);
      assert.throws(() => targetOf(4.5), /Invalid GPA target/);
    });
  });

  describe("bounded subject count and credits validation", () => {
    it("rejects subject lists exceeding MAX_SUBJECTS", () => {
      const overflow = Array.from({ length: MAX_SUBJECTS + 1 }, (_, i) => ({
        courseId: `c_${i}`,
        credits: 3,
        finalScore: 8,
      }));
      assert.throws(() => validateSubjects(overflow), /Subject count exceeds limit/);
      assert.throws(() => calculateGpa(overflow), /Subject count exceeds limit/);
    });

    it("rejects individual subject credit bounds and junk", () => {
      assert.throws(
        () => validateSubjects([{ courseId: "a", credits: MAX_SUBJECT_CREDIT + 1, finalScore: 8 }]),
        /Invalid credits for a/
      );
      assert.throws(
        () => validateSubjects([{ courseId: "b", credits: -1, finalScore: 8 }]),
        /Invalid credits for b/
      );
      assert.throws(
        () => validateSubjects([{ courseId: "c", credits: "3abc", finalScore: 8 }]),
        /Invalid credits for c/
      );
    });

    it("rejects deduplicated total credits exceeding limit", () => {
      const subjects = [
        { courseId: "a", credits: 30, finalScore: 8 },
        { courseId: "b", credits: 30, finalScore: 8 },
      ];
      assert.doesNotThrow(() => deduplicateGpaSubjects(subjects));
      const heavy = Array.from({ length: 25 }, (_, i) => ({
        courseId: `course_${i}`,
        credits: 25,
        finalScore: 8,
      }));
      assert.throws(() => deduplicateGpaSubjects(heavy), /Total credits exceed limit/);
    });

    it("preserves realistic university workloads", () => {
      const normal = Array.from({ length: 50 }, (_, i) => ({
        courseId: `course_${i}`,
        credits: 3,
        finalScore: 7.5,
      }));
      const result = calculateGpa(normal);
      assert.equal(result.credits, 150);
      assert.equal(result.gpa, 3.0);
    });
  });

  describe("overrides and invalid score validation vs pending rows", () => {
    it("validates override values and rejects junk/out-of-bounds", () => {
      assert.doesNotThrow(() => validateOverrides({ a: 8.5, b: "8,5", c: "" }));
      assert.throws(() => validateOverrides({ a: "junk" }), /Invalid predicted score for a/);
      assert.throws(() => validateOverrides({ a: 11 }), /Invalid predicted score for a/);
      assert.throws(() => validateOverrides({ a: -1 }), /Invalid predicted score for a/);
    });

    it("validates targetGradeOverrides in custom plans", () => {
      assert.doesNotThrow(() => validateTargetGradeOverrides({ a: "A", b: "B+" }));
      assert.throws(() => validateTargetGradeOverrides({ a: "Z" }), /Invalid target grade override for a/);
      assert.throws(() => validateTargetGradeOverrides({ a: "INVALID" }), /Invalid target grade override for a/);
    });

    it("validates invalid subject scores instead of silently treating them as pending", () => {
      assert.throws(
        () => validateSubjects([{ courseId: "bad1", credits: 3, finalScore: "junk" }]),
        /Invalid final score for bad1/
      );
      assert.throws(
        () => validateSubjects([{ courseId: "bad2", credits: 3, finalScore: 12 }]),
        /Invalid final score for bad2/
      );
      assert.throws(
        () => validateSubjects([{ courseId: "bad3", credits: 3, gradePoint: 5 }]),
        /Invalid grade point for bad3/
      );
      assert.doesNotThrow(() => validateSubjects([{ courseId: "status", credits: 3, letter: "Miễn" }]));
    });

    it("keeps valid pending rows without scores safe from false-positive errors", () => {
      const pendingSubjects = [
        { courseId: "completed", credits: 3, finalScore: 8.5 },
        { courseId: "pending", credits: 3, finalScore: null, diemTongKet: null, letter: "", gradePoint: null },
      ];
      assert.doesNotThrow(() => validateSubjects(pendingSubjects));
      const calculated = calculateGpa(pendingSubjects);
      assert.equal(calculated.credits, 3);
      assert.equal(calculated.gpa, 4.0);

      const simulated = simulateGpa(pendingSubjects, { pending: 7.0 });
      assert.equal(simulated.credits, 6);
      assert.equal(simulated.gpa, 3.5);

      assert.throws(
        () => simulateGpa(pendingSubjects, { pending: "invalid_score" }),
        /Invalid predicted score for pending/
      );
    });
  });

  describe("existing self-check assertions and business rules", () => {
    it("passes all baseline self-check assertions", () => {
      assert.equal(gradeOfScore10(8.5)?.point, 4);
      assert.equal(gradeOfScore10(7.8)?.point, 3.5);
      assert.equal(gradeOfScore10(4)?.point, 1);

      const rows = [
        { courseId: "a", credits: 3, finalScore: 4 },
        { courseId: "a", credits: 3, finalScore: 8.5 },
        { courseId: "b", credits: 2, finalScore: 7, excludedFromGpa: true },
        { courseId: "c", credits: 2, finalScore: 5.5 },
        { courseId: "d", credits: 3, finalScore: 4, subjectName: "Giáo dục thể chất 1" },
      ];
      const result = calculateGpa(rows);
      assert.equal(result.credits, 5);
      assert.ok(Math.abs(result.gpa - 3.2) < 0.001);

      const plan = planGpa(rows, 3.6);
      assert.ok(plan.possible);
      assert.equal(plan.suggestions.length, 1);
      assert.equal(plan.suggestions[0].improveTo, "B");

      const customPlan = solveCustomGpaPlan(rows, 3.6, ["c"]);
      assert.ok(customPlan.customMode);
      assert.equal(customPlan.suggestions[0].key, "c");
    });

    it("retains retake replacement by higher gradePoint and non-GPA pattern exclusions", () => {
      const rows = [
        { courseId: "x", credits: 3, finalScore: 4 },
        { courseId: "x", credits: 3, finalScore: 7 },
        { courseId: "gdtc", credits: 2, finalScore: 9, subjectName: "GDTC 2" },
        { courseId: "gdqp", credits: 3, finalScore: 9, subjectName: "Giáo dục quốc phòng" },
      ];
      assert.equal(isGpaSubject(rows[2]), false);
      assert.equal(isGpaSubject(rows[3]), false);
      const dedup = deduplicateGpaSubjects(rows);
      assert.equal(dedup.length, 1);
      assert.equal(dedup[0].point, 3.0);
    });
  });

  describe("custom plan equivalence", () => {
    it("preserves empty custom selection rather than auto-selecting courses", () => {
      const rows = [
        { courseId: "a", credits: 3, finalScore: 8.5 },
        { courseId: "c", credits: 2, finalScore: 5.5 },
      ];
      const autoPlan = planGpa(rows, 3.6);
      const customPlan = solveCustomGpaPlan(rows, 3.6, []);
      assert.equal(autoPlan.possible, true);
      assert.equal(customPlan.possible, false);
      assert.equal(customPlan.customMode, true);
      assert.equal(customPlan.suggestions.length, 0);
      assert.equal(customPlan.projectedGpa, 3.2);
    });

    it("matches outcome when selectedKeys targets the same optimal subjects", () => {
      const rows = [
        { courseId: "a", credits: 3, finalScore: 8.5 },
        { courseId: "c", credits: 2, finalScore: 5.5 },
      ];
      const autoPlan = planGpa(rows, 3.6);
      const customPlan = solveCustomGpaPlan(rows, 3.6, ["c"]);
      assert.equal(customPlan.achieved, autoPlan.achieved);
      assert.equal(customPlan.possible, autoPlan.possible);
      assert.equal(customPlan.suggestions.length, autoPlan.suggestions.length);
      assert.equal(customPlan.suggestions[0].key, autoPlan.suggestions[0].key);
      assert.equal(customPlan.suggestions[0].improveTo, autoPlan.suggestions[0].improveTo);
      assert.equal(customPlan.projectedGpa, autoPlan.projectedGpa);
    });
  });
});

it("upstream administrative letters preserve numeric GPA and ungraded statuses remain excluded", () => {
  assert.equal(calculateGpa([{courseId:"special", credits:3, letter:"P", gradePoint:3}]).gpa, 3);
  assert.equal(calculateGpa([{courseId:"status", credits:3, letter:"Miễn"}]).credits, 0);
});
