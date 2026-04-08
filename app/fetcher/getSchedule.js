import { weekKey } from "../utils/date.js";
import * as cheerio from "cheerio";
import { parseScheduleFromFragment } from "./parseScheduleFromFragment.js";
import { getCookiePartition } from "./cookieManager.js";
import { postViaWindow } from "./fetchViaWindow.js";
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

async function postWeek(_unused, body, label) {
  // Dùng fetchViaWindow — chạy fetch trong Chromium renderer thật để bypass Cloudflare
  return withTimeout(
    postViaWindow(body, label),
    CONFIG.HTTP_TIMEOUT_MS,
    label
  );
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
    if (
      html.includes("Just a moment") ||
      html.includes("Performing security verification") ||
      html.includes("cf-browser-verification") ||
      html.includes("cf_clearance")
    ) {
      return true;
    }

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

async function refreshSession() {
  try {
    logger.info("[refreshSession] Attempting to refresh server session");

    const now = new Date();
    const currentDate = dateToDMY(now);

    const res = await withTimeout(
      sessionFetch(CONFIG.UNETI_SCHEDULE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": "https://sinhvien.uneti.edu.vn/lich-theo-tuan.html",
          "Origin": "https://sinhvien.uneti.edu.vn",
        },
        body: `pNgayHienTai=${encodeURIComponent(currentDate)}&pLoaiLich=0`,
      }),
      CONFIG.HTTP_TIMEOUT_MS,
      "session-refresh"
    );

    if (res.ok) {
      logger.info(`[refreshSession] Session refreshed successfully with date: ${currentDate}`);
      return true;
    } else {
      logger.warn(`[refreshSession] Failed with status ${res.status}`);
      return false;
    }
  } catch (err) {
    logger.warn(`[refreshSession] Error: ${err?.message}`);
    return false;
  }
}

