import * as cheerio from "cheerio";

export const AUTH_EXPIRED = "AUTH_EXPIRED";

export function createAuthError(reason = "Session expired") {
  const err = new Error(reason);
  err.code = AUTH_EXPIRED;
  return err;
}

export function isAuthError(err) {
  const msg = err?.message || String(err || "");
  return err?.code === AUTH_EXPIRED || /Cookie expired|No cookies|stale session|AUTH_EXPIRED|Session expired/i.test(msg);
}

export function looksLoggedOutHtml(html = "") {
  if (!html || typeof html !== "string") return true;
  if (/Just a moment|Performing security verification|cf-browser-verification|cf_clearance/i.test(html)) {
    return true;
  }

  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  if (/đăng nhập|dang nhap|login/i.test(title)) return true;
  if (/bang-tin\.html|bảng tin/i.test(html) && !/xemDiem_aaa|lich-theo-tuan|DiemChu/i.test(html)) return true;
  const hasPassword = $('input[type="password"]').length > 0;
  const hasLoginForm = $('form[action*="dang-nhap"], form[action*="DangNhap"], form[action*="login"]').length > 0;
  const hasLoginLink = $('a[href*="dang-nhap"], a[href*="DangNhap"], a[href*="login"]').length > 0;
  const hasLogout = $('a[href*="DangXuat"], form[action*="DangXuat"], a[href*="logout"]').length > 0;

  if (hasPassword || hasLoginForm) return true;
  if (hasLogout) return false;
  return hasLoginLink && !/lich|kết quả|ket qua|điểm|diem/i.test($.text());
}
