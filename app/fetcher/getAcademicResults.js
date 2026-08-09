import * as cheerio from "cheerio";
import { requestViaWindow } from "./fetchViaWindow.js";
import { saveAcademicResults } from "./academicDb.js";
import { looksLoggedOutHtml, createAuthError } from "./sessionState.js";
import { logger } from "../utils/logger.js";

const URL = "https://sinhvien.uneti.edu.vn/ket-qua-hoc-tap.html";

function text($, el) { return $(el).text().replace(/\s+/g, " ").trim(); }
function num(v) {
  const n = Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function gradePoint(letter) {
  return ({ A: 4, B: 3, C: 2, D: 1, F: 0 })[String(letter || "").trim().toUpperCase()] ?? null;
}

function pick(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null && row?.[name] !== "") return row[name];
  }
  return null;
}

function normalizeSubject(row) {
  const letter = String(pick(row, ["diemChu", "letter", "Điểm chữ", "điểm chữ"]) || "").trim().toUpperCase();
  const point = num(pick(row, ["diemTinChi", "gradePoint", "Điểm hệ 4", "điểm hệ 4"]));
  const credit = num(pick(row, ["soTinChi", "tinChi", "soDvht", "donViHocTrinh", "Số tín chỉ", "số tín chỉ", "TC"]));
  const subjectName = pick(row, ["tenMonHoc", "subjectName", "Tên môn học", "tên môn học", "Môn học"]);
  if (!subjectName || !letter) return null;
  const gradePoint4 = point ?? gradePoint(letter);
  if (gradePoint4 === null) return null;
  return {
    subjectCode: pick(row, ["maMonHoc", "maLopHocPhan", "subjectCode", "Mã môn học", "mã môn học"]) || "",
    subjectName,
    credits: credit,
    letter,
    gradePoint: gradePoint4,
    finalScore: num(pick(row, ["diemTongKet", "finalScore", "Điểm tổng kết", "điểm tổng kết"])),
    raw: row,
  };
}

function extractJsonArrays(text) {
  const arrays = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[") continue;
    let depth = 0;
    let inStr = false;
    let quote = "";
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === quote) inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
      if (ch === "[") depth++;
      if (ch === "]") depth--;
      if (depth === 0) {
        const block = text.slice(i, j + 1);
        if (block.includes("diemChu") || block.includes("tenMonHoc")) arrays.push(block);
        i = j;
        break;
      }
    }
  }
  return arrays;
}

