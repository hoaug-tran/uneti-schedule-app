// import fs from "fs/promises";
// import path from "path";
// import * as cheerio from "cheerio";
// import { getStoreDir } from "./storePath.js";
// import { startOfWeek, weekKey } from "../utils/date.js";

// function ddmmyyyy(d) {
//   const dd = String(d.getDate()).padStart(2, "0");
//   const mm = String(d.getMonth() + 1).padStart(2, "0");
//   const yyyy = d.getFullYear();
//   return `${dd}/${mm}/${yyyy}`;
// }

// function looksLikeLogin(html) {
//   const text = html.toLowerCase();
//   return (
//     text.includes("đăng nhập") ||
//     text.includes("sinh-vien-dang-nhap") ||
//     text.includes("tên đăng nhập") ||
//     text.includes("mật khẩu")
//   );
// }

// function parseScheduleFromFragment(html) {
//   const $ = cheerio.load(html);
//   const days = [];
//   $("thead th").each((i, th) => {
//     if (i === 0) return;
//     const t = $(th).text().trim();
//     const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})$/);
//     if (m) {
//       const [_, dd, mm, yyyy] = m;
//       days.push(`${yyyy}-${mm}-${dd}`);
//     }
//   });

//   const sessions = ["Sáng", "Chiều", "Tối"];
//   const result = [];

//   $("tbody tr").each((r, tr) => {
//     const session = sessions[r];
//     $(tr)
//       .find("td")
//       .each((c, td) => {
//         if (c === 0) return;
//         const day = days[c - 1];
//         $(td)
//           .find(".content")
//           .each((_, el) => {
//             const $el = $(el);
//             const subject = $el.find("b a").first().text().trim();

//             const getText = (label) =>
//               $el
//                 .find(`p:contains('${label}')`)
//                 .text()
//                 .replace(new RegExp(`.*${label}\\s*:\\s*`, "i"), "")
//                 .trim();

//             const tiet = getText("Tiết");
//             const periods = (() => {
//               if (!tiet) return undefined;
//               const m = tiet.match(/(\d+)\s*-\s*(\d+)/);
//               if (m) return [Number(m[1]), Number(m[2])];
//               const single = tiet.match(/(\d+)/);
//               return single ? [Number(single[1])] : undefined;
//             })();

//             const room = getText("Phòng");
//             const teacher = getText("GV");

//             const style = ($el.attr("style") || "").toLowerCase();
//             let type = "Lý thuyết";
//             if (style.includes("#71cb35")) type = "Thực hành";
//             else if (style.includes("#92d6ff") || style.includes("#1da1f2"))
//               type = "Online";
//             else if (style.includes("lichthi")) type = "Thi";

//             result.push({
//               day,
//               session,
//               subject,
//               periods,
//               room: room || undefined,
//               teacher: teacher || undefined,
//               type,
//             });
//           });
//       });
//   });

//   return result;
// }

// function parseWeekOffsets(html) {
//   const $ = cheerio.load(html);
//   return {
//     prev: $("#firstDatePrevOffWeek").val(),
//     current: $("#firstDateOffWeek").val(),
//     next: $("#firstDateNextOffWeek").val(),
//   };
// }

// export async function getSchedule(weekDateArg) {
//   const cookies = await fs
//     .readFile(path.join(getStoreDir(), "cookies.txt"), "utf8")
//     .catch(() => "");
//   if (!cookies) throw new Error("Cookies not found, run login");

//   let weekDate, key, weekStart;

//   if (
//     typeof weekDateArg === "string" &&
//     /^\d{2}\/\d{2}\/\d{4}$/.test(weekDateArg)
//   ) {
//     weekDate = weekDateArg;
//     const [dd, mm, yyyy] = weekDate.split("/");
//     const d = new Date(+yyyy, +mm - 1, +dd);
//     weekStart = startOfWeek(d);
//     key = weekKey(weekStart);
//   } else {
//     const baseDate = weekDateArg ? new Date(weekDateArg) : new Date();
//     if (isNaN(baseDate)) throw new Error("Invalid date input for getSchedule");

//     weekStart = startOfWeek(baseDate);
//     key = weekKey(weekStart);
//     weekDate = ddmmyyyy(weekStart);
//   }

//   const OUT_JSON = path.join(getStoreDir(), `schedule-${key}.json`);
//   const RAW_HTML = path.join(getStoreDir(), `fragment-${key}.html`);

//   let res;
//   try {
//     res = await fetch(
//       "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Cookie: cookies.replace(/\r?\n/g, ""),
//         },
//         body: JSON.stringify({ param: { firstDate: weekDate } }),
//       }
//     );
//   } catch {
//     throw new Error("NETWORK_FAIL");
//   }

//   if (!res.ok) {
//     if (res.status === 401) throw new Error("AUTH");
//     throw new Error(`HTTP ${res.status}`);
//   }

