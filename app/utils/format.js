import { RANK_THRESHOLDS } from "../constants.js";

export function numberOf(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatScore(score, decimals = 1) {
  const num = numberOf(score);
  return num !== null ? num.toFixed(decimals) : "";
}

export function rankOf(gpa4) {
  if (gpa4 === null || gpa4 === undefined) return "";
  const score = numberOf(gpa4);
  if (score === null) return "";
  const rounded = Math.round((score + Number.EPSILON) * 100) / 100;
  const matched = RANK_THRESHOLDS.find((item) => rounded >= item.min);
  return matched ? matched.rank : "Yếu";
}

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]+/g, " ")
    .trim();
}

export function courseKeyOf(row) {
  const candidate =
    row?.courseKey ||
    row?.courseId ||
    row?.maHocPhan ||
    row?.subjectId ||
    row?.maMonHoc ||
    row?.subjectCode ||
    row?.code ||
    "";
  return String(candidate).trim().toLowerCase();
}

export function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] || c)
  );
}
