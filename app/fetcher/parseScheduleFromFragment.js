import * as cheerio from "cheerio";

export function parseScheduleFromFragment(html) {
  const $ = cheerio.load(html);

  const days = [];
  $("thead th").each((i, el) => {
    if (i === 0) return;
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
    const session = $(row).find("td").first().text().trim();
    $(row)
      .find("td")
      .slice(1)
      .each((colIdx, cell) => {
        const day = days[colIdx];
        if (!day) return;

        $(cell)
          .find("div.content")
          .each((_, div) => {
            const subject = $(div).find("b a").text().trim();

            const classInfo = $(div).find("p").first().text().trim();

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

            let room = "";
            const roomFont = $(div)
              .find("span[lang='giang-duong']")
              .next("font");
            if (roomFont.length) {
              room = roomFont.text().trim();
              if (room.startsWith("Phòng học/")) {
                room = room.replace(/^Phòng học\//, "").trim();
              }
            }

            let teacher = "";
            const teacherFont = $(div)
              .find("span[lang='lichtheotuan-gv']")
              .next("font");
            if (teacherFont.length) {
              teacher = teacherFont.text().trim();
            }

            let type = "LT";
            const divClass = $(div).attr("class") || "";
            const style = $(div).attr("style") || "";
            const dataBg = $(div).attr("data-bg") || "";
            const $cell = $(cell);
            const cellClass = $cell.attr("class") || "";
            const cellStyle = $cell.attr("style") || "";

            const hasExamClassInParents = $cell.hasClass("color-lichthi-chinhthuc") ||
              $cell.parent().hasClass("color-lichthi-chinhthuc");

            const isRegularClass = divClass.includes("color-lichhoc");

            const isExamSchedule = !isRegularClass && (
              (dataBg && dataBg.length > 0) ||
              hasExamClassInParents ||
              /color-lichthi/i.test(cellClass) ||
              /lichthi/i.test(cellClass) ||
              /lichthi/i.test(divClass) ||
              /color-lichthi/i.test(divClass) ||
              cellStyle.includes("#e8ffe1") ||
              style.includes("#e8ffe1")
            );

            if (isExamSchedule) {
              type = "Thi";
            } else if (style.includes("#71cb35") || cellStyle.includes("#71cb35")) {
              type = "TH";
            } else if (style.includes("#92d6ff") || cellStyle.includes("#92d6ff")) {
              type = "Online";
            } else {
              type = "LT";
            }



            if (isExamSchedule) {
              type = "Thi";
            } else if (style.includes("#71cb35") || cellStyle.includes("#71cb35")) {
              type = "TH";
            } else if (style.includes("#92d6ff") || cellStyle.includes("#92d6ff")) {
              type = "Online";
            } else {
              type = "LT";
            }

            data.push({
              day,
              session,
              subject,
              classInfo,
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
