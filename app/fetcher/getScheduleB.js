// import fs from "fs/promises";
// import path from "path";
// import { getStoreDir } from "./storePath.js";
// import { startOfWeek, weekKey } from "../utils/date.js";
// import * as cheerio from "cheerio";
// import { parseScheduleFromFragment } from "./parseScheduleFromFragment.js";

// export async function getScheduleB(offset = 0) {
//   console.log("[getScheduleB] start offset:", offset);

//   const cookiesPath = path.join(getStoreDir(), "cookies.txt");
//   const cookies = await fs.readFile(cookiesPath, "utf8").catch(() => "");
//   if (!cookies) throw new Error("No cookies");
//   console.log("[getScheduleB] cookies ok, length:", cookies.length);

//   const res2 = await fetch(
//     "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
//         Cookie: cookies.replace(/\r?\n/g, ""),
//         "X-Requested-With": "XMLHttpRequest",
//       },
//       body: `param.firstDate=`,
//     }
//   );

//   const html = await res2.text();
//   console.log("[getScheduleB] fragment length:", html.length);

//   const $frag = cheerio.load(html);
//   const offsets = {
//     prev: $frag("#firstDatePrevOffWeek").val(),
//     current: $frag("#firstDateOffWeek").val(),
//     next: $frag("#firstDateNextOffWeek").val(),
//   };
//   console.log("[getScheduleB] offsets:", offsets);

//   let target = offsets.current;
//   if (offset === -1) target = offsets.prev;
//   if (offset === 1) target = offsets.next;

//   if (!target) {
//     console.warn("[getScheduleB] no target week → fallback về tuần hiện tại");
//     const monday = startOfWeek(new Date());
//     target = `${String(monday.getDate()).padStart(2, "0")}/${String(
//       monday.getMonth() + 1
//     ).padStart(2, "0")}/${monday.getFullYear()}`;
//   }
//   console.log("[getScheduleB] target:", target);

//   let fragment = html;
//   if (offset !== 0 && target) {
//     const res3 = await fetch(
//       "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
//           Cookie: cookies.replace(/\r?\n/g, ""),
//           "X-Requested-With": "XMLHttpRequest",
//         },
//         body: `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
//       }
//     );
//     fragment = await res3.text();
//     console.log("[getScheduleB] fetched new fragment length:", fragment.length);
//   }

//   const storeDir = getStoreDir();
//   await fs.mkdir(storeDir, { recursive: true });

//   await fs.writeFile(path.join(storeDir, "fragment.html"), fragment, "utf8");

//   const data = parseScheduleFromFragment(fragment) || [];
//   console.log("[getScheduleB] parsed data length:", data.length);

//   const [dd, mm, yyyy] = target.split("/");
//   const weekStart = new Date(+yyyy, +mm - 1, +dd);
//   const key = weekKey(weekStart);
//   const filePath = path.join(storeDir, `schedule-${key}.json`);

//   try {
//     await fs.writeFile(
//       filePath,
//       JSON.stringify({ updatedAt: Date.now(), weekStart, data }, null, 2),
//       "utf8"
//     );
//     console.log("[getScheduleB] wrote file:", filePath);
//   } catch (err) {
//     console.error("[getScheduleB] writeFile fail:", err);
//   }

//   return { offsets, weekStart, data };
// }

import fs from "fs/promises";
import path from "path";
import { getStoreDir } from "./storePath.js";
import { startOfWeek, weekKey } from "../utils/date.js";
import * as cheerio from "cheerio";
import { parseScheduleFromFragment } from "./parseScheduleFromFragment.js";

// giữ biến toàn cục lưu offsets hiện tại
let lastOffsets = null;

export async function getScheduleB(offset = 0, baseDate = null) {
  console.log("[getScheduleB] start offset:", offset, "baseDate:", baseDate);

  const cookiesPath = path.join(getStoreDir(), "cookies.txt");
  const cookies = await fs.readFile(cookiesPath, "utf8").catch(() => "");
  if (!cookies) throw new Error("No cookies");
  const cookieHeader = cookies.replace(/\r?\n/g, "");
  console.log("[getScheduleB] cookies ok, length:", cookieHeader.length);

  let target;

  // --- offset = 0 -> fetch tuần hiện tại ---
  if (offset === 0) {
    const res0 = await fetch(
      "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Cookie: cookieHeader,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: "pNgayHienTai=&pLoaiLich=0",
      }
    );
    const fragment = await res0.text();
    console.log("[getScheduleB] fragment length:", fragment.length);

    const $frag = cheerio.load(fragment);
    lastOffsets = {
      prev: $frag("#firstDatePrevOffWeek").val(),
      current: $frag("#firstDateOffWeek").val(),
      next: $frag("#firstDateNextOffWeek").val(),
    };
    console.log("[getScheduleB] offsets:", lastOffsets);

    target = lastOffsets.current;
    return await processFragment(fragment, target, lastOffsets);
  }

  // --- offset != 0 -> dùng lastOffsets hoặc baseDate ---
  if (!lastOffsets && !baseDate) {
    console.warn("[getScheduleB] chưa có lastOffsets, fallback tuần hiện tại");
    return await getScheduleB(0);
  }

  if (offset === -1) target = lastOffsets?.prev;
  if (offset === 1) target = lastOffsets?.next;

  if (!target && baseDate) {
    // nếu không có offset trong DOM, tự tính thêm tuần
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset * 7);
    target = `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()}`;
    console.log("[getScheduleB] tự tính target:", target);
  }

  if (!target) {
    console.warn("[getScheduleB] no target week");
    return null;
  }

  // gọi API với target
  const resN = await fetch(
    "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: `pNgayHienTai=${encodeURIComponent(target)}&pLoaiLich=0`,
    }
  );
  const fragment = await resN.text();
  console.log("[getScheduleB] fetched new fragment length:", fragment.length);

  const $frag = cheerio.load(fragment);
  lastOffsets = {
    prev: $frag("#firstDatePrevOffWeek").val(),
    current: $frag("#firstDateOffWeek").val(),
    next: $frag("#firstDateNextOffWeek").val(),
  };
  console.log("[getScheduleB] new offsets:", lastOffsets);

  return await processFragment(fragment, target, lastOffsets);
}

async function processFragment(fragment, target, offsets) {
  // --- Parse dữ liệu ---
  const data = parseScheduleFromFragment(fragment) || [];
  console.log("[processFragment] parsed data length:", data.length);

  // --- Save ---
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
