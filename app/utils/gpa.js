import {
  GPA_TARGETS,
  LETTER_POINTS,
  GRADE_BANDS,
  RANK_THRESHOLDS,
  NON_GPA_SUBJECT_PATTERNS,
} from "../constants.js";
import { numberOf, courseKeyOf } from "./format.js";

function creditsOf(row) {
  return numberOf(row?.credits ?? row?.soTinChi ?? row?.tinChi);
}

function sourceIndexOf(row, fallback) {
  return Number.isInteger(row?.sourceIndex) ? row.sourceIndex : fallback;
}

export function rankOf(gpa4) {
  if (gpa4 === null || gpa4 === undefined) return "";
  const score = numberOf(gpa4);
  if (score === null) return "";
  const rounded = Math.round((score + Number.EPSILON) * 100) / 100;
  const matched = RANK_THRESHOLDS.find((item) => rounded >= item.min);
  return matched ? matched.rank : "Yếu";
}

export function gradeOfScore10(value) {
  const score = numberOf(value);
  if (score === null || score < 0 || score > 10) return null;
  const match = GRADE_BANDS.find(([minimum]) => score >= minimum);
  if (!match) return null;
  const [, point, letter] = match;
  return { score, point, letter };
}

export function gradePointOf(row) {
  const point = numberOf(row?.gradePoint ?? row?.diemTinChi);
  if (point !== null && point >= 0 && point <= 4) return point;
  const scoreGrade = gradeOfScore10(row?.finalScore ?? row?.diemTongKet);
  if (scoreGrade) return scoreGrade.point;
  return LETTER_POINTS[String(row?.letter ?? row?.diemChu ?? "").trim().toUpperCase()] ?? null;
}

export function isGpaSubject(row) {
  if (!row) return false;
  if (row.excludedFromGpa === true) return false;
  const khongTinh = row.khongTinhDiemTBC;
  if (
    khongTinh === true ||
    khongTinh === 1 ||
    khongTinh === "1" ||
    String(khongTinh).toLowerCase() === "true"
  ) {
    return false;
  }
  if (row.isTinhTBC === false || row.isTinhTBC === 0 || row.isTinhTBC === "0") {
    return false;
  }
  const credits = creditsOf(row);
  if (credits !== null && credits <= 0) return false;
  const subjectName = String(row.subjectName ?? row.name ?? row.tenMonHoc ?? "").trim();
  const subjectCode = String(row.courseId ?? row.subjectId ?? row.subjectCode ?? "").trim();
  for (const pattern of NON_GPA_SUBJECT_PATTERNS) {
    if (pattern.test(subjectName) || pattern.test(subjectCode)) {
      return false;
    }
  }
  return true;
}

export function deduplicateGpaSubjects(subjects = [], overrides = {}) {
  const selected = new Map();
  subjects.forEach((row, sourceIndex) => {
    if (!isGpaSubject(row)) return;
    const credits = creditsOf(row);
    const key = courseKeyOf(row);
    if (credits === null || credits <= 0 || !key) return;
    let point = gradePointOf(row);
    let finalScore = row?.finalScore ?? row?.diemTongKet ?? null;
    let letter = row?.letter ?? row?.diemChu ?? "";
    if (overrides && overrides[key] !== undefined && overrides[key] !== "" && overrides[key] !== null) {
      const score = numberOf(overrides[key]);
      const grade = score === null ? null : gradeOfScore10(score);
      if (grade) {
        point = grade.point;
        finalScore = grade.score;
        letter = grade.letter;
      }
    }
    if (point === null) return;
    const candidate = {
      ...row,
      credit: credits,
      point,
      finalScore,
      letter,
      courseKey: key,
      sourceIndex: sourceIndexOf(row, sourceIndex),
    };
    const current = selected.get(key);
    if (!current || candidate.point > current.point) selected.set(key, candidate);
  });
  return [...selected.values()];
}

