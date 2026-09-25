const TARGETS = { excellent: 3.6, good: 3.2, fair: 2.5 };
const LETTER_POINTS = { "A+": 4, A: 4, "B+": 3.5, B: 3, "C+": 2.5, C: 2, "D+": 1.5, D: 1, F: 0 };
const GRADE_BANDS = [
  [8.5, 4, "A"],
  [7.8, 3.5, "B+"],
  [7, 3, "B"],
  [6.3, 2.5, "C+"],
  [5.5, 2, "C"],
  [4.8, 1.5, "D+"],
  [4, 1, "D"],
  [0, 0, "F"],
];

function numberOf(value) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function creditsOf(row) {
  return numberOf(row?.credits ?? row?.soTinChi ?? row?.tinChi);
}

function courseKeyOf(row) {
  return String(row?.courseId ?? row?.maHocPhan ?? row?.subjectId ?? row?.maMonHoc ?? row?.subjectCode ?? row?.code ?? "").trim().toLowerCase();
}

function sourceIndexOf(row, fallback) {
  return Number.isInteger(row?.sourceIndex) ? row.sourceIndex : fallback;
}

export function gradeOfScore10(value) {
  const score = numberOf(value);
  if (score === null || score < 0 || score > 10) return null;
  const [, point, letter] = GRADE_BANDS.find(([minimum]) => score >= minimum);
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
  return !(row?.excludedFromGpa === true || row?.khongTinhDiemTBC === true || Number(row?.khongTinhDiemTBC) === 1);
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
  const target = TARGETS[targetKey] ?? numberOf(targetKey);
  if (target === null || target < 0 || target > 4) throw new Error("Invalid GPA target");
  return target;
}

function candidatesOf(subject) {
  return GRADE_BANDS
    .map(([, point, letter]) => ({ point, letter, gain: Math.round((point - subject.point) * subject.credit * 2) }))
    .filter((candidate) => candidate.gain > 0);
}

export function planGpa(subjects = [], targetKey) {
  const target = targetOf(targetKey);
  const base = calculateGpa(subjects);
  const requiredGain = Math.ceil(Math.max(0, target * base.credits - base.gpa * base.credits) * 2 - 1e-9);
  if (!requiredGain) return { target, credits: base.credits, gpa: base.gpa, achieved: true, possible: true, suggestions: [], equivalentGroups: [] };

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
  if (!viable.length) return { target, credits: base.credits, gpa: base.gpa, achieved: false, possible: false, suggestions: [], equivalentGroups: [] };
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
  }));
  const projectedGpa = (base.gpa * base.credits + gain / 2) / base.credits;
  const equivalentGroups = suggestions.map((suggestion) => ({
    improveTo: suggestion.improveTo,
    alternatives: base.subjects
      .filter((subject) => subject.courseKey !== suggestion.key)
      .filter((subject) => Math.round((suggestion.improveToPoint - subject.point) * subject.credit * 2) === Math.round((suggestion.improveToPoint - suggestion.point) * suggestion.credit * 2))
      .map((subject) => ({ index: subject.sourceIndex, key: subject.courseKey, subjectCode: subject.courseId ?? subject.subjectCode ?? "", subjectName: subject.subjectName ?? subject.name ?? "" })),
  })).filter((group) => group.alternatives.length);
  return { target, credits: base.credits, gpa: base.gpa, achieved: false, possible: true, suggestions, equivalentGroups, projectedGpa };
}

if (process.argv.includes("--self-check")) {
  console.assert(gradeOfScore10(8.5)?.point === 4, "8.5 must map to A");
  console.assert(gradeOfScore10(7.8)?.point === 3.5, "7.8 must map to B+");
  console.assert(gradeOfScore10(4)?.point === 1, "4.0 must map to D");
  const rows = [
    { courseId: "a", credits: 3, finalScore: 4 },
    { courseId: "a", credits: 3, finalScore: 8.5 },
    { courseId: "b", credits: 2, finalScore: 7, excludedFromGpa: true },
    { courseId: "c", credits: 2, finalScore: 5.5 },
  ];
  const result = calculateGpa(rows);
  console.assert(result.credits === 5 && Math.abs(result.gpa - 3.2) < 0.001, "attempt or exclusion rule failed");
  const plan = planGpa(rows, 3.6);
  console.assert(plan.possible && plan.suggestions.length === 1 && plan.suggestions[0].improveTo === "B", "minimum plan failed");
  console.log("gpa self-check ok");
}
