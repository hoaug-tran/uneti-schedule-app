const TARGETS = { excellent: 3.6, good: 3.2, fair: 2.5 };
const LETTER_POINTS = { "A+": 4, A: 4, "B+": 3.5, B: 3, "C+": 2.5, C: 2, "D+": 1.5, D: 1, F: 0 };

export function isGpaSubject(s) {
  const name = String(s?.subjectName ?? s?.name ?? s?.tenMonHoc ?? "").toLowerCase().trim();
  if (!name) return false;
  if (name.includes("giáo dục thể chất") || name.includes("gdtc")) return false;
  if (name.includes("giáo dục quốc phòng") || name.includes("gdqp")) return false;
  if (name.includes("điểm test") || name.includes("toeic")) return false;
  return true;
}

export function gradePointOf(row) {
  const p = Number.parseFloat(String(row.gradePoint ?? row.diemTinChi ?? "").replace(",", "."));
  if (Number.isFinite(p)) return p;
  return LETTER_POINTS[String(row.letter ?? row.diemChu ?? "").trim().toUpperCase()] ?? null;
}

export function deduplicateGpaSubjects(subjects = []) {
  const map = new Map();
  for (const s of subjects) {
    if (!isGpaSubject(s)) continue;
    const credit = Number.parseFloat(String(s.credits ?? s.soTinChi ?? s.tinChi ?? "").replace(",", "."));
    const point = gradePointOf(s);
    if (!Number.isFinite(credit) || credit <= 0 || point === null) continue;

    const key = (s.subjectCode || s.code || s.subjectName || s.name || "").trim().toLowerCase();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...s, credit, point });
    } else {
      const existing = map.get(key);
      if (point > existing.point) {
        map.set(key, { ...s, credit, point });
      }
    }
  }
  return Array.from(map.values());
}

export function calculateGpa(subjects = []) {
  let credits = 0;
  let weighted = 0;
  const uniqueGpaSubjects = deduplicateGpaSubjects(subjects);
  for (const s of uniqueGpaSubjects) {
    credits += s.credit;
    weighted += s.credit * s.point;
  }
  return { credits, gpa: credits ? weighted / credits : 0 };
}

export function planGpa(subjects = [], targetKey) {
  const target = TARGETS[targetKey] ?? Number(targetKey);
  const uniqueGpaSubjects = deduplicateGpaSubjects(subjects);
  const base = calculateGpa(subjects);
  if (!Number.isFinite(target)) throw new Error("Invalid GPA target");
  if (base.gpa >= target) return { target, ...base, achieved: true, suggestions: [] };

  const need = target * base.credits - base.gpa * base.credits;
  let gained = 0;
  const suggestions = uniqueGpaSubjects
    .map((s) => {
      const origMatchIndex = subjects.findIndex((item) => {
        const itemKey = (item.subjectCode || item.code || item.subjectName || item.name || "").trim().toLowerCase();
        const sKey = (s.subjectCode || s.code || s.subjectName || s.name || "").trim().toLowerCase();
        return itemKey && sKey && itemKey === sKey;
      });
      if (s.point >= 4) return null;
      return {
        index: origMatchIndex >= 0 ? origMatchIndex : subjects.indexOf(s),
        key: (s.subjectCode || s.subjectName || "").trim().toLowerCase(),
        subjectCode: s.subjectCode || s.code || "",
        subjectName: s.subjectName || s.name || "",
        credit: s.credit,
        point: s.point,
        gainToA: (4 - s.point) * s.credit
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.gainToA - a.gainToA)
    .map((x) => {
      if (gained >= need) return null;
      gained += x.gainToA;
      return { ...x, improveTo: "A", projectedGpa: (base.gpa * base.credits + gained) / base.credits };
    })
    .filter(Boolean);

  return { target, ...base, achieved: false, suggestions, possible: base.gpa * base.credits + gained >= target * base.credits };
}

if (process.argv.includes("--self-check")) {
  const subjects = [
    { subjectName: "A", credits: 3, letter: "B" },
    { subjectName: "B", credits: 2, letter: "C" },
  ];
  const p = planGpa(subjects, "good");
  console.assert(Math.abs(calculateGpa(subjects).gpa - 2.6) < 0.001, "GPA calc failed");
  console.assert(p.suggestions[0].improveTo === "A", "plan failed");
  console.log("gpa self-check ok");
}
