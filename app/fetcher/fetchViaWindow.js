/**
 *
 * Bypass Cloudflare Bot Protection bằng cách chạy fetch() từ trong
 * một BrowserWindow ẩn dùng cùng partition với login window.
 * Hay lắm web UNETI
 */

import { BrowserWindow } from "electron";
import { getCookiePartition } from "./cookieManager.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

let _win = null;
let _winReady = false;
let _winLoading = false;
let _idleTimeout = null;

function resetIdleTimeout() {
  if (_idleTimeout) clearTimeout(_idleTimeout);
  _idleTimeout = setTimeout(() => {
    logger.debug("[fetchViaWindow] destroying hidden window due to idle timeout");
    destroyFetchWindow();
  }, 30000);
}

async function getOrCreateWindow() {
  if (_win && !_win.isDestroyed() && _winReady) {
    resetIdleTimeout();
    return _win;
  }

  if (_winLoading) {
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (_winReady || (_win && _win.isDestroyed())) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    if (_win && !_win.isDestroyed() && _winReady) {
      resetIdleTimeout();
      return _win;
    }
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
          partition: getCookiePartition(),
          contextIsolation: false,
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
        _winReady = true;
        _winLoading = false;
        resolve(_win);
      });

      _win.webContents.on("did-finish-load", () => {
        logger.debug("[fetchViaWindow] hidden window page loaded");
        _winReady = true;
        _winLoading = false;
        resetIdleTimeout();
        resolve(_win);
      });

      _win.loadURL("https://sinhvien.uneti.edu.vn/lich-theo-tuan.html");
      logger.debug("[fetchViaWindow] created hidden window, loading UNETI page...");
    } catch (err) {
      _winLoading = false;
      reject(err);
    }
  });
}

export async function postViaWindow(body, label) {
  const win = await getOrCreateWindow();

  const endpoint = CONFIG.UNETI_SCHEDULE_ENDPOINT;
  const referer = "https://sinhvien.uneti.edu.vn/lich-theo-tuan.html";

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

export function destroyFetchWindow() {
  if (_win && !_win.isDestroyed()) {
    _win.destroy();
    _win = null;
    _winReady = false;
  }
  if (_idleTimeout) {
    clearTimeout(_idleTimeout);
    _idleTimeout = null;
  }
}