export function calculateGpa(subjects = []) {
  const selected = deduplicateGpaSubjects(subjects);
  const credits = selected.reduce((total, subject) => total + subject.credit, 0);
  const weighted = selected.reduce((total, subject) => total + subject.credit * subject.point, 0);
  return { credits, gpa: credits ? weighted / credits : 0, subjects: selected };
}

export function simulateGpa(subjects = [], overrides = {}) {
  const selected = deduplicateGpaSubjects(subjects, overrides);
  const simulated = selected.map((subject) => {
    const score = numberOf(overrides[subject.courseKey]);
    const grade = score === null ? null : gradeOfScore10(score);
    if (score !== null && !grade) throw new Error(`Invalid predicted score for ${subject.courseKey}`);
    return grade ? { ...subject, finalScore: grade.score, point: grade.point, letter: grade.letter } : subject;
  });
  const credits = simulated.reduce((total, subject) => total + subject.credit, 0);
  const weighted4 = simulated.reduce((total, subject) => total + subject.credit * subject.point, 0);
  const scoreSubjects = simulated.filter((subject) => numberOf(subject.finalScore) !== null);
  const scoreCredits = scoreSubjects.reduce((total, subject) => total + subject.credit, 0);
  const weighted10 = scoreSubjects.reduce((total, subject) => total + subject.credit * numberOf(subject.finalScore), 0);
  return {
    credits,
    gpa: credits ? weighted4 / credits : 0,
    gpa10: scoreCredits ? weighted10 / scoreCredits : null,
    subjects: simulated,
  };
}

function targetOf(targetKey) {
  const target = GPA_TARGETS[targetKey] ?? numberOf(targetKey);
  if (target === null || target < 0 || target > 4) throw new Error("Invalid GPA target");
  return target;
}

const IMPROVEMENT_GRADES = [
  { point: 4.0, letter: "A" },
  { point: 3.5, letter: "B+" },
  { point: 3.0, letter: "B" },
];

function candidatesOf(subject) {
  return IMPROVEMENT_GRADES
    .filter((candidate) => candidate.point > subject.point)
    .map((candidate) => ({
      point: candidate.point,
      letter: candidate.letter,
      gain: Math.round((candidate.point - subject.point) * subject.credit * 2),
    }));
}

export function planGpa(subjects = [], targetKey) {
  const target = targetOf(targetKey);
  const base = calculateGpa(subjects);
  const requiredGain = Math.ceil(Math.max(0, target * base.credits - base.gpa * base.credits) * 2 - 1e-9);
  if (!requiredGain) {
    return {
      target,
      credits: base.credits,
      gpa: base.gpa,
      achieved: true,
      possible: true,
      customMode: false,
      suggestions: [],
      equivalentGroups: [],
      projectedGpa: base.gpa,
    };
  }

  let states = new Map([[0, []]]);
  for (const subject of base.subjects) {
    const next = new Map(states);
    for (const [gain, choices] of states) {
      for (const candidate of candidatesOf(subject)) {
        const totalGain = gain + candidate.gain;
        const nextChoices = [...choices, { subject, ...candidate }];
        const existing = next.get(totalGain);
        if (!existing || nextChoices.length < existing.length) next.set(totalGain, nextChoices);
      }
    }
    states = next;
  }

  const viable = [...states.entries()].filter(([gain]) => gain >= requiredGain);
  if (!viable.length) {
    return {
      target,
      credits: base.credits,
      gpa: base.gpa,
      achieved: false,
      possible: false,
      customMode: false,
      suggestions: [],
      equivalentGroups: [],
      projectedGpa: base.gpa,
    };
  }

  viable.sort(([gainA, choicesA], [gainB, choicesB]) => choicesA.length - choicesB.length || gainA - gainB);
  const [gain, choices] = viable[0];
  const suggestions = choices.map(({ subject, point, letter }) => ({
    index: subject.sourceIndex,
    key: subject.courseKey,
    subjectCode: subject.courseId ?? subject.subjectCode ?? "",
    subjectName: subject.subjectName ?? subject.name ?? "",
    credit: subject.credit,
    point: subject.point,
    improveTo: letter,
    improveToPoint: point,
    isCustom: false,
  }));
  const projectedGpa = (base.gpa * base.credits + gain / 2) / base.credits;
  const equivalentGroups = suggestions.map((suggestion) => ({
    improveTo: suggestion.improveTo,
    alternatives: base.subjects
      .filter((subject) => subject.courseKey !== suggestion.key)
      .filter((subject) => Math.round((suggestion.improveToPoint - subject.point) * subject.credit * 2) === Math.round((suggestion.improveToPoint - suggestion.point) * suggestion.credit * 2))
      .map((subject) => ({ index: subject.sourceIndex, key: subject.courseKey, subjectCode: subject.courseId ?? subject.subjectCode ?? "", subjectName: subject.subjectName ?? subject.name ?? "" })),
  })).filter((group) => group.alternatives.length);

  return {
    target,
    credits: base.credits,
    gpa: base.gpa,
    achieved: false,
    possible: true,
    customMode: false,
    suggestions,
    equivalentGroups,
    projectedGpa,
  };
}

