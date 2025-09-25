import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { getPaths } from "./storePath.js";

const { COOKIE_TXT, OUT_JSON, RAW_HTML } = getPaths();

function ddmmyyyy(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function looksLikeLogin(html) {
  const text = html.toLowerCase();
  return (
    text.includes("đăng nhập") ||
    text.includes("sinh-vien-dang-nhap") ||
    text.includes("tên đăng nhập") ||
    text.includes("mật khẩu")
  );
}

function parseScheduleFromFragment(html) {
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
            const classCode = $el.find("p").eq(0).text().trim();

            const getText = (label) =>
              $el
                .find(`p:contains('${label}')`)
                .text()
                .replace(new RegExp(`.*${label}\\s*:\\s*`, "i"), "")
                .trim();

            const tiet = getText("Tiết");
            const periods = (() => {
              if (!tiet) return undefined;
              const m = tiet.match(/(\d+)\s*-\s*(\d+)/);
              if (m) return [Number(m[1]), Number(m[2])];
              const single = tiet.match(/(\d+)/);
              return single ? [Number(single[1])] : undefined;
            })();

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
              classCode,
              periods,
              room: room || undefined,
              teacher: teacher || undefined,
              type,
              rawBg: $el.attr("data-bg") || undefined,
            });
          });
      });
  });

  return result;
}

export async function getSchedule(weekDateArg) {
  const cookies = await fs.readFile(COOKIE_TXT, "utf8").catch(() => "");
  if (!cookies) throw new Error("Cookies not found, run login");

  const weekDate = weekDateArg || ddmmyyyy(startOfWeek(new Date()));
  let res;
  try {
    res = await fetch(
      "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ param: { firstDate: weekDate } }),
      }
    );
  } catch (e) {
    throw new Error("NETWORK_FAIL");
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error("AUTH");
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(RAW_HTML, html, "utf8");

  if (looksLikeLogin(html)) {
    throw new Error("AUTH");
  }

  const data = parseScheduleFromFragment(html);
  console.log("[getSchedule] parsed records:", data.length);

  await fs.writeFile(
    OUT_JSON,
    JSON.stringify({ updatedAt: Date.now(), data }, null, 2),
    "utf8"
  );

  console.log("[getSchedule] OUT_JSON =", OUT_JSON);
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argDate = process.argv[2];
  getSchedule(argDate).catch((err) => {
    console.error("Fetch failed:", err.message);
    process.exit(1);
  });
}
