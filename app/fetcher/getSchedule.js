import fs from "fs/promises";
import path from "path";
import { getStoreDir } from "./storePath.js";
import { weekKey } from "../utils/date.js";
import * as cheerio from "cheerio";
import { parseScheduleFromFragment } from "./parseScheduleFromFragment.js";
import { session } from "electron";

let lastOffsets = null;

function withTimeout(promise, ms = 15000, label = "request") {
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

async function buildCookieHeader() {
  try {
    const header = await fs.readFile(
      path.join(getStoreDir(), "cookies.txt"),
      "utf8"
    );
    const h = header.replace(/\r?\n/g, "").trim();
    if (h) return h;
  } catch {}
  try {
    const sess = session.fromPartition("persist:uneti-session");
    const list = await sess.cookies.get({ domain: "sinhvien.uneti.edu.vn" });
    if (list && list.length) {
      return list.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch {}
  return "";
}
async function postWeek(cookieHeader, body, label) {
  const res = await withTimeout(
    fetch("https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookieHeader,
      },
      body,
    }),
    15000,
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

function mapSameSite(v) {
  if (!v) return "unspecified";
  const s = String(v).toLowerCase();
  if (s.includes("lax")) return "lax";
  if (s.includes("strict")) return "strict";
  if (s.includes("none") || s.includes("no_restriction"))
    return "no_restriction";
  return "unspecified";
}

async function ensureSessionHasCookiesFromFile() {
  const ses = session.fromPartition("persist:uneti-session");
  const existing = await ses.cookies.get({ domain: "sinhvien.uneti.edu.vn" });
  if (existing && existing.length > 0) return ses;
  try {
    const storeDir = getStoreDir();
    const jsonPath = path.join(storeDir, "cookies.json");
    const txtPath = path.join(storeDir, "cookies.txt");
    const hasJson = await fs
      .stat(jsonPath)
      .then(() => true)
      .catch(() => false);
    if (hasJson) {
      const arr = JSON.parse(await fs.readFile(jsonPath, "utf8"));
      for (const c of arr) {
        try {
          await ses.cookies.set({
            name: c.name,
            value: c.value,
            domain: c.domain || "sinhvien.uneti.edu.vn",
            path: c.path || "/",
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            expirationDate: c.expirationDate,
            sameSite: mapSameSite(c.sameSite),
            url: "https://sinhvien.uneti.edu.vn",
          });
        } catch {}
      }
      try {
        await ses.flushStorageData();
      } catch {}
      return ses;
    }
    const hasTxt = await fs
      .stat(txtPath)
      .then(() => true)
      .catch(() => false);
    if (hasTxt) {
      const header = (await fs.readFile(txtPath, "utf8")).replace(/\r?\n/g, "");
      for (const kv of header.split(";")) {
        const [name, ...rest] = kv.trim().split("=");
        const value = (rest.join("=") || "").trim();
        if (!name || !value) continue;
        try {
          await ses.cookies.set({
            url: "https://sinhvien.uneti.edu.vn",
            name,
            value,
          });
        } catch {}
      }
      try {
        await ses.flushStorageData();
      } catch {}
      return ses;
    }
  } catch {}
  return ses;
}

function looksLoggedOut(html) {
  try {
    const $ = cheerio.load(html);
    const hasOffsets =
      $("#firstDateOffWeek").length > 0 ||
      $("#firstDateNextOffWeek").length > 0 ||
      $("#firstDatePrevOffWeek").length > 0;
    if (hasOffsets) return false;
    const hasLoginHint =
      $('form[action*="dang-nhap"], form[action*="DangNhap"]').length > 0 ||
      $('input[type="password"]').length > 0 ||
      html.toLowerCase().includes("đăng nhập");
    return hasLoginHint;
  } catch {
    return false;
  }
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
  // fallback: lấy từ chuỗi "dd/mm/yyyy - dd/mm/yyyy"
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
  // fallback cuối: bắt đại ngày đầu tiên xuất hiện (ổn trong thực tế UNETI)
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
    const storeDir = getStoreDir();
    await fs.mkdir(storeDir, { recursive: true });
    const files = await fs.readdir(storeDir);
    await Promise.all(
      files
        .filter((f) => f.startsWith("schedule-") && f.endsWith(".json"))
        .map((f) => fs.rm(path.join(storeDir, f), { force: true }))
    );
    console.log("[clearAllSchedules] removed all schedule-*.json");
  } catch (err) {
    console.warn("[clearAllSchedules] fail:", err);
  }
}

async function loadOffsetsFromFile(baseDate = new Date()) {
  try {
    const storeDir = getStoreDir();
    const key = weekKey(baseDate);
    const filePath = path.join(storeDir, `schedule-${key}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    return json.offsets || null;
  } catch {
    return null;
  }
}

async function processFragment(fragment, target, offsets) {
  const data = parseScheduleFromFragment(fragment) || [];
  console.log("[processFragment] parsed data length:", data.length);

  const storeDir = getStoreDir();
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(path.join(storeDir, "fragment.html"), fragment, "utf8");

  const [dd, mm, yyyy] = target.split("/");
  const weekStart = new Date(+yyyy, +mm - 1, +dd);
  const key = weekKey(weekStart);
  const filePath = path.join(storeDir, `schedule-${key}.json`);

  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        updatedAt: Date.now(),
        weekStart: weekStart.toISOString(),
        data,
        offsets,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("[processFragment] wrote file:", filePath);

  return { offsets, weekStart, data };
}

export async function getSchedule(offset = 0, baseDate = null) {
  console.log("[getSchedule] start offset:", offset, "baseDate:", baseDate);

  const cookieHeader = await buildCookieHeader();
  if (!cookieHeader) throw new Error("No cookies");
  console.log("[getSchedule] cookie header length:", cookieHeader.length);

  let target;

  if (baseDate) {
    const d = new Date(baseDate);
    if (Number.isFinite(d.getTime())) {
      target = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1
      ).padStart(2, "0")}/${d.getFullYear()}`;
      console.log("[getSchedule] dùng baseDate làm target:", target);
      const fragment = await postWeek(
        cookieHeader,
        `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
        `week:${target}`
      );
      console.log("[getSchedule] fragment length:", fragment.length);
      if (looksLoggedOut(fragment)) throw new Error("Cookie hết hạn");
      lastOffsets = extractOffsets(fragment);
      if (!lastOffsets.current) lastOffsets.current = target;
      console.log("[getSchedule] offsets:", lastOffsets);
      return await processFragment(fragment, lastOffsets.current, lastOffsets);
    } else {
      console.warn(
        "[getSchedule] baseDate không hợp lệ, fallback offset logic"
      );
    }
  }

  if (offset === 0) {
    const fragment = await postWeek(
      cookieHeader,
      "pNgayHienTai=&pLoaiLich=0",
      "week:current"
    );
    console.log("[getSchedule] fragment length:", fragment.length);
    if (looksLoggedOut(fragment)) throw new Error("Cookie hết hạn");

    lastOffsets = extractOffsets(fragment);
    console.log("[getSchedule] offsets:", lastOffsets);

    console.log("[getSchedule] offsets:", lastOffsets);

    target = lastOffsets.current;
    if (!target) {
      console.warn("[getSchedule] target không hợp lệ:", target);
      return null;
    }

    return await processFragment(fragment, target, lastOffsets);
  }

  if (!baseDate) {
    if (!lastOffsets) {
      lastOffsets = await loadOffsetsFromFile(new Date());
      if (!lastOffsets) {
        console.warn(
          "[getSchedule] chưa có lastOffsets, fallback tuần hiện tại"
        );
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
    console.log("[getSchedule] tính target từ baseDate:", target);
  }

  if (!target) {
    console.warn("[getSchedule] no target week");
    return null;
  }

  const fragment = await postWeek(
    cookieHeader,
    `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
    `week:${target}`
  );
  console.log("[getSchedule] fetched new fragment length:", fragment.length);
  if (looksLoggedOut(fragment)) throw new Error("Cookie hết hạn");

  const $frag = cheerio.load(fragment);
  lastOffsets = {
    prev: $frag("#firstDatePrevOffWeek").val(),
    current: $frag("#firstDateOffWeek").val(),
    next: $frag("#firstDateNextOffWeek").val(),
  };

  lastOffsets = extractOffsets(fragment);
  if (!lastOffsets.current) lastOffsets.current = target;

  console.log("[getSchedule] new offsets:", lastOffsets);

  return await processFragment(fragment, target, lastOffsets);
}
