import fs from "fs/promises";
import path from "path";
import { session } from "electron";
import keytar from "keytar";
import { getStoreDir } from "./storePath.js";
import { CONFIG } from "../config.js";
import { encryptJSON, decryptJSON, isEncrypted, encrypt, decrypt } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";

let cookiePersistTimeout = null;

export function getCookiePartition() {
  return "persist:uneti-session";
}

export async function saveCookiesToSecureStorage(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return false;
  }
  try {
    const normalized = cookies.map(normalizeCookie);
    const json = JSON.stringify(normalized);
    await keytar.setPassword(
      CONFIG.COOKIE_KEYTAR_SERVICE,
      CONFIG.COOKIE_KEYTAR_ACCOUNT,
      json
    );
    logger.debug(
      `[cookieManager] saved ${normalized.length} cookies to secure storage`
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
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return false;
  }
  try {
    const dir = getStoreDir();
    await fs.mkdir(dir, { recursive: true });
    const jsonPath = path.join(dir, "cookies.json");

    const normalized = cookies.map(normalizeCookie);
    const encrypted = encryptJSON(normalized);
    await fs.writeFile(jsonPath, encrypted, "utf8");

    logger.info(`Saved ${normalized.length} encrypted cookies to JSON file`);
    return true;
  } catch (err) {
    logger.error("JSON cookie save failed", { error: err.message });
    return false;
  }
}

export async function saveCookieHeaderToTxt(cookieHeader) {
  if (!cookieHeader || !cookieHeader.trim()) {
    return false;
  }
  try {
    const dir = getStoreDir();
    await fs.mkdir(dir, { recursive: true });
    const txtPath = path.join(dir, "cookies.txt");
    const encrypted = encrypt(cookieHeader);
    await fs.writeFile(txtPath, encrypted, "utf8");
    logger.debug("[cookieManager] saved encrypted cookie header to txt");
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
    if (err?.code !== "ENOENT") {
      logger.warn("JSON cookie load failed", { error: err.message });
    }
    return null;
  }
}

export async function loadCookieHeaderFromTxt() {
  try {
    const dir = getStoreDir();
    const txtPath = path.join(dir, "cookies.txt");
    const data = await fs.readFile(txtPath, "utf8");
    const h = data.replace(/\r?\n/g, "").trim();
    if (!h) return null;
    try {
      return decrypt(h);
    } catch {
      return h;
    }
  } catch {
    return null;
  }
}

export function getJwtExpiration(tokenValue) {
  try {
    if (!tokenValue || typeof tokenValue !== "string") return null;
    const parts = tokenValue.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    if (typeof payload.exp === "number") {
      return payload.exp;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeCookie(cookie) {
  if (!cookie || !cookie.value) return cookie;
  const jwtExp = getJwtExpiration(cookie.value);
  if (jwtExp && jwtExp > Date.now() / 1000) {
    return {
      ...cookie,
      expirationDate: jwtExp,
      session: false,
    };
  }
  return cookie;
}

function validateCookie(cookie) {
  if (!cookie.name || !cookie.value) return false;
  const jwtExp = getJwtExpiration(cookie.value);
  if (jwtExp) {
    return jwtExp > Date.now() / 1000;
  }
  if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) {
    return false;
  }
  return true;
}

export async function bootstrapCookiesToSession() {
  const partition = getCookiePartition();
  const ses = session.fromPartition(partition);

  const allExisting = await ses.cookies.get({});
  const existing = allExisting.filter(c => c.domain?.includes(CONFIG.UNETI_DOMAIN));
  const validExisting = existing.filter(validateCookie);
  const hasAccessToken = validExisting.some(c => c.name === "access_token");
  if (validExisting.length > 0 && hasAccessToken) {
    logger.debug("[cookieManager] session already has cookies");
    return;
  }

  let cookies = await loadCookiesFromSecureStorage();
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    cookies = await loadCookiesFromJsonFile();
  }

  if (!cookies || !Array.isArray(cookies)) {
    logger.warn("[cookieManager] no stored cookies found");
    return;
  }

  const normalizedCookies = cookies.map(normalizeCookie);
  const validCookies = normalizedCookies.filter(validateCookie);

  for (const cookie of validCookies) {
    try {
      const cleanDomain = (cookie.domain || CONFIG.UNETI_DOMAIN).replace(/^\./, "");
      const cleanPath = cookie.path || "/";
      await ses.cookies.set({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cleanPath,
        secure: !!cookie.secure,
        httpOnly: !!cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: mapSameSite(cookie.sameSite),
        url: `https://${cleanDomain}${cleanPath}`,
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
        const all = await ses.cookies.get({});
        const filtered = all.filter(c => c.domain?.includes(CONFIG.UNETI_DOMAIN));
        await saveCookiesToSecureStorage(filtered);
        const header = filtered.map((c) => `${c.name}=${c.value}`).join("; ");
        await saveCookieHeaderToTxt(header);
        logger.debug(`[cookieManager] auto-persisted ${filtered.length} cookies`);
      } catch (err) {
        logger.warn(`[cookieManager] auto-persist failed: ${err?.message}`);
      }
    }, CONFIG.COOKIE_PERSIST_DEBOUNCE_MS);
  });
}

