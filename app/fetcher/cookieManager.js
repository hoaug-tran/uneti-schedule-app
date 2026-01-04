import fs from "fs/promises";
import path from "path";
import { session } from "electron";
import keytar from "keytar";
import { getStoreDir } from "./storePath.js";
import { CONFIG } from "../config.js";
import { encryptJSON, decryptJSON, isEncrypted } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";

let cookiePersistTimeout = null;

export function getCookiePartition() {
  return "persist:uneti-session";
}

export async function saveCookiesToSecureStorage(cookies) {
  try {
    const json = JSON.stringify(cookies);
    await keytar.setPassword(
      CONFIG.COOKIE_KEYTAR_SERVICE,
      CONFIG.COOKIE_KEYTAR_ACCOUNT,
      json
    );
    logger.debug(
      `[cookieManager] saved ${cookies.length} cookies to secure storage`
    );
    return true;
  } catch (err) {
    logger.warn(
      `[cookieManager] keytar save failed, fallback to JSON: ${err?.message}`
    );
    return await saveCookiesToJsonFile(cookies);
  }
}

async function saveCookiesToJsonFile(cookies) {
  try {
    const dir = getStoreDir();
    await fs.mkdir(dir, { recursive: true });
    const jsonPath = path.join(dir, "cookies.json");

    const encrypted = encryptJSON(cookies);
    await fs.writeFile(jsonPath, encrypted, "utf8");

    logger.info(`Saved ${cookies.length} encrypted cookies to JSON file`);
    return true;
  } catch (err) {
    logger.error("JSON cookie save failed", { error: err.message });
    return false;
  }
}

export async function saveCookieHeaderToTxt(cookieHeader) {
  try {
    const dir = getStoreDir();
    await fs.mkdir(dir, { recursive: true });
    const txtPath = path.join(dir, "cookies.txt");
    await fs.writeFile(txtPath, cookieHeader, "utf8");
    logger.debug("[cookieManager] saved cookie header to txt");
    return true;
  } catch (err) {
    logger.error(`[cookieManager] txt save failed: ${err?.message}`);
    return false;
  }
}

export async function loadCookiesFromSecureStorage() {
  try {
    const json = await keytar.getPassword(
      CONFIG.COOKIE_KEYTAR_SERVICE,
      CONFIG.COOKIE_KEYTAR_ACCOUNT
    );
    if (json) {
      const cookies = JSON.parse(json);
      logger.debug(
        `[cookieManager] loaded ${cookies.length} cookies from secure storage`
      );
      return cookies;
    }
  } catch (err) {
    logger.warn(`[cookieManager] keytar load failed: ${err?.message}`);
  }
  return null;
}

async function loadCookiesFromJsonFile() {
  try {
    const dir = getStoreDir();
    const jsonPath = path.join(dir, "cookies.json");
    const data = await fs.readFile(jsonPath, "utf8");

    let cookies;
    if (isEncrypted(data)) {
      cookies = decryptJSON(data);
      logger.info(`Loaded ${cookies.length} encrypted cookies from JSON file`);
    } else {
      cookies = JSON.parse(data);
      logger.warn(`Loaded ${cookies.length} plaintext cookies (migrating to encrypted)`);

      await saveCookiesToJsonFile(cookies);
    }

    return cookies;
  } catch (err) {
    logger.warn("JSON cookie load failed", { error: err.message });
    return null;
  }
}

export async function loadCookieHeaderFromTxt() {
  try {
    const dir = getStoreDir();
    const txtPath = path.join(dir, "cookies.txt");
    const header = await fs.readFile(txtPath, "utf8");
    const h = header.replace(/\r?\n/g, "").trim();
    return h || null;
  } catch {
    return null;
  }
}

function validateCookie(cookie) {
  if (!cookie.name || !cookie.value) return false;
  if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) {
    return false;
  }
  return true;
}

