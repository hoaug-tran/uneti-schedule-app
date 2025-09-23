import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { app } from "electron";

const storeDir = path.join(app.getPath("userData"), "store");
const COOKIE_TXT = path.join(storeDir, "cookies.txt");
const OUT_JSON = path.join(storeDir, "schedule.json");
const RAW_HTML = path.join(storeDir, "fragment.html");

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
              const m = tiet.match(/(\d+)\s*-\s*(\d+)/);
              return m ? [Number(m[1]), Number(m[2])] : undefined;
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

async function getSchedule(weekDateArg) {
  const cookies = await fs.readFile(COOKIE_TXT, "utf8").catch(() => "");
  if (!cookies) throw new Error("Chưa có cookies. Chạy: pnpm login");

  const weekDate = weekDateArg || ddmmyyyy(startOfWeek(new Date()));
  const res = await fetch(
    "https://sinhvien.uneti.edu.vn/SinhVien/GetDanhSachLichTheoTuan",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      body: JSON.stringify({ param: { firstDate: weekDate } }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `HTTP ${res.status} – có thể cookie hết hạn.\n${text.slice(0, 500)}`
    );
  }

  const html = await res.text();
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(RAW_HTML, html, "utf8");

  const data = parseScheduleFromFragment(html);
  await fs.writeFile(
    OUT_JSON,
    JSON.stringify({ updatedAt: Date.now(), data }, null, 2),
    "utf8"
  );

  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argDate = process.argv[2];
  getSchedule(argDate).catch((err) => {
    console.error("Fetch failed:", err.message);
    process.exit(1);
  });
}

export { getSchedule };
