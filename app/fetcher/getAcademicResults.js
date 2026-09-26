import { callSupportApi } from "./supportApi.js";
import { saveAcademicResults } from "./academicDb.js";
import { getStudentId } from "./userStore.js";
import { createAuthError } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { API_FIELDS, NON_GPA_SUBJECT_PATTERNS } from "../constants.js";
import { normalizeText, courseKeyOf } from "../utils/format.js";
import { logger } from "../utils/logger.js";

export async function getAcademicResults() {
  logger.info("[academic] fetching academic results from support API");

  const studentId = await getStudentId();
  if (!studentId) {
    throw createAuthError("Student ID not found. Please log in to UNETI Support.");
  }

  const gradesUrl = `${CONFIG.UNETI_GRADES_ENDPOINT}?${API_FIELDS.GRADES_STUDENT_ID}=${encodeURIComponent(studentId)}`;
  const gpaUrl = `${CONFIG.UNETI_GPA_ENDPOINT}?${API_FIELDS.GRADES_STUDENT_ID}=${encodeURIComponent(studentId)}`;
  const scheduleUrl = `${CONFIG.UNETI_SCHEDULE_ENDPOINT}?${API_FIELDS.GRADES_STUDENT_ID}=${encodeURIComponent(studentId)}`;
  const curriculumUrl = `${CONFIG.UNETI_CURRICULUM_ENDPOINT}?${API_FIELDS.CURRICULUM_STUDENT_ID}=${encodeURIComponent(studentId)}`;

  const [gradesJson, gpaJson, schedJson, curriculumJson] = await Promise.all([
    callSupportApi({ endpoint: gradesUrl, method: "GET", label: "academic-grades" }),
    callSupportApi({ endpoint: gpaUrl, method: "GET", label: "academic-gpa" }),
    callSupportApi({ endpoint: scheduleUrl, method: "GET", label: "academic-schedule" }).catch(() => null),
    callSupportApi({ endpoint: curriculumUrl, method: "GET", label: "academic-curriculum" }).catch(() => null),
  ]);

  const gradesBody = gradesJson?.body || [];
  const gpaBody = gpaJson?.body || [];
  const schedBody = schedJson?.body || [];
  const ctkBody = curriculumJson?.body || (Array.isArray(curriculumJson) ? curriculumJson : []);

  const studentKhoaHoc = ctkBody[0]?.[API_FIELDS.CURRICULUM_KHOA_HOC];
  const studentNganhHoc = ctkBody[0]?.[API_FIELDS.CURRICULUM_NGANH_HOC];

  let majorCtkBody = [];
  if (studentKhoaHoc && studentNganhHoc && CONFIG.UNETI_MAJOR_CURRICULUM_ENDPOINT) {
    const majorCurriculumUrl = `${CONFIG.UNETI_MAJOR_CURRICULUM_ENDPOINT}?KhoaHoc=${encodeURIComponent(studentKhoaHoc)}&NganhHoc=${encodeURIComponent(studentNganhHoc)}`;
    const majorJson = await callSupportApi({ endpoint: majorCurriculumUrl, method: "GET", label: "academic-major-curriculum" }).catch(() => null);
    majorCtkBody = majorJson?.body || (Array.isArray(majorJson) ? majorJson : []);
  }

  const curriculumMap = new Map();
  function registerCurriculumCourse(code, name, credits, isTinhTBC) {
    const parsedCredits = Number(credits) || 0;
    const entry = {
      code: code ? String(code).trim() : "",
      name: name ? String(name).trim() : "",
      credits: parsedCredits,
      isTinhTBC: isTinhTBC === true || isTinhTBC === 1 || isTinhTBC === "1" || String(isTinhTBC).toLowerCase() === "true",
    };
    if (code) {
      curriculumMap.set(`code:${String(code).trim().toLowerCase()}`, entry);
    }
    if (name) {
      curriculumMap.set(`name:${normalizeText(name)}`, entry);
    }
  }

  for (const item of majorCtkBody) {
    registerCurriculumCourse(
      item[API_FIELDS.CURRICULUM_COURSE_ID],
      item[API_FIELDS.CURRICULUM_COURSE_NAME],
      item[API_FIELDS.CURRICULUM_CREDITS],
      item[API_FIELDS.CURRICULUM_IS_GPA]
    );
  }

  for (const item of ctkBody) {
    registerCurriculumCourse(
      item[API_FIELDS.CURRICULUM_COURSE_ID],
      item[API_FIELDS.CURRICULUM_COURSE_NAME],
      item[API_FIELDS.CURRICULUM_CREDITS],
      item[API_FIELDS.CURRICULUM_IS_GPA]
    );
  }

  for (const item of gradesBody) {
    const rawExclude = item[API_FIELDS.GRADES_EXCLUDED_GPA];
    const isExcluded = rawExclude === true || rawExclude === 1 || rawExclude === "1" || String(rawExclude).toLowerCase() === "true";
    registerCurriculumCourse(
      item[API_FIELDS.GRADES_COURSE_ID] || item[API_FIELDS.GRADES_SUBJECT_ID],
      item[API_FIELDS.GRADES_SUBJECT_NAME],
      item[API_FIELDS.GRADES_CREDITS],
      !isExcluded
    );
  }

  const semesterSummaries = {};
  for (const item of gpaBody) {
    const semName = item[API_FIELDS.GPA_SEMESTER_NAME] || "Không rõ học kỳ";
    semesterSummaries[semName] = {
      semGpa10: item[API_FIELDS.GPA_SEMESTER_10] ?? null,
      semGpa4: item[API_FIELDS.GPA_SEMESTER_4] ?? null,
      cumGpa10: item[API_FIELDS.GPA_CUMULATIVE_10] ?? null,
      cumGpa4: item[API_FIELDS.GPA_CUMULATIVE_4] ?? null,
      registeredCredits: item[API_FIELDS.GPA_REGISTERED_CREDITS] ?? 0,
      accumulatedCredits: item[API_FIELDS.GPA_ACCUMULATED_CREDITS] ?? 0,
      debtCredits: item[API_FIELDS.GPA_DEBT_CREDITS] ?? 0,
      academicRank: item[API_FIELDS.GPA_ACADEMIC_RANK] || "",
      semesterRank: "",
      academicAction: "",
      trainingPoint: item[API_FIELDS.GPA_TRAINING_POINT] ?? null,
      trainingRank: item[API_FIELDS.GPA_TRAINING_RANK] || "",
    };
  }

  const latestSem = gpaBody[0] || null;
  const globalSummary = latestSem
    ? {
        registeredCredits: latestSem[API_FIELDS.GPA_REGISTERED_CREDITS] ?? 0,
        accumulatedCredits: latestSem[API_FIELDS.GPA_ACCUMULATED_CREDITS] ?? 0,
        debtCredits: latestSem[API_FIELDS.GPA_DEBT_CREDITS] ?? 0,
        academicRank: latestSem[API_FIELDS.GPA_ACADEMIC_RANK] || "",
        cumGpa4: latestSem[API_FIELDS.GPA_CUMULATIVE_4] ?? null,
        cumGpa10: latestSem[API_FIELDS.GPA_CUMULATIVE_10] ?? null,
      }
    : {
        registeredCredits: 0,
        accumulatedCredits: 0,
        debtCredits: 0,
        academicRank: "",
        cumGpa4: null,
        cumGpa10: null,
      };

  const gradeSubjects = gradesBody.map((g) => {
    const letter = (g[API_FIELDS.GRADES_LETTER] || "").trim().toUpperCase();
    const point = g[API_FIELDS.GRADES_GRADE_POINT] ?? null;
    const finalScore = g[API_FIELDS.GRADES_FINAL_SCORE] ?? null;
    const isPending = !letter && point === null && finalScore === null;
    const subjectId = g[API_FIELDS.GRADES_SUBJECT_ID] || "";
    const courseId = g[API_FIELDS.GRADES_COURSE_ID] || "";
    const classSectionId = g[API_FIELDS.GRADES_CLASS_SECTION_ID] || "";
    const subjectName = g[API_FIELDS.GRADES_SUBJECT_NAME] || "";

    const rawExclude = g[API_FIELDS.GRADES_EXCLUDED_GPA];
    const isMarkedExclude =
      rawExclude === true ||
      rawExclude === 1 ||
      rawExclude === "1" ||
      String(rawExclude).toLowerCase() === "true";

    const matchedCurriculum =
      (courseId ? curriculumMap.get(`code:${courseId.toLowerCase()}`) : null) ||
      curriculumMap.get(`name:${normalizeText(subjectName)}`);

    let isPatternExcluded = false;
    for (const pattern of NON_GPA_SUBJECT_PATTERNS) {
      if (pattern.test(subjectName) || pattern.test(courseId)) {
        isPatternExcluded = true;
        break;
      }
    }

    const credits = g[API_FIELDS.GRADES_CREDITS] ?? matchedCurriculum?.credits ?? 0;
    const excludedFromGpa =
      isMarkedExclude ||
      (matchedCurriculum ? !matchedCurriculum.isTinhTBC : false) ||
      isPatternExcluded ||
      Number(credits) <= 0;

    const courseKey = courseKeyOf({ courseId, subjectId, classSectionId });

    return {
      subjectId,
      courseId,
      classSectionId,
      courseKey,
      excludedFromGpa,
      subjectCode: classSectionId || courseId,
      subjectName,
      credits,
      letter,
      gradePoint: point,
      finalScore,
      isPending,
      semester: g[API_FIELDS.GRADES_SEMESTER] || "Không rõ học kỳ",
      className: g[API_FIELDS.GRADES_CLASS_NAME] || "",
      raw: g,
    };
  });

  const gradeClassSectionIds = new Set(gradeSubjects.map((s) => s.classSectionId).filter(Boolean));

  const schedDots = [...new Set(schedBody.map((x) => x.TenDot).filter(Boolean))];
  const latestSchedDot = schedDots.length > 0 ? schedDots[schedDots.length - 1] : null;
  const currentSchedItems = latestSchedDot
    ? schedBody.filter((item) => item.TenDot === latestSchedDot)
    : schedBody;

  const scheduleSubjectMap = new Map();
  for (const item of currentSchedItems) {
    const classSectionId = item.MaLopHocPhan || item[API_FIELDS.GRADES_CLASS_SECTION_ID] || "";
    if (!classSectionId || gradeClassSectionIds.has(classSectionId) || scheduleSubjectMap.has(classSectionId)) {
      continue;
    }

    const subjectName = item.TenMonHoc || item[API_FIELDS.GRADES_SUBJECT_NAME] || "";
    if (!subjectName) {
      continue;
    }

    let extractedCourseCode = item.MaHocPhan || item[API_FIELDS.GRADES_COURSE_ID] || item.MaMonHoc || "";
    if (!extractedCourseCode && classSectionId.length >= 10) {
      extractedCourseCode = classSectionId.slice(4, 10);
    }

    const matchedCurriculum =
      (extractedCourseCode ? curriculumMap.get(`code:${extractedCourseCode.toLowerCase()}`) : null) ||
      curriculumMap.get(`name:${normalizeText(subjectName)}`);

    let isPatternExcluded = false;
    for (const pattern of NON_GPA_SUBJECT_PATTERNS) {
      if (pattern.test(subjectName) || pattern.test(extractedCourseCode)) {
        isPatternExcluded = true;
        break;
      }
    }

    const credits = matchedCurriculum?.credits ?? Number(item.SoTinChi ?? item[API_FIELDS.GRADES_CREDITS]) ?? 0;
    const excludedFromGpa =
      (matchedCurriculum ? !matchedCurriculum.isTinhTBC : false) ||
      isPatternExcluded ||
      credits <= 0;

    const semesterLabel = item.TenDot || (item.HocKy && item.NamHoc ? `${item.HocKy} (${item.NamHoc})` : "Học kỳ hiện tại");
    const courseKey = courseKeyOf({ courseId: extractedCourseCode, classSectionId });

    scheduleSubjectMap.set(classSectionId, {
      subjectId: item.MaMonHoc || item[API_FIELDS.GRADES_SUBJECT_ID] || "",
      courseId: extractedCourseCode || classSectionId,
      classSectionId,
      courseKey,
      excludedFromGpa,
      subjectCode: classSectionId,
      subjectName,
      credits,
      letter: "",
      gradePoint: null,
      finalScore: null,
      isPending: true,
      semester: semesterLabel,
      className: item.TenLopHoc || item[API_FIELDS.GRADES_CLASS_NAME] || "",
      raw: item,
    });
  }

  const pendingSubjects = [...scheduleSubjectMap.values()];
  logger.info(`[academic] schedule contributed ${pendingSubjects.length} pending subjects`);

  const combined = [...pendingSubjects, ...gradeSubjects];
  const subjects = combined.map((item, index) => ({
    ...item,
    sourceIndex: index,
  }));

  const parsed = {
    source_url: "https://support.uneti.edu.vn/hoc-tap/ket-qua-hoc-tap",
    subjects,
    summary: globalSummary,
    semesterSummaries,
  };

  await saveAcademicResults(parsed);
  logger.info(`[academic] saved ${subjects.length} subjects and GPA summaries`);
  return parsed;
}
