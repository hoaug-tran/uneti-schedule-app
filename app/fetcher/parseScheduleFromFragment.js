import * as cheerio from "cheerio";
import { parseYMDLocal } from "../utils/date.js";

export function parseScheduleFromFragment(html) {
  const $ = cheerio.load(html);

  // Lấy header: map cột -> ngày
  const days = [];
  $("thead th").each((i, el) => {
    if (i === 0) return; // bỏ cột "Ca học"
    const text = $(el).text().trim();
    const m = text.match(/(\d{2}\/\d{2}\/\d{4})$/);
    if (m) {
      const [dd, mm, yyyy] = m[1].split("/");
      days.push(`${yyyy}-${mm}-${dd}`);
    } else {
      days.push(null);
    }
  });

  const data = [];

  $("tbody tr").each((_, row) => {
    const session = $(row).find("td").first().text().trim(); // Sáng/Chiều/Tối
    $(row)
      .find("td")
      .slice(1) // bỏ cột đầu tiên
      .each((colIdx, cell) => {
        const day = days[colIdx];
        if (!day) return;

        $(cell)
          .find("div.content")
          .each((_, div) => {
            const subject = $(div).find("b a").text().trim();
            const periodsTxt = $(div)
              .text()
              .match(/Tiết:\s*([\d\s-]+)/i);
            let periods = [];
            if (periodsTxt) {
              const range = periodsTxt[1].split("-").map((x) => +x.trim());
              if (range.length === 2) {
                for (let i = range[0]; i <= range[1]; i++) periods.push(i);
              } else if (range.length === 1) {
                periods.push(range[0]);
              }
            }
            const room = $(div)
              .find("span[lang='giang-duong']")
              .parent()
              .text()
              .replace("Phòng:", "")
              .replace("Phòng học/", "")
              .trim();

            const teacher = $(div)
              .find("span[lang='lichtheotuan-gv']")
              .parent()
              .text()
              .replace("GV:", "")
              .trim();

            // Xác định loại (LT/TH/Online/Thi) dựa vào màu hoặc class
            let type = "LT";
            const style = $(div).attr("style") || "";
            if (style.includes("#71cb35")) type = "TH";
            if (style.includes("#92d6ff")) type = "Online";
            if (style.includes("LichThi")) type = "Thi";

            data.push({
              day,
              session,
              subject,
              periods,
              room,
              teacher,
              type,
            });
          });
      });
  });

  return data;
}