//   const html = await res.text();
//   await fs.mkdir(getStoreDir(), { recursive: true });
//   await fs.writeFile(RAW_HTML, html, "utf8");

//   if (looksLikeLogin(html)) throw new Error("AUTH");

//   const rawData = parseScheduleFromFragment(html);
//   const offsets = parseWeekOffsets(html);

//   const normalized = rawData.map((item) => {
//     const d = new Date(item.day);
//     const yyyy = d.getFullYear();
//     const mm = String(d.getMonth() + 1).padStart(2, "0");
//     const dd = String(d.getDate()).padStart(2, "0");
//     return { ...item, day: `${yyyy}-${mm}-${dd}` };
//   });

//   const weekStartDate = new Date(weekStart);
//   const weekEndDate = new Date(weekStart);
//   weekEndDate.setDate(weekStartDate.getDate() + 6);

//   const filtered = normalized.filter((item) => {
//     const d = new Date(item.day);
//     return d >= weekStartDate && d <= weekEndDate;
//   });

//   const result = {
//     updatedAt: Date.now(),
//     weekStart: key,
//     data: filtered,
//     offsets,
//   };

//   await fs.writeFile(OUT_JSON, JSON.stringify(result, null, 2), "utf8");
//   return result;
// }
import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { getStoreDir } from "./storePath.js";
import { startOfWeek, weekKey } from "../utils/date.js";

// parse dữ liệu từ <table>
function parseScheduleFromPage(html) {
  const $ = cheerio.load(html);
  const days = [];
  $("thead th").each((i, th) => {
    if (i === 0) return;
    const t = $(th).text().trim();
    const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const [_, dd, mm, yyyy] = m;
      days.push(`${yyyy}-${mm}-${dd}`);
    }
  });

  const sessions = ["Sáng", "Chiều", "Tối"];
  const result = [];

  $("tbody tr").each((r, tr) => {
    const session = sessions[r];
    $(tr)
      .find("td")
      .each((c, td) => {
        if (c === 0) return;
        const day = days[c - 1];
        $(td)
          .find(".content")
          .each((_, el) => {
            const $el = $(el);
            const subject = $el.find("b a").first().text().trim();

            const getText = (label) =>
              $el
                .find(`p:contains('${label}')`)
                .text()
                .replace(new RegExp(`.*${label}\\s*:\\s*`, "i"), "")
                .trim();

            const tiet = getText("Tiết");
            let periods;
            if (tiet) {
              const m = tiet.match(/(\d+)\s*-\s*(\d+)/);
              if (m) periods = [Number(m[1]), Number(m[2])];
              else {
                const single = tiet.match(/(\d+)/);
                if (single) periods = [Number(single[1])];
              }
            }

            const room = getText("Phòng");
            const teacher = getText("GV");

            const style = ($el.attr("style") || "").toLowerCase();
            let type = "Lý thuyết";
            if (style.includes("#71cb35")) type = "Thực hành";
            else if (style.includes("#92d6ff") || style.includes("#1da1f2"))
              type = "Online";
            else if (style.includes("lichthi")) type = "Thi";

            result.push({
              day,
              session,
              subject,
              periods,
              room: room || undefined,
              teacher: teacher || undefined,
              type,
            });
          });
      });
  });

  return result;
}

function parseOffsets(html) {
  const $ = cheerio.load(html);
  return {
    prev: $("#firstDatePrevOffWeek").val(),
    current: $("#firstDateOffWeek").val(),
    next: $("#firstDateNextOffWeek").val(),
  };
}

export async function getScheduleB() {
  const cookies = await fs
    .readFile(path.join(getStoreDir(), "cookies.txt"), "utf8")
    .catch(() => "");
  if (!cookies) throw new Error("Cookies not found, run login");

  console.log("=== getScheduleB() ===");

  let res;
  try {
    res = await fetch("https://sinhvien.uneti.edu.vn/lich-theo-tuan.html", {
      headers: {
        Cookie: cookies.replace(/\r?\n/g, ""),
      },
    });
  } catch {
    throw new Error("NETWORK_FAIL");
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  console.log("HTML length:", html.length);

  const data = parseScheduleFromPage(html);
  const offsets = parseOffsets(html);

  const key = weekKey(startOfWeek(new Date()));
  const OUT_JSON = path.join(getStoreDir(), `schedule-${key}.json`);
  const RAW_HTML = path.join(getStoreDir(), `page-${key}.html`);

  await fs.mkdir(getStoreDir(), { recursive: true });
  await fs.writeFile(RAW_HTML, html, "utf8");

  const result = {
    updatedAt: Date.now(),
    weekStart: key,
    data,
    offsets,
  };
  await fs.writeFile(OUT_JSON, JSON.stringify(result, null, 2), "utf8");

  console.log("Parsed subjects:", data.length);
  console.log("Offsets:", offsets);
  console.log("Saved JSON:", OUT_JSON);
  console.log("=====================");
  return result;
}
