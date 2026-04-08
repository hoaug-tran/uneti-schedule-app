/**
 * fetchViaWindow.js
 *
 * Bypass Cloudflare Bot Protection bằng cách chạy fetch() từ BÊN TRONG
 * một BrowserWindow ẩn dùng cùng partition với login window.
 *
 * Lý do: session.fetch() từ main process vẫn bị Cloudflare block dù có
 * cf_clearance cookie. Nhưng fetch() chạy trong Chromium renderer context
 * với đúng TLS fingerprint + cf_clearance thì qua được.
 */

import { BrowserWindow } from "electron";
import { getCookiePartition } from "./cookieManager.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

let _win = null;
let _winReady = false;
let _winLoading = false;

/**
 * Lấy hoặc tạo hidden BrowserWindow với partition chứa cf_clearance.
 * Chỉ tạo 1 lần, tái sử dụng cho mọi request.
 */
async function getOrCreateWindow() {
  if (_win && !_win.isDestroyed() && _winReady) {
    return _win;
  }

  if (_winLoading) {
    // Chờ window đang load xong
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (_winReady || (_win && _win.isDestroyed())) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    if (_win && !_win.isDestroyed() && _winReady) return _win;
  }

  _winReady = false;
  _winLoading = true;

  return new Promise((resolve, reject) => {
    try {
      _win = new BrowserWindow({
        show: false,
        width: 10,
        height: 10,
        skipTaskbar: true,
        webPreferences: {
          partition: getCookiePartition(), // Dùng chung partition với login window
          contextIsolation: false,         // Cần false để executeJavaScript hoạt động
          javascript: true,
          backgroundThrottling: false,
        },
      });

      _win.on("closed", () => {
        _win = null;
        _winReady = false;
        _winLoading = false;
        logger.debug("[fetchViaWindow] hidden window closed");
      });

      _win.webContents.on("did-fail-load", (_, code, desc) => {
        logger.warn(`[fetchViaWindow] page load failed: ${code} ${desc}`);
        // Vẫn coi là ready — CF challenge có thể xuất hiện sau
        _winReady = true;
        _winLoading = false;
        resolve(_win);
      });

      _win.webContents.on("did-finish-load", () => {
        logger.debug("[fetchViaWindow] hidden window page loaded");
        _winReady = true;
        _winLoading = false;
        resolve(_win);
      });

      // Load trang lịch của UNETI để thiết lập same-origin context
      // Điều này cũng cho phép Chromium tự giải Cloudflare challenge nếu cần
      _win.loadURL("https://sinhvien.uneti.edu.vn/lich-theo-tuan.html");
      logger.debug("[fetchViaWindow] created hidden window, loading UNETI page...");
    } catch (err) {
      _winLoading = false;
      reject(err);
    }
  });
}

/**
 * Thực hiện POST request TỪ BÊN TRONG Chromium renderer window.
 * fetch() chạy trong context này có đầy đủ TLS fingerprint + cookies (kể cả cf_clearance).
 */
export async function postViaWindow(body, label) {
  const win = await getOrCreateWindow();

  const endpoint = CONFIG.UNETI_SCHEDULE_ENDPOINT;
  const referer = "https://sinhvien.uneti.edu.vn/lich-theo-tuan.html";

  // Script chạy trong Chromium renderer — same-origin với UNETI
  const script = `
    (async () => {
      try {
        const res = await fetch(${JSON.stringify(endpoint)}, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': ${JSON.stringify(referer)},
          },
          body: ${JSON.stringify(body)},
          credentials: 'include',
        });
        const status = res.status;
        const text = await res.text();
        return { ok: res.ok, status, text };
      } catch (e) {
        return { ok: false, status: 0, text: '', error: String(e.message) };
      }
    })()
  `;

  let result;
  try {
    result = await win.webContents.executeJavaScript(script, true);
  } catch (err) {
    // Nếu window bị destroy hoặc lỗi khác, tạo lại
    logger.warn(`[fetchViaWindow] executeJavaScript failed (${label}): ${err?.message}`);
    _win = null;
    _winReady = false;
    throw new Error(`executeJavaScript failed for ${label}: ${err?.message}`);
  }

  if (result.error) {
    throw new Error(`Network error when fetching schedule (${label}): ${result.error}`);
  }

  if (!result.ok) {
    throw new Error(
      `HTTP ${result.status} when fetching schedule (${label}). ${result.text.slice(0, 120)}`
    );
  }

  logger.debug(`[fetchViaWindow] ${label}: HTTP ${result.status}, length ${result.text.length}`);
  return result.text;
}

/**
 * Destroy hidden window (gọi khi logout hoặc app quit)
 */
export function destroyFetchWindow() {
  if (_win && !_win.isDestroyed()) {
    _win.destroy();
    _win = null;
    _winReady = false;
  }
}
