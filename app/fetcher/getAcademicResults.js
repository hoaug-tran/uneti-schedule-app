import { callSupportApi } from "./supportApi.js";
import { saveAcademicResults } from "./academicDb.js";
import { getStudentId } from "./userStore.js";
import { createAuthError } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]+/g, " ")
    .trim();
}

export async function getAcademicResults() {
  logger.info("[academic] fetching academic results from support API");

  const studentId = await getStudentId();
  if (!studentId) {
    throw createAuthError("Student ID not found. Please log in to UNETI Support.");
  }

  const gradesUrl = `${CONFIG.UNETI_GRADES_ENDPOINT}?TC_SV_KetQuaHocTap_MaSinhVien=${encodeURIComponent(studentId)}`;
  const gpaUrl = `${CONFIG.UNETI_GPA_ENDPOINT}?TC_SV_KetQuaHocTap_MaSinhVien=${encodeURIComponent(studentId)}`;
  const scheduleUrl = `${CONFIG.UNETI_SCHEDULE_ENDPOINT}?TC_SV_KetQuaHocTap_MaSinhVien=${encodeURIComponent(studentId)}`;
  const curriculumUrl = `${CONFIG.UNETI_CURRICULUM_ENDPOINT}?MaSinhVien=${encodeURIComponent(studentId)}`;

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

  const studentKhoaHoc = ctkBody[0]?.TC_SV_ChuongTrinhKhung_KhoaHoc;
  const studentNganhHoc = ctkBody[0]?.TC_SV_ChuongTrinhKhung_NganhHoc;

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
      isTinhTBC: isTinhTBC !== false,
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
      item.TC_SV_ChuongTrinhKhung_MaHocPhan,
      item.TC_SV_ChuongTrinhKhung_TenHocPhan,
      item.TC_SV_ChuongTrinhKhung_SoTinChi,
      item.TC_SV_ChuongTrinhKhung_IsTinhTBC
    );
  }

  for (const item of ctkBody) {
    registerCurriculumCourse(
      item.TC_SV_ChuongTrinhKhung_MaHocPhan,
      item.TC_SV_ChuongTrinhKhung_TenHocPhan,
      item.TC_SV_ChuongTrinhKhung_SoTinChi,
      item.TC_SV_ChuongTrinhKhung_IsTinhTBC
    );
  }

  for (const item of gradesBody) {
    registerCurriculumCourse(
      item.TC_SV_KetQuaHocTap_MaHocPhan || item.TC_SV_KetQuaHocTap_MaMonHoc,
      item.TC_SV_KetQuaHocTap_TenMonHoc,
      item.TC_SV_KetQuaHocTap_SoTinChi,
      Number(item.TC_SV_KetQuaHocTap_KhongTinhDiemTBC) !== 1
    );
  }

  const semesterSummaries = {};
  for (const item of gpaBody) {
    const semName = item.TC_SV_KetQuaHocTap_TenDot || "Không rõ học kỳ";
    semesterSummaries[semName] = {
      semGpa10: item.TC_SV_KetQuaHocTap_DiemTrungBinhHocKy ?? null,
      semGpa4: item.TC_SV_KetQuaHocTap_DiemTrungBinhHocKy_He4 ?? null,
      cumGpa10: item.TC_SV_KetQuaHocTap_DiemTrungBinhTichLuy ?? null,
      cumGpa4: item.TC_SV_KetQuaHocTap_DiemTrungBinhTichLuy_He4 ?? null,
      registeredCredits: item.TC_SV_KetQuaHocTap_TongTinChi_DangKy ?? 0,
      accumulatedCredits: item.TC_SV_KetQuaHocTap_TongTinChi_TichLuy ?? 0,
      debtCredits: item.TC_SV_KetQuaHocTap_TongTinChi_No ?? 0,
      academicRank: item.TC_SV_KetQuaHocTap_XepLoaiHocLuc_TichLuy || "",
      semesterRank: "",
      academicAction: "",
      trainingPoint: item.TC_SV_KetQuaHocTap_DiemRenLuyen ?? null,
      trainingRank: item.TC_SV_KetQuaHocTap_DiemRenLuyen_XepLoai || "",
    };
  }

  const latestSem = gpaBody[0] || null;
  const globalSummary = latestSem
    ? {
        registeredCredits: latestSem.TC_SV_KetQuaHocTap_TongTinChi_DangKy ?? 0,
        accumulatedCredits: latestSem.TC_SV_KetQuaHocTap_TongTinChi_TichLuy ?? 0,
        debtCredits: latestSem.TC_SV_KetQuaHocTap_TongTinChi_No ?? 0,
        academicRank: latestSem.TC_SV_KetQuaHocTap_XepLoaiHocLuc_TichLuy || "",
        cumGpa4: latestSem.TC_SV_KetQuaHocTap_DiemTrungBinhTichLuy_He4 ?? null,
        cumGpa10: latestSem.TC_SV_KetQuaHocTap_DiemTrungBinhTichLuy ?? null,
      }
    : {
        registeredCredits: 0,
        accumulatedCredits: 0,
        debtCredits: 0,
        academicRank: "",
        cumGpa4: null,
        cumGpa10: null,
      };

  const gradeSubjects = gradesBody.map((g, sourceIndex) => {
    const letter = (g.TC_SV_KetQuaHocTap_DiemChu || "").trim().toUpperCase();
    const point = g.TC_SV_KetQuaHocTap_DiemTinChi ?? null;
    const finalScore = g.TC_SV_KetQuaHocTap_DiemTongKet ?? null;
    const isPending = !letter && point === null && finalScore === null;
    const subjectId = g.TC_SV_KetQuaHocTap_MaMonHoc || "";
    const courseId = g.TC_SV_KetQuaHocTap_MaHocPhan || "";
    const classSectionId = g.TC_SV_KetQuaHocTap_MaLopHocPhan || "";
    const excludedFromGpa = Number(g.TC_SV_KetQuaHocTap_KhongTinhDiemTBC) === 1;

    return {
      subjectId,
      courseId,
      classSectionId,
      excludedFromGpa,
      sourceIndex,
      subjectCode: classSectionId,
      subjectName: g.TC_SV_KetQuaHocTap_TenMonHoc || "",
      credits: g.TC_SV_KetQuaHocTap_SoTinChi ?? 0,
      letter,
      gradePoint: point,
      finalScore,
      isPending,
      semester: g.TC_SV_KetQuaHocTap_HocKy || "Không rõ học kỳ",
      className: g.TC_SV_KetQuaHocTap_TenLopHoc || "",
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
    const classSectionId = item.MaLopHocPhan || item.TC_SV_KetQuaHocTap_MaLopHocPhan || "";
    if (!classSectionId || gradeClassSectionIds.has(classSectionId) || scheduleSubjectMap.has(classSectionId)) {
      continue;
    }

    const subjectName = item.TenMonHoc || item.TC_SV_KetQuaHocTap_TenMonHoc || "";
    if (!subjectName) {
      continue;
    }

    let extractedCourseCode = item.MaHocPhan || item.TC_SV_KetQuaHocTap_MaHocPhan || item.MaMonHoc || "";
    if (!extractedCourseCode && classSectionId.length >= 10) {
      extractedCourseCode = classSectionId.slice(4, 10);
    }

    const matchedCurriculum =
      (extractedCourseCode ? curriculumMap.get(`code:${extractedCourseCode.toLowerCase()}`) : null) ||
      curriculumMap.get(`name:${normalizeText(subjectName)}`);

    const credits = matchedCurriculum?.credits ?? Number(item.SoTinChi ?? item.TC_SV_KetQuaHocTap_SoTinChi) ?? 0;
    const excludedFromGpa = matchedCurriculum ? !matchedCurriculum.isTinhTBC : false;
    const semesterLabel = item.TenDot || (item.HocKy && item.NamHoc ? `${item.HocKy} (${item.NamHoc})` : "Học kỳ hiện tại");

    scheduleSubjectMap.set(classSectionId, {
      subjectId: item.MaMonHoc || item.TC_SV_KetQuaHocTap_MaMonHoc || "",
      courseId: extractedCourseCode || classSectionId,
      classSectionId,
      excludedFromGpa,
      sourceIndex: gradeSubjects.length + scheduleSubjectMap.size,
      subjectCode: classSectionId,
      subjectName,
      credits,
      letter: "",
      gradePoint: null,
      finalScore: null,
      isPending: true,
      semester: semesterLabel,
      className: item.TenLopHoc || item.TC_SV_KetQuaHocTap_TenLopHoc || "",
      raw: item,
    });
  }

  const pendingSubjects = [...scheduleSubjectMap.values()];
  logger.info(`[academic] schedule contributed ${pendingSubjects.length} pending subjects`);

  const subjects = [...pendingSubjects, ...gradeSubjects];

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
