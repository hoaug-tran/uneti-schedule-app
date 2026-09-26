import { weekKey, startOfWeek, formatYMDLocal, parseYMDLocal } from "../utils/date.js";
import { callSupportApi } from "./supportApi.js";
import { getStudentId } from "./userStore.js";
import { createAuthError, isAuthError } from "./sessionState.js";
import {
  saveAllSchedules,
  loadScheduleAsync,
  deleteAllSchedules,
} from "./scheduleDb.js";
import { CONFIG } from "../config.js";
import { API_FIELDS } from "../constants.js";
import { logger } from "../utils/logger.js";

const inFlightRequests = new Map();

function dateToDMY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function clearAllSchedules() {
  try {
    await deleteAllSchedules();
    logger.info("[clearAllSchedules] removed all schedules");
  } catch (err) {
    logger.warn("[clearAllSchedules] fail:", err?.message);
  }
}

function mapClassItem(item) {
  const day = (item.NgayBatDau || "").slice(0, 10);
  const periods = [];
  const from = item.TuTiet || 0;
  const to = item.DenTiet || from;
  for (let p = from; p <= to; p++) periods.push(p);

  let type = "LT";
  const nameLower = (item.TenMonHoc || "").toLowerCase();
  const roomLower = (item.TenPhong || "").toLowerCase();
  if (nameLower.includes("thực hành") || roomLower.includes("th") || roomLower.includes("lab")) {
    type = "TH";
  } else if (roomLower.includes("online") || roomLower.includes("zoom") || roomLower.includes("meet")) {
    type = "Online";
  }

  const room = (item.TenPhong || "").replace(/^Phòng học\//i, "").trim();

  return {
    day,
    session: item.CaHoc || "Sáng",
    subject: item.TenMonHoc || "",
    classInfo: [item.TenLopHoc, item.MaLopHocPhan].filter(Boolean).join(" - "),
    periods,
    room,
    teacher: item.TenGiangVien || "",
    type,
    raw: item,
  };
}

function mapExamItem(item) {
  const day = (item.TC_SV_KetQuaHocTap_LichThiSinhVien_NgayThi || "").slice(0, 10);
  const from = item.TC_SV_KetQuaHocTap_LichThiSinhVien_TuTiet || 0;
  const to = item.TC_SV_KetQuaHocTap_LichThiSinhVien_DenTiet || from;
  const periods = [];
  for (let p = from; p <= to; p++) periods.push(p);

  const room = (item.TC_SV_KetQuaHocTap_LichThiSinhVien_TenPhong || "").replace(/^Phòng học\//i, "").trim();
  const loaiThi = item.TC_SV_KetQuaHocTap_LichThiSinhVien_LoaiThi || "Thi";

  return {
    day,
    session: item.TC_SV_KetQuaHocTap_LichThiSinhVien_CaThi || "Sáng",
    subject: item.TC_SV_KetQuaHocTap_LichThiSinhVien_TenMonHoc || "",
    classInfo: [item.TC_SV_KetQuaHocTap_LichThiSinhVien_MaLopHocPhan, loaiThi].filter(Boolean).join(" - "),
    periods,
    room,
    teacher: "",
    type: "Thi",
    raw: item,
  };
}

function createOffsetsForDate(weekMonday) {
  const prevD = new Date(weekMonday);
  prevD.setDate(prevD.getDate() - 7);
  const nextD = new Date(weekMonday);
  nextD.setDate(nextD.getDate() + 7);

  return {
    prev: dateToDMY(prevD),
    current: dateToDMY(weekMonday),
    next: dateToDMY(nextD),
  };
}

export async function getSchedule(offset = 0, baseDate = null) {
  const reqKey = `${offset}:${baseDate || "current"}`;
  if (inFlightRequests.has(reqKey)) {
    return inFlightRequests.get(reqKey);
  }

  const p = executeGetSchedule(offset, baseDate);
  inFlightRequests.set(reqKey, p);
  try {
    return await p;
  } finally {
    inFlightRequests.delete(reqKey);
  }
}

async function executeGetSchedule(offset = 0, baseDate = null) {
  logger.debug(`[getSchedule] start offset: ${offset} baseDate: ${baseDate}`);

  let targetDate;
  if (baseDate) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset * 7);
    targetDate = startOfWeek(d);
  } else {
    const d = new Date();
    d.setDate(d.getDate() + offset * 7);
    targetDate = startOfWeek(d);
  }

  const requestedKey = formatYMDLocal(targetDate);
  const cached = await loadScheduleAsync(requestedKey);

  const studentId = await getStudentId();
  if (!studentId) {
    if (cached) return { offsets: cached.offsets, weekStart: targetDate, data: cached.data };
    throw createAuthError("No student logged in. Please log in first.");
  }

  const scheduleUrl = `${CONFIG.UNETI_SCHEDULE_ENDPOINT}?${API_FIELDS.GRADES_STUDENT_ID}=${encodeURIComponent(studentId)}`;
  const examUrl = `${CONFIG.UNETI_EXAM_ENDPOINT}?${API_FIELDS.GRADES_STUDENT_ID}=${encodeURIComponent(studentId)}`;

  try {
    const [schedJson, examJson] = await Promise.all([
      callSupportApi({
        endpoint: scheduleUrl,
        method: "GET",
        label: "schedule-classes",
      }),
      callSupportApi({
        endpoint: examUrl,
        method: "GET",
        label: "schedule-exams",
      }),
    ]);

    const schedItems = schedJson?.body || [];
    const examItems = examJson?.body || [];

    const mappedClasses = schedItems.map(mapClassItem).filter((c) => !!c.day);
    const mappedExams = examItems.map(mapExamItem).filter((c) => !!c.day);
    const allItems = [...mappedClasses, ...mappedExams];

    const weeksMap = new Map();
    for (const item of allItems) {
      const itemDate = new Date(`${item.day}T00:00:00`);
      const wKey = weekKey(itemDate);
      if (!weeksMap.has(wKey)) weeksMap.set(wKey, []);
      weeksMap.get(wKey).push(item);
    }

    const batch = {};
    for (const [wKey, items] of weeksMap.entries()) {
      const monday = parseYMDLocal(wKey);
      const offsets = createOffsetsForDate(monday);
      batch[wKey] = {
        week_start: monday.toISOString(),
        data: items,
        offsets,
        updated_at: Date.now(),
      };
    }

    const requestedOffsets = createOffsetsForDate(targetDate);
    const requestedData = weeksMap.get(requestedKey) || [];

    if (!batch[requestedKey]) {
      batch[requestedKey] = {
        week_start: targetDate.toISOString(),
        data: requestedData,
        offsets: requestedOffsets,
        updated_at: Date.now(),
      };
    }

    await saveAllSchedules(batch);

    return {
      offsets: requestedOffsets,
      weekStart: targetDate,
      data: requestedData,
    };
  } catch (err) {
    if (isAuthError(err)) {
      if (cached) {
        logger.warn(`[getSchedule] Auth error, returning cached schedule with authError flag for ${requestedKey}`);
        return { offsets: cached.offsets, weekStart: targetDate, data: cached.data, authError: true };
      }
      throw err;
    }
    if (cached) {
      logger.info(`[getSchedule] API error, using cached schedule for ${requestedKey}`);
      return { offsets: cached.offsets, weekStart: targetDate, data: cached.data };
    }
    throw err;
  }
}