export async function hasCookies() {
  try {
    const partition = getCookiePartition();
    const ses = session.fromPartition(partition);
    const sesCookies = await ses.cookies.get({});
    const filteredSes = sesCookies.filter((c) => c.domain?.includes(CONFIG.UNETI_DOMAIN));
    if (filteredSes.length > 0) return true;

    const secure = await loadCookiesFromSecureStorage();
    if (Array.isArray(secure) && secure.length > 0) return true;

    const json = await loadCookiesFromJsonFile();
    if (Array.isArray(json) && json.length > 0) return true;

    const txt = await loadCookieHeaderFromTxt();
    if (txt && txt.trim().length > 0) return true;

    return false;
  } catch {
    return false;
  }
}

export async function areCookiesValid() {
  try {
    const partition = getCookiePartition();
    const ses = session.fromPartition(partition);
    const sesCookies = await ses.cookies.get({});
    const filteredSes = sesCookies.filter((c) => c.domain?.includes(CONFIG.UNETI_DOMAIN));
    const validSes = filteredSes.filter(validateCookie);
    if (validSes.length > 0) {
      return true;
    }

    let cookies = await loadCookiesFromSecureStorage();
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      cookies = await loadCookiesFromJsonFile();
    }

    if (!cookies || !Array.isArray(cookies)) {
      return false;
    }

    const validCookies = cookies.filter(validateCookie);
    return validCookies.length > 0;
  } catch {
    return false;
  }
}

export async function buildCookieHeader() {
  try {
    const partition = getCookiePartition();
    const ses = session.fromPartition(partition);
    const all = await ses.cookies.get({});
    const cookies = all.filter((c) => c.domain?.includes(CONFIG.UNETI_DOMAIN));
    const validCookies = cookies.filter(validateCookie);
    const hasAccessToken = validCookies.some((c) => c.name === "access_token");
    if (validCookies.length > 0 && hasAccessToken) {
      return validCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch {}

  try {
    const txt = await loadCookieHeaderFromTxt();
    if (txt && txt.includes("access_token")) return txt;
  } catch {}

  let stored = await loadCookiesFromSecureStorage();
  if (!stored || stored.length === 0) {
    stored = await loadCookiesFromJsonFile();
  }
  if (Array.isArray(stored) && stored.length > 0) {
    const valid = stored.map(normalizeCookie).filter(validateCookie);
    const hasAccessToken = valid.some((c) => c.name === "access_token");
    if (valid.length > 0 && hasAccessToken) {
      return valid.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  }

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
