import fs from "fs/promises";
import path from "path";
import { getStoreDir } from "./storePath.js";
import { startOfWeek, weekKey } from "../utils/date.js";
import * as cheerio from "cheerio";
import { parseScheduleFromFragment } from "./parseScheduleFromFragment.js";

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

async function postWeek(cookieHeader, body, label) {
  const res = await withTimeout(
    fetch("https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
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

export async function getSchedule(offset = 0, baseDate = null) {
  console.log("[getSchedule] start offset:", offset, "baseDate:", baseDate);

  const cookiesPath = path.join(getStoreDir(), "cookies.txt");
  const cookies = await fs.readFile(cookiesPath, "utf8").catch(() => "");
  if (!cookies) throw new Error("No cookies");
  const cookieHeader = cookies.replace(/\r?\n/g, "");
  console.log("[getSchedule] cookies ok, length:", cookieHeader.length);

  let target;

  if (offset === 0) {
    const fragment = await postWeek(
      cookieHeader,
      "pNgayHienTai=&pLoaiLich=0",
      "week:current"
    );
    console.log("[getSchedule] fragment length:", fragment.length);

    const $frag = cheerio.load(fragment);
    lastOffsets = {
      prev: $frag("#firstDatePrevOffWeek").val(),
      current: $frag("#firstDateOffWeek").val(),
      next: $frag("#firstDateNextOffWeek").val(),
    };
    console.log("[getSchedule] offsets:", lastOffsets);

    target = lastOffsets.current;
    await clearWeekJson(target);
    return await processFragment(fragment, target, lastOffsets);
  }

  if (!lastOffsets && !baseDate) {
    console.warn("[getSchedule] chưa có lastOffsets, fallback tuần hiện tại");
    return await getSchedule(0);
  }

  if (offset === -1) target = lastOffsets?.prev;
  if (offset === 1) target = lastOffsets?.next;

  if (!target && baseDate) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset * 7);
    target = `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
    console.log("[getSchedule] tự tính target:", target);
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

  const $frag = cheerio.load(fragment);
  lastOffsets = {
    prev: $frag("#firstDatePrevOffWeek").val(),
    current: $frag("#firstDateOffWeek").val(),
    next: $frag("#firstDateNextOffWeek").val(),
  };
  console.log("[getSchedule] new offsets:", lastOffsets);

  await clearWeekJson(target);
  return await processFragment(fragment, target, lastOffsets);
}

async function clearWeekJson(target) {
  if (!target) return;
  try {
    const [dd, mm, yyyy] = target.split("/");
    const weekStart = new Date(+yyyy, +mm - 1, +dd);
    const key = weekKey(weekStart);
    const filePath = path.join(getStoreDir(), `schedule-${key}.json`);
    await fs.rm(filePath, { force: true });
    console.log("[clearWeekJson] removed old file:", filePath);
  } catch (err) {
    console.warn("[clearWeekJson] fail:", err);
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
      { updatedAt: Date.now(), weekStart: weekStart.toISOString(), data },
      null,
      2
    ),
    "utf8"
  );
  console.log("[processFragment] wrote file:", filePath);

  return { offsets, weekStart, data };
}