export async function bootstrapCookiesToSession() {
  const partition = getCookiePartition();
  const ses = session.fromPartition(partition);

  const existing = await ses.cookies.get({ domain: CONFIG.UNETI_DOMAIN });
  if (existing && existing.length > 0) {
    logger.debug("[cookieManager] session already has cookies");
    return;
  }

  let cookies = await loadCookiesFromSecureStorage();
  if (!cookies) {
    cookies = await loadCookiesFromJsonFile();
  }

  if (!cookies || !Array.isArray(cookies)) {
    logger.warn("[cookieManager] no stored cookies found");
    return;
  }

  const validCookies = cookies.filter(validateCookie);

  for (const cookie of validCookies) {
    try {
      await ses.cookies.set({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || CONFIG.UNETI_DOMAIN,
        path: cookie.path || "/",
        secure: !!cookie.secure,
        httpOnly: !!cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: mapSameSite(cookie.sameSite),
        url: `https://${CONFIG.UNETI_DOMAIN}`,
      });
    } catch (err) {
      logger.warn(
        `[cookieManager] failed to set cookie ${cookie.name}: ${err?.message}`
      );
    }
  }

  try {
    await ses.flushStorageData();
  } catch (err) {
    logger.warn(`[cookieManager] flush storage failed: ${err?.message}`);
  }

  logger.info(`[cookieManager] bootstrapped ${validCookies.length} cookies`);
}

function mapSameSite(value) {
  if (!value) return "unspecified";
  const s = String(value).toLowerCase();
  if (s.includes("lax")) return "lax";
  if (s.includes("strict")) return "strict";
  if (s.includes("none") || s.includes("no_restriction"))
    return "no_restriction";
  return "unspecified";
}

export function attachCookieAutoPersist() {
  const partition = getCookiePartition();
  const ses = session.fromPartition(partition);

  ses.cookies.on("changed", (_evt, cookie) => {
    if (!cookie?.domain?.includes(CONFIG.UNETI_DOMAIN)) return;

    clearTimeout(cookiePersistTimeout);
    cookiePersistTimeout = setTimeout(async () => {
      try {
        const all = await ses.cookies.get({ domain: CONFIG.UNETI_DOMAIN });
        await saveCookiesToSecureStorage(all);
        const header = all.map((c) => `${c.name}=${c.value}`).join("; ");
        await saveCookieHeaderToTxt(header);
        logger.debug(`[cookieManager] auto-persisted ${all.length} cookies`);
      } catch (err) {
        logger.warn(`[cookieManager] auto-persist failed: ${err?.message}`);
      }
    }, CONFIG.COOKIE_PERSIST_DEBOUNCE_MS);
  });
}

export async function hasCookies() {
  try {
    const secure = await loadCookiesFromSecureStorage();
    if (secure) return true;

    const json = await loadCookiesFromJsonFile();
    if (json) return true;

    const txt = await loadCookieHeaderFromTxt();
    if (txt) return true;

    return false;
  } catch {
    return false;
  }
}

export async function buildCookieHeader() {
  try {
    const txt = await loadCookieHeaderFromTxt();
    if (txt) return txt;
  } catch { }

  try {
    const partition = getCookiePartition();
    const ses = session.fromPartition(partition);
    const cookies = await ses.cookies.get({ domain: CONFIG.UNETI_DOMAIN });
    if (cookies && cookies.length > 0) {
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch { }

  return "";
}

export async function clearAllCookies() {
  try {
    const partition = getCookiePartition();
    const ses = session.fromPartition(partition);
    const cookies = await ses.cookies.get({});

    for (const cookie of cookies) {
      try {
        await ses.cookies.remove(`https://${cookie.domain}`, cookie.name);
      } catch { }
    }

    await ses.flushStorageData();

    const dir = getStoreDir();
    try {
      await fs.rm(path.join(dir, "cookies.json"), { force: true });
    } catch { }
    try {
      await fs.rm(path.join(dir, "cookies.txt"), { force: true });
    } catch { }

    try {
      await keytar.deletePassword(
        CONFIG.COOKIE_KEYTAR_SERVICE,
        CONFIG.COOKIE_KEYTAR_ACCOUNT
      );
    } catch { }

    logger.info("[cookieManager] cleared all cookies");
    return true;
  } catch (err) {
    logger.error(`[cookieManager] clear failed: ${err?.message}`);
    return false;
  }
}