export function solveCustomGpaPlan(subjects = [], targetKey = "good", selectedKeys = [], targetGradeOverrides = {}) {
  const target = targetOf(targetKey);
  const base = calculateGpa(subjects);
  const requiredGain = Math.ceil(Math.max(0, target * base.credits - base.gpa * base.credits) * 2 - 1e-9);

  if (!requiredGain) {
    return {
      target,
      credits: base.credits,
      gpa: base.gpa,
      achieved: true,
      possible: true,
      customMode: Array.isArray(selectedKeys) && selectedKeys.length > 0,
      suggestions: [],
      projectedGpa: base.gpa,
      deficit: 0,
      additionalCreditsNeeded: 0,
    };
  }

  if (Array.isArray(selectedKeys) && selectedKeys.length === 0) {
    const additionalCreditsNeeded = Math.ceil(requiredGain / (2 * 2.0));
    return {
      target,
      credits: base.credits,
      gpa: base.gpa,
      achieved: requiredGain <= 0,
      possible: requiredGain <= 0,
      customMode: true,
      suggestions: [],
      projectedGpa: base.gpa,
      deficit: requiredGain / 2,
      additionalCreditsNeeded,
    };
  }

  const normalizedKeys = new Set((selectedKeys || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  if (normalizedKeys.size === 0) {
    return planGpa(subjects, targetKey);
  }

  const selectedSubjects = base.subjects.filter((s) => normalizedKeys.has(s.courseKey));
  if (!selectedSubjects.length) {
    const additionalCreditsNeeded = Math.ceil(requiredGain / (2 * 2.0));
    return {
      target,
      credits: base.credits,
      gpa: base.gpa,
      achieved: requiredGain <= 0,
      possible: requiredGain <= 0,
      customMode: true,
      suggestions: [],
      projectedGpa: base.gpa,
      deficit: requiredGain / 2,
      additionalCreditsNeeded,
    };
  }

  let states = new Map([[0, []]]);
  for (const subject of selectedSubjects) {
    const next = new Map();
    const explicitGrade = targetGradeOverrides[subject.courseKey];
    let candidates = candidatesOf(subject);
    if (explicitGrade && LETTER_POINTS[explicitGrade] !== undefined) {
      const p = LETTER_POINTS[explicitGrade];
      if (p > subject.point) {
        candidates = [{ point: p, letter: explicitGrade, gain: Math.round((p - subject.point) * subject.credit * 2) }];
      }
    }
    if (!candidates.length) {
      for (const [gain, choices] of states) {
        next.set(gain, [...choices, { subject, point: subject.point, letter: subject.letter, gain: 0 }]);
      }
    } else {
      for (const [gain, choices] of states) {
        for (const candidate of candidates) {
          const totalGain = gain + candidate.gain;
          const nextChoices = [...choices, { subject, ...candidate }];
          const existing = next.get(totalGain);
          if (!existing || nextChoices.length < existing.length) {
            next.set(totalGain, nextChoices);
          }
        }
      }
    }
    states = next;
  }

  const viable = [...states.entries()].filter(([gain]) => gain >= requiredGain);
  if (viable.length > 0) {
    viable.sort(([gainA, choicesA], [gainB, choicesB]) => {
      const sumPointsA = choicesA.reduce((sum, c) => sum + c.point, 0);
      const sumPointsB = choicesB.reduce((sum, c) => sum + c.point, 0);
      return sumPointsA - sumPointsB || gainA - gainB;
    });
    const [gain, choices] = viable[0];
    const suggestions = choices.map(({ subject, point, letter }) => ({
      index: subject.sourceIndex,
      key: subject.courseKey,
      subjectCode: subject.courseId ?? subject.subjectCode ?? "",
      subjectName: subject.subjectName ?? subject.name ?? "",
      credit: subject.credit,
      point: subject.point,
      improveTo: letter,
      improveToPoint: point,
      isCustom: true,
    }));
    const projectedGpa = (base.gpa * base.credits + gain / 2) / base.credits;
    return {
      target,
      credits: base.credits,
      gpa: base.gpa,
      achieved: false,
      possible: true,
      customMode: true,
      suggestions,
      projectedGpa,
      deficit: 0,
      additionalCreditsNeeded: 0,
    };
  }

  const maxEntry = [...states.entries()].sort(([gainA], [gainB]) => gainB - gainA)[0];
  const maxGain = maxEntry ? maxEntry[0] : 0;
  const bestChoices = maxEntry ? maxEntry[1] : [];
  const suggestions = bestChoices.map(({ subject, point, letter }) => ({
    index: subject.sourceIndex,
    key: subject.courseKey,
    subjectCode: subject.courseId ?? subject.subjectCode ?? "",
    subjectName: subject.subjectName ?? subject.name ?? "",
    credit: subject.credit,
    point: subject.point,
    improveTo: letter,
    improveToPoint: point,
    isCustom: true,
  }));

  const projectedGpa = (base.gpa * base.credits + maxGain / 2) / base.credits;
  const deficitGain = requiredGain - maxGain;
  const additionalCreditsNeeded = Math.ceil(deficitGain / (2 * 2.0));

  return {
    target,
    credits: base.credits,
    gpa: base.gpa,
    achieved: false,
    possible: false,
    customMode: true,
    suggestions,
    projectedGpa,
    deficit: deficitGain / 2,
    additionalCreditsNeeded,
  };
}

if (typeof process !== "undefined" && Array.isArray(process?.argv) && process.argv.includes("--self-check")) {
  console.assert(gradeOfScore10(8.5)?.point === 4, "8.5 must map to A");
  console.assert(gradeOfScore10(7.8)?.point === 3.5, "7.8 must map to B+");
  console.assert(gradeOfScore10(4)?.point === 1, "4.0 must map to D");
  const rows = [
    { courseId: "a", credits: 3, finalScore: 4 },
    { courseId: "a", credits: 3, finalScore: 8.5 },
    { courseId: "b", credits: 2, finalScore: 7, excludedFromGpa: true },
    { courseId: "c", credits: 2, finalScore: 5.5 },
    { courseId: "d", credits: 3, finalScore: 4, subjectName: "Giáo dục thể chất 1" },
  ];
  const result = calculateGpa(rows);
  console.assert(result.credits === 5 && Math.abs(result.gpa - 3.2) < 0.001, "attempt or exclusion rule failed");
  const plan = planGpa(rows, 3.6);
  console.assert(plan.possible && plan.suggestions.length === 1 && plan.suggestions[0].improveTo === "B", "minimum plan failed");
  const customPlan = solveCustomGpaPlan(rows, 3.6, ["c"]);
  console.assert(customPlan.customMode && customPlan.suggestions[0].key === "c", "custom plan selection failed");
  console.log("gpa self-check ok");
}