export function parseAcademicResults(html) {
  const $ = cheerio.load(html);
  const subjects = [];
  const semesterSummaries = {};
  const title = $("title").text().trim();
  const tableCount = $("table").length;
  const bangDiemRows = $("#xemDiem_aaa tbody tr").length;
  const hasDiemChu = html.includes("DiemChu");
  logger.debug(`[academic:parse] title="${title}", tables=${tableCount}, bangDiemRows=${bangDiemRows}, hasDiemChu=${hasDiemChu}, length=${html.length}`);

  let currentSemester = "";
  let lastSubject = null;

  $("#xemDiem_aaa tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const textStr = text($, $tr);

    const rowHead = text($, $tr.find("td.row-head").first());
    if (rowHead) {
      currentSemester = rowHead;
      lastSubject = null;
      return;
    }

    if (textStr.includes("Điểm trung bình") || textStr.includes("Tổng số tín chỉ")) {
      const semSummary = semesterSummaries[currentSemester] || {};

      const sem10Match = textStr.match(/Điểm trung bình học kỳ hệ 10:\s*([\d,.]+)/i);
      if (sem10Match) semSummary.semGpa10 = num(sem10Match[1]);

      const sem4Match = textStr.match(/Điểm trung bình học kỳ hệ 4:\s*([\d,.]+)/i);
      if (sem4Match) semSummary.semGpa4 = num(sem4Match[1]);

      const cum10Match = textStr.match(/Điểm trung bình tích lũy:\s*([\d,.]+)/i);
      if (cum10Match && !textStr.includes("tích lũy (hệ 4)")) {
        semSummary.cumGpa10 = num(cum10Match[1]);
      }
      const cum10AltMatch = textStr.match(/Điểm trung bình tích lũy:\s*([\d,.]+)\s*Điểm trung bình tích lũy \(hệ 4\)/i);
      if (cum10AltMatch) semSummary.cumGpa10 = num(cum10AltMatch[1]);

      const cum4Match = textStr.match(/Điểm trung bình tích lũy\s*\(hệ 4\):\s*([\d,.]+)/i);
      if (cum4Match) semSummary.cumGpa4 = num(cum4Match[1]);

      const regMatch = textStr.match(/Tổng số tín chỉ đã đăng ký:\s*(\d+)/i);
      if (regMatch) semSummary.registeredCredits = parseInt(regMatch[1], 10);

      const accMatch = textStr.match(/Tổng số tín chỉ tích lũy:\s*(\d+)/i);
      if (accMatch) semSummary.accumulatedCredits = parseInt(accMatch[1], 10);

      const debtMatch = textStr.match(/Tổng số tín chỉ nợ[^\d]*(\d+)/i);
      if (debtMatch) semSummary.debtCredits = parseInt(debtMatch[1], 10);

      const rankMatch = textStr.match(/Xếp loại học lực tích lũy:\s*([^\t\n\r]+)/i);
      if (rankMatch) semSummary.academicRank = rankMatch[1].trim();

      const semRankMatch = textStr.match(/Xếp loại học lực học kỳ:\s*([^\t\n\r]+)/i);
      if (semRankMatch) semSummary.semesterRank = semRankMatch[1].trim();

      const actionMatch = textStr.match(/Xử lý học vụ:\s*([^\t\n\r]+)/i);
      if (actionMatch) semSummary.academicAction = actionMatch[1].trim();

      semesterSummaries[currentSemester] = semSummary;
      return;
    }

    const tds = $tr.find("td");
    if (tds.length < 3) return;

    const subjectCode = text($, tds.eq(1));
    const subjectName = text($, tds.eq(2));
    const credits = num(text($, tds.eq(3)));

    const letter = text($, $tr.find('td[title="DiemChu"],td[title="diemChu"]').first()).trim().toUpperCase();
    const point = num(text($, $tr.find('td[title="DiemTinChi"],td[title="diemTinChi"]').first()));
    const finalScore = num(text($, $tr.find('td[title="DiemTongKet"],td[title="diemTongKet"]').first()));

    if (subjectName && (subjectCode || credits !== null)) {
      const gPoint = point ?? gradePoint(letter);
      const isPending = !letter && gPoint === null && finalScore === null;

      const subjectObj = {
        subjectCode,
        subjectName,
        credits: credits ?? 0,
        letter: letter || "",
        gradePoint: gPoint,
        finalScore,
        isPending,
        semester: currentSemester || "Không rõ học kỳ",
        raw: $tr.find("td").map((__, td) => ({ title: $(td).attr("title") || "", text: text($, td) })).get(),
      };

      subjects.push(subjectObj);
      lastSubject = subjectObj;
    } else if (lastSubject && (letter || finalScore !== null)) {
      const gPoint = point ?? gradePoint(letter);
      if (gPoint !== null || finalScore !== null) {
        if (letter) lastSubject.letter = letter;
        if (gPoint !== null) lastSubject.gradePoint = gPoint;
        if (finalScore !== null) lastSubject.finalScore = finalScore;
        lastSubject.isPending = false;
      }
    }
  });

  const semKeys = Object.keys(semesterSummaries);
  const latestSem = semKeys[semKeys.length - 1];
  const globalSummary = (latestSem ? semesterSummaries[latestSem] : null) || {
    registeredCredits: null,
    accumulatedCredits: null,
    debtCredits: null,
    academicRank: "",
    cumGpa4: null,
    cumGpa10: null,
  };

  logger.debug(`[academic:parse] title-attr parser found ${subjects.length} subjects, summary:`, globalSummary);
  if (subjects.length > 0) {
    logger.info(`[academic:parse] valid subjects=${subjects.length}`);
    return { source_url: URL, subjects, summary: globalSummary, semesterSummaries };
  }

  $("table").each((_, table) => {
    const headers = $(table).find("tr").first().find("th,td").map((__, cell) => text($, cell)).get();
    $(table).find("tr").slice(1).each((__, tr) => {
      const cells = $(tr).find("td").map((___, td) => text($, td)).get();
      if (cells.length < 4) return;
      const row = {};
      headers.forEach((h, i) => { if (h) row[h] = cells[i]; });
      const direct = normalizeSubject(row);
      if (direct) { subjects.push(direct); return; }

      const code = cells.find(c => /^\d{6,}$/.test(c)) || "";
      const letter = cells.find(c => /^[ABCDF]$/.test(c)) || "";
      const point4 = gradePoint(letter);
      if (!letter || point4 === null) return;
      const name = cells.find(c => c && c !== code && c !== letter && !/^\d+(\.\d+)?$/.test(c)) || "";
      const credit = cells.map(num).find(n => n > 0 && n <= 10) ?? null;
      subjects.push({ subjectCode: code, subjectName: name, credits: credit, letter, gradePoint: point4, raw: cells });
    });
  });

  logger.debug(`[academic:parse] table fallback total subjects=${subjects.length}`);

  const scripts = [];
  $("script").each((_, s) => scripts.push($(s).html() || ""));
  for (const block of extractJsonArrays(scripts.join("\n"))) {
    try {
      const rows = JSON.parse(block);
      for (const r of rows) {
        const subject = normalizeSubject(r);
        if (subject) subjects.push(subject);
      }
    } catch { }
  }

  logger.debug(`[academic:parse] script fallback total subjects=${subjects.length}`);

  const seen = new Set();
  const valid = subjects.filter(s => {
    if (!s.subjectName) return false;
    const key = `${s.subjectCode}|${s.subjectName}|${s.letter}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  logger.info(`[academic:parse] valid subjects=${valid.length}`);
  if (valid.length === 0) throw new Error(`Không parse được bảng điểm từ HTML UNETI (title="${title}", tables=${tableCount}, bangDiemRows=${bangDiemRows}, hasDiemChu=${hasDiemChu})`);
  return { source_url: URL, subjects: valid, summary: globalSummary, semesterSummaries };
}

export async function getAcademicResults() {
  logger.info("[academic] fetching academic results");
  const res = await requestViaWindow({ endpoint: URL, referer: URL, method: "GET", label: "academic-results" });
  logger.debug(`[academic] response status=${res.status}, url=${res.url}, length=${res.text.length}`);
  if (!/ket-qua-hoc-tap\.html/i.test(res.url || "")) {
    logger.warn(`[academic] unexpected response url=${res.url}`);
    throw createAuthError(`Session expired or redirected when fetching academic results: ${res.url}`);
  }
  if (looksLoggedOutHtml(res.text)) throw createAuthError("Session expired when fetching academic results");
  const parsed = parseAcademicResults(res.text);
  await saveAcademicResults(parsed);
  logger.info(`[academic] fetched ${parsed.subjects.length} subjects`);
  return parsed;
}
