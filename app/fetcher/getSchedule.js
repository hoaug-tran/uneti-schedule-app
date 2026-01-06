import { weekKey } from "../utils/date.js";
import * as cheerio from "cheerio";
import { parseScheduleFromFragment } from "./parseScheduleFromFragment.js";
import { buildCookieHeader } from "./cookieManager.js";
import {
  saveSchedule,
  loadSchedule,
  deleteAllSchedules,
} from "./scheduleDb.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

let lastOffsets = null;

function withTimeout(promise, ms = CONFIG.HTTP_TIMEOUT_MS, label = "request") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
async function postWeek(cookieHeader, body, label) {
  const res = await withTimeout(
    fetch(CONFIG.UNETI_SCHEDULE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookieHeader,
      },
      body,
    }),
    CONFIG.HTTP_TIMEOUT_MS,
    label
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} when fetching schedule (${label}). ${txt.slice(
        0,
        120
      )}`
    );
  }
  return res.text();
}

function dmyToDate(s) {
  const [dd, mm, yyyy] = s.split("/").map((n) => parseInt(n, 10));
  return new Date(yyyy, mm - 1, dd);
}

function dateToDMY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function looksLoggedOut(html) {
  try {
    const $ = cheerio.load(html);
    const hasLogout =
      $('a[href*="DangXuat"]').length > 0 ||
      $('form[action*="DangXuat"]').length > 0 ||
      $('a[href*="logout"]').length > 0;

    if (hasLogout) return false;

    const hasOffsets =
      $("#firstDateOffWeek").length > 0 ||
      $("#firstDateNextOffWeek").length > 0 ||
      $("#firstDatePrevOffWeek").length > 0;
    if (hasOffsets) return false;

    const hasScheduleTable =
      $("table.fl-table").length > 0 ||
      $("thead th").length > 0 ||
      $("div.content").length > 0;
    if (hasScheduleTable) return false;

    const hasLoginForm =
      $('form[action*="dang-nhap"], form[action*="DangNhap"]').length > 0 &&
      $('input[type="password"]').length > 0;

    return hasLoginForm;
  } catch {
    return false;
  }
}

function extractOffsets(html) {
  const $ = cheerio.load(html);
  let prev =
    $("#firstDatePrevOffWeek").val() ||
    $('input[name="firstDatePrevOffWeek"]').val() ||
    null;
  let current =
    $("#firstDateOffWeek").val() ||
    $('input[name="firstDateOffWeek"]').val() ||
    null;
  let next =
    $("#firstDateNextOffWeek").val() ||
    $('input[name="firstDateNextOffWeek"]').val() ||
    null;
  if (current) return { prev, current, next };

  const m = html.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  if (m) {
    const cur = m[1];
    const d = dmyToDate(cur);
    const p = new Date(d);
    p.setDate(p.getDate() - 7);
    const n = new Date(d);
    n.setDate(n.getDate() + 7);
    return { prev: dateToDMY(p), current: cur, next: dateToDMY(n) };
  }

  const any = html.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (any) {
    const cur = any[1];
    const d = dmyToDate(cur);
    const p = new Date(d);
    p.setDate(p.getDate() - 7);
    const n = new Date(d);
    n.setDate(n.getDate() + 7);
    return { prev: dateToDMY(p), current: cur, next: dateToDMY(n) };
  }
  return { prev: null, current: null, next: null };
}

export async function clearAllSchedules() {
  try {
    deleteAllSchedules();
    logger.info("[clearAllSchedules] removed all schedules");
  } catch (err) {
    logger.warn("[clearAllSchedules] fail:", err?.message);
  }
}

async function loadOffsetsFromDb(baseDate = new Date()) {
  try {
    const key = weekKey(baseDate);
    const data = loadSchedule(key);
    return data?.offsets || null;
  } catch (err) {
    logger.warn("[loadOffsetsFromDb] fail:", err?.message);
    return null;
  }
}

async function processFragment(fragment, target, offsets) {
  const data = parseScheduleFromFragment(fragment) || [];
  logger.debug(`[processFragment] parsed data length: ${data.length}`);

  if (data.length > 0) {
    const subjects = [...new Set(data.map(d => d.subject))].join(", ");
    const dayCount = [...new Set(data.map(d => d.day))].length;
    logger.info(`[processFragment] Week ${target}: ${data.length} classes, ${dayCount} days, subjects: ${subjects}`);
  } else {
    logger.info(`[processFragment] Week ${target}: No classes (empty week)`);
  }

  const weekStart = dmyToDate(target);
  const key = weekKey(weekStart);

  await saveSchedule(key, weekStart.toISOString(), data, offsets);
  logger.debug(`[processFragment] saved to database: ${key}`);

  return { offsets, weekStart, data };
}

export async function getSchedule(offset = 0, baseDate = null) {
  logger.debug(`[getSchedule] start offset: ${offset} baseDate: ${baseDate}`);

  const cookieHeader = await buildCookieHeader();
  if (!cookieHeader) throw new Error("No cookies");
  logger.debug(`[getSchedule] cookie header length: ${cookieHeader.length}`);

  let target;

  if (baseDate) {
    const d = new Date(baseDate);
    if (Number.isFinite(d.getTime())) {
      target = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1
      ).padStart(2, "0")}/${d.getFullYear()}`;
      logger.debug(`[getSchedule] using baseDate as target: ${target}`);
      const fragment = await postWeek(
        cookieHeader,
        `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
        `week:${target}`
      );
      logger.debug(`[getSchedule] fragment length: ${fragment.length}`);
      if (looksLoggedOut(fragment)) throw new Error("Cookie expired");
      lastOffsets = extractOffsets(fragment);
      if (!lastOffsets.current) lastOffsets.current = target;
      logger.debug("[getSchedule] offsets:", lastOffsets);
      return await processFragment(fragment, lastOffsets.current, lastOffsets);
    } else {
      logger.warn("[getSchedule] baseDate invalid, fallback to offset logic");
    }
  }

  if (offset === 0) {
    const fragment = await postWeek(
      cookieHeader,
      "pNgayHienTai=&pLoaiLich=0",
      "week:current"
    );
    logger.debug(`[getSchedule] fragment length: ${fragment.length}`);
    if (looksLoggedOut(fragment)) throw new Error("Cookie expired");

    lastOffsets = extractOffsets(fragment);
    logger.debug("[getSchedule] offsets:", lastOffsets);

    target = lastOffsets.current;
    if (!target) {
      logger.warn(`[getSchedule] target invalid: ${target}`);
      return null;
    }

    return await processFragment(fragment, target, lastOffsets);
  }

  if (!baseDate) {
    if (!lastOffsets) {
      lastOffsets = await loadOffsetsFromDb(new Date());
      if (!lastOffsets) {
        logger.warn("[getSchedule] no lastOffsets, fallback to current week");
        return await getSchedule(0);
      }
    }
    if (offset === -1) target = lastOffsets?.prev;
    if (offset === 1) target = lastOffsets?.next;
  } else {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset * 7);
    target = `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
    logger.debug(`[getSchedule] calculated target from baseDate: ${target}`);
  }

  if (!target) {
    logger.warn("[getSchedule] no target week");
    return null;
  }

  const fragment = await postWeek(
    cookieHeader,
    `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
    `week:${target}`
  );
  logger.debug(`[getSchedule] fetched new fragment length: ${fragment.length}`);
  if (looksLoggedOut(fragment)) throw new Error("Cookie expired");

  lastOffsets = extractOffsets(fragment);
  if (!lastOffsets.current) lastOffsets.current = target;

  logger.debug("[getSchedule] new offsets:", lastOffsets);

  return await processFragment(fragment, target, lastOffsets);
}