function validateOffsets(offsets, allowStale = false) {
  if (!offsets?.current) return true;

  try {
    const currentWeek = dmyToDate(offsets.current);
    const now = new Date();
    const diffMs = Math.abs(now - currentWeek);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    const MAX_STALE_DAYS = 180;
    const WARN_STALE_DAYS = 120;
    const REFRESH_THRESHOLD_DAYS = 60;

    if (diffDays > MAX_STALE_DAYS) {
      logger.warn(`[validateOffsets] Server returned stale week: ${offsets.current} (${Math.round(diffDays)} days old)`);

      if (allowStale) {
        logger.info(`[validateOffsets] Allowing stale data due to allowStale flag`);
        return true;
      }

      logger.error(`[validateOffsets] Data too stale (>${MAX_STALE_DAYS} days), refresh won't help - need re-login`);
      return false;
    }

    if (diffDays > WARN_STALE_DAYS) {
      logger.warn(`[validateOffsets] Week data is ${Math.round(diffDays)} days old - session likely expired, will force logout`);
      return "stale";
    }

    if (diffDays > REFRESH_THRESHOLD_DAYS) {
      logger.warn(`[validateOffsets] Week data is ${Math.round(diffDays)} days old (will attempt refresh)`);
      return "stale";
    }

    if (diffDays > 30) {
      logger.info(`[validateOffsets] Week data is ${Math.round(diffDays)} days old (still valid)`);
    }

    return true;
  } catch (err) {
    logger.warn(`[validateOffsets] Failed to validate: ${err?.message}`);
    return true;
  }
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

  let hasSessCookie = false;
  try {
    const { session } = await import("electron");
    const ses = session.fromPartition(getCookiePartition());
    const cookies = await ses.cookies.get({ domain: CONFIG.UNETI_DOMAIN });
    hasSessCookie = cookies && cookies.length > 0;
  } catch { }
  if (!hasSessCookie) throw new Error("No cookies");

  let target;

  if (baseDate) {
    const d = new Date(baseDate);
    if (Number.isFinite(d.getTime())) {
      target = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1
      ).padStart(2, "0")}/${d.getFullYear()}`;
      logger.debug(`[getSchedule] using baseDate as target: ${target}`);
      const fragment = await postWeek(
        null,
        `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
        `week:${target}`
      );
      logger.debug(`[getSchedule] fragment length: ${fragment.length}`);
      if (looksLoggedOut(fragment)) throw new Error("Cookie expired");
      lastOffsets = extractOffsets(fragment);
      const validation = validateOffsets(lastOffsets);

      if (validation === "stale" || validation === false) {
        logger.warn("[getSchedule] baseDate: Detected stale data, attempting session refresh");
        const refreshed = await refreshSession();

        if (refreshed) {
          logger.info("[getSchedule] baseDate: Session refreshed, retrying");
          await new Promise(resolve => setTimeout(resolve, 1000));

          const retryFragment = await postWeek(
            null,
            `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
            `week:${target}-retry`
          );

          if (looksLoggedOut(retryFragment)) throw new Error("Cookie expired");
          lastOffsets = extractOffsets(retryFragment);

          if (!validateOffsets(lastOffsets, true)) {
            logger.error("[getSchedule] baseDate: Still stale after refresh");
            throw new Error("Cookie expired or stale session");
          }

          if (!lastOffsets.current) lastOffsets.current = target;
          logger.debug("[getSchedule] baseDate: offsets after retry:", lastOffsets);
          return await processFragment(retryFragment, target, lastOffsets);
        } else if (validation === false) {
          throw new Error("Cookie expired or stale session");
        }
      }

      if (!lastOffsets.current) lastOffsets.current = target;
      logger.debug("[getSchedule] offsets:", lastOffsets);
      return await processFragment(fragment, target, lastOffsets);
    } else {
      logger.warn("[getSchedule] baseDate invalid, fallback to offset logic");
    }
  }

  if (offset === 0) {
    const fragment = await postWeek(
      null,
      "pNgayHienTai=&pLoaiLich=0",
      "week:current"
    );
    logger.debug(`[getSchedule] fragment length: ${fragment.length}`);
    if (looksLoggedOut(fragment)) throw new Error("Cookie expired");

    lastOffsets = extractOffsets(fragment);
    const validation = validateOffsets(lastOffsets);

    if (validation === "stale" || validation === false) {
      logger.warn("[getSchedule] Detected stale data, attempting session refresh");
      const refreshed = await refreshSession();

      if (refreshed) {
        logger.info("[getSchedule] Session refreshed, retrying fetch");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const retryFragment = await postWeek(
          null,
          "pNgayHienTai=&pLoaiLich=0",
          "week:current-retry"
        );

        if (looksLoggedOut(retryFragment)) throw new Error("Cookie expired");

        lastOffsets = extractOffsets(retryFragment);
        const retryValidation = validateOffsets(lastOffsets, true);

        const isStillStale = retryValidation === "stale" || retryValidation === false;

        if (isStillStale) {
          logger.warn("[getSchedule] Data still stale after refresh - server session locked to old data");
        }

        target = lastOffsets.current;
        if (!target) {
          logger.warn(`[getSchedule] target invalid after retry: ${target}`);
          return null;
        }

        const result = await processFragment(retryFragment, target, lastOffsets);

        if (isStillStale && result) {
          result.staleWarning = true;
          result.staleMessage = "staleDataWarning";
          logger.warn("[getSchedule] Returning stale data with warning");
        }

        return result;
      } else {
        logger.warn("[getSchedule] Session refresh failed");
        if (validation === false) {
          throw new Error("Cookie expired or stale session");
        }
      }
    }

    logger.debug("getSchedule] offsets:", lastOffsets);

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
    null,
    `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
    `week:${target}`
  );
  logger.debug(`[getSchedule] fetched new fragment length: ${fragment.length}`);
  if (looksLoggedOut(fragment)) throw new Error("Cookie expired");

  lastOffsets = extractOffsets(fragment);
  const validation = validateOffsets(lastOffsets);

  if (validation === "stale" || validation === false) {
    logger.warn("[getSchedule] offset: Detected stale data, attempting session refresh");
    const refreshed = await refreshSession();

    if (refreshed) {
      logger.info("[getSchedule] offset: Session refreshed, retrying");
      await new Promise(resolve => setTimeout(resolve, 1000));

      const retryFragment = await postWeek(
        null,
        `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
        `week:${target}-retry`
      );

      if (looksLoggedOut(retryFragment)) throw new Error("Cookie expired");
      lastOffsets = extractOffsets(retryFragment);

      if (!validateOffsets(lastOffsets, true)) {
        logger.error("[getSchedule] offset: Still stale after refresh");
        throw new Error("Cookie expired or stale session");
      }

      if (!lastOffsets.current) lastOffsets.current = target;
      logger.debug("[getSchedule] offset: offsets after retry:", lastOffsets);
      return await processFragment(retryFragment, target, lastOffsets);
    } else if (validation === false) {
      throw new Error("Cookie expired or stale session");
    }
  }

  if (!lastOffsets.current) lastOffsets.current = target;

  logger.debug("[getSchedule] new offsets:", lastOffsets);

  return await processFragment(fragment, target, lastOffsets);
}
