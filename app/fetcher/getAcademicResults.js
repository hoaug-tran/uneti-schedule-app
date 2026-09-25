import { callSupportApi } from "./supportApi.js";
import { saveAcademicResults } from "./academicDb.js";
import { getStudentId } from "./userStore.js";
import { createAuthError } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

export async function getAcademicResults() {
  logger.info("[academic] fetching academic results from support API");

  const studentId = await getStudentId();
  if (!studentId) {
    throw createAuthError("Student ID not found. Please log in to UNETI Support.");
  }

  const gradesUrl = `${CONFIG.UNETI_GRADES_ENDPOINT}?TC_SV_KetQuaHocTap_MaSinhVien=${encodeURIComponent(studentId)}`;
  const gpaUrl = `${CONFIG.UNETI_GPA_ENDPOINT}?TC_SV_KetQuaHocTap_MaSinhVien=${encodeURIComponent(studentId)}`;

  const [gradesJson, gpaJson] = await Promise.all([
    callSupportApi({
      endpoint: gradesUrl,
      method: "GET",
      label: "academic-grades",
    }),
    callSupportApi({
      endpoint: gpaUrl,
      method: "GET",
      label: "academic-gpa",
    }),
  ]);

  const gradesBody = gradesJson?.body || [];
  const gpaBody = gpaJson?.body || [];

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

  const subjects = gradesBody.map((g) => {
    const letter = (g.TC_SV_KetQuaHocTap_DiemChu || "").trim().toUpperCase();
    const point = g.TC_SV_KetQuaHocTap_DiemTinChi ?? null;
    const finalScore = g.TC_SV_KetQuaHocTap_DiemTongKet ?? null;
    const isPending = !letter && point === null && finalScore === null;

    return {
      subjectCode: g.TC_SV_KetQuaHocTap_MaLopHocPhan || "",
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
