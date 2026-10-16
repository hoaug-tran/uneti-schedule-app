import fs from "fs/promises";
import path from "path";
import { session } from "electron";
import keytar from "keytar";
import { getStoreDir } from "./storePath.js";
import { CONFIG } from "../config.js";
import { encryptJSON, decryptJSON, isEncrypted, decrypt } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";
import { captureSession, assertSession } from "./sessionState.js";

let cookiePersistTimeout = null;
let persisterSuspended = false;
let cookieEpoch = 0;
let cookieQueue = Promise.resolve();
let persisterAttached = false;
function queued(task) {
  const next = cookieQueue.catch(() => {}).then(task);
  cookieQueue = next;
  return next;
}

export function getCookiePartition() {
  return "persist:uneti-session";
}

export function isUnetiDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  const d = domain.replace(/^\./, "").toLowerCase().trim();
  return d === CONFIG.UNETI_DOMAIN || d.endsWith("." + CONFIG.UNETI_DOMAIN);
}

function getCookieUrl(cookie) {
  const cleanDomain = (cookie.domain || CONFIG.UNETI_DOMAIN).replace(/^\./, "");
  const cleanPath = cookie.path || "/";
  return `https://${cleanDomain}${cleanPath.startsWith("/") ? cleanPath : "/" + cleanPath}`;
}

export function suspendCookiePersister() {
  persisterSuspended = true;
  if (cookiePersistTimeout) {
    clearTimeout(cookiePersistTimeout);
    cookiePersistTimeout = null;
  }
}

export function resumeCookiePersister() {
  persisterSuspended = false;
}

async function removeLegacyFiles() {
  const dir = getStoreDir();
  await fs.rm(path.join(dir, "cookies.txt"), { force: true });
  await fs.rm(path.join(dir, "cookies.txt.bak"), { force: true });
}

export function saveCookiesToSecureStorage(cookies) {
  const epoch = cookieEpoch;
  return queued(async () => {
    if (epoch !== cookieEpoch) return false;
    return persistCookies(cookies);
  });
}
async function persistCookies(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) return false;
  const filtered = cookies.filter((c) => isUnetiDomain(c.domain || CONFIG.UNETI_DOMAIN));
  if (filtered.length === 0) return false;

  const normalized = filtered.map(normalizeCookie);
  let saved = false;
  let usedVault = false;
  try {
    const json = JSON.stringify(normalized);
    await keytar.setPassword(
      CONFIG.COOKIE_KEYTAR_SERVICE,
      CONFIG.COOKIE_KEYTAR_ACCOUNT,
      json
    );
    logger.debug(`[cookieManager] saved ${normalized.length} cookies to secure storage`);
    saved = true;
    usedVault = true;
  } catch (err) {
    logger.warn(`[cookieManager] keytar save failed, fallback to JSON: ${err?.message}`);
    saved = await saveCookiesToJsonFile(normalized);
  }

  if (saved) {
    await removeLegacyFiles();
    if (usedVault) {
      await fs.rm(path.join(getStoreDir(), "cookies.json"), { force: true });
    }
    await fs.rm(path.join(getStoreDir(), "cookies.json.bak"), { force: true });
  }
  return saved;
}

async function saveCookiesToJsonFile(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) return false;
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

export async function saveCookieHeaderToTxt(_cookieHeader) {
  try {
    await removeLegacyFiles();
  } catch {}
  return true;
}

export async function loadCookiesFromSecureStorage() {
  try {
    const json = await keytar.getPassword(
      CONFIG.COOKIE_KEYTAR_SERVICE,
      CONFIG.COOKIE_KEYTAR_ACCOUNT
    );
    if (json) {
      const cookies = JSON.parse(json);
      if (Array.isArray(cookies)) {
        logger.debug(`[cookieManager] loaded ${cookies.length} cookies from secure storage`);
        return cookies;
      }
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
    if (!isEncrypted(data)) {
      logger.warn("[cookieManager] rejected unencrypted basic_text cookies in JSON file");
      return null;
    }
    const cookies = decryptJSON(data);
    if (Array.isArray(cookies)) {
      logger.info(`Loaded ${cookies.length} encrypted cookies from JSON file`);
      if (!data.startsWith("v1:")) {
        if (!await saveCookiesToSecureStorage(cookies)) return null;
      }
      return cookies;
    }
    return null;
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
    if (isEncrypted(h)) {
      try {
        return decrypt(h);
      } catch {
        return null;
      }
    }
    return null;
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
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
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
  if (!cookie || !cookie.name || !cookie.value) return false;
  if (!isUnetiDomain(cookie.domain || CONFIG.UNETI_DOMAIN)) return false;

  const nowSec = Date.now() / 1000;
  const jwtExp = getJwtExpiration(cookie.value);
  if (jwtExp !== null && jwtExp <= nowSec) return false;

  if (cookie.name === "access_token") {
    if (jwtExp === null || jwtExp <= nowSec) return false;
  }

  if (typeof cookie.expirationDate === "number" && cookie.expirationDate <= nowSec) {
    return false;
  }
  return true;
}

function hasValidAccessToken(cookies) {
  return Array.isArray(cookies) && cookies.some((c) => c.name === "access_token" && validateCookie(c));
}

export async function bootstrapCookiesToSession() {
  const snapshot = captureSession();
  resumeCookiePersister();
  const partition = getCookiePartition();
  const ses = session.fromPartition(partition);

  const allExisting = await ses.cookies.get({});
  assertSession(snapshot);
  const existing = allExisting.filter((c) => isUnetiDomain(c.domain));
  const validExisting = existing.filter(validateCookie);
  if (validExisting.length > 0 && hasValidAccessToken(validExisting)) {
    await saveCookiesToSecureStorage(validExisting);
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
  assertSession(snapshot);
  const validCookies = normalizedCookies.filter(validateCookie);

  for (const cookie of validCookies) {
    assertSession(snapshot);
    try {
      await ses.cookies.set({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: typeof cookie.secure === "boolean" ? cookie.secure : true,
        httpOnly: !!cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: mapSameSite(cookie.sameSite),
        url: getCookieUrl(cookie),
      });
    } catch (err) {
      logger.warn(`[cookieManager] failed to set cookie ${cookie.name}: ${err?.message}`);
    }
  }

  try {
    await ses.flushStorageData();
  } catch (err) {
    logger.warn(`[cookieManager] flush storage failed: ${err?.message}`);
  }

  if (hasValidAccessToken(validCookies)) await saveCookiesToSecureStorage(validCookies);
  logger.info(`[cookieManager] bootstrapped ${validCookies.length} cookies`);
}

function mapSameSite(value) {
  if (!value) return "unspecified";
  const s = String(value).toLowerCase();
  if (s.includes("lax")) return "lax";
  if (s.includes("strict")) return "strict";
  if (s.includes("none") || s.includes("no_restriction")) return "no_restriction";
  return "unspecified";
}

export function attachCookieAutoPersist() {
  if (persisterAttached) return;
  persisterAttached = true;
  const partition = getCookiePartition();
  const ses = session.fromPartition(partition);

  ses.cookies.on("changed", (_evt, cookie) => {
    if (persisterSuspended) return;
    if (!cookie?.domain || !isUnetiDomain(cookie.domain)) return;

    clearTimeout(cookiePersistTimeout);
    cookiePersistTimeout = setTimeout(async () => {
      if (persisterSuspended) return;
      const snapshot = captureSession();
      try {
        const all = await ses.cookies.get({});
        assertSession(snapshot);
        const filtered = all.filter((c) => isUnetiDomain(c.domain));
        if (persisterSuspended) return;
        if (filtered.length > 0) {
          await saveCookiesToSecureStorage(filtered);
          logger.debug(`[cookieManager] auto-persisted ${filtered.length} cookies`);
        }
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
    const filteredSes = sesCookies.filter((c) => isUnetiDomain(c.domain));
    if (filteredSes.length > 0 && hasValidAccessToken(filteredSes.filter(validateCookie))) {
      return true;
    }

    const secure = await loadCookiesFromSecureStorage();
    if (Array.isArray(secure) && hasValidAccessToken(secure.filter(validateCookie))) return true;

    const json = await loadCookiesFromJsonFile();
    if (Array.isArray(json) && hasValidAccessToken(json.filter(validateCookie))) return true;

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
    const filteredSes = sesCookies.filter((c) => isUnetiDomain(c.domain));
    const validSes = filteredSes.filter(validateCookie);
    if (validSes.length > 0 && hasValidAccessToken(validSes)) {
      return true;
    }

    let cookies = await loadCookiesFromSecureStorage();
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      cookies = await loadCookiesFromJsonFile();
    }
    if (!cookies || !Array.isArray(cookies)) return false;

    const validCookies = cookies.filter(validateCookie);
    return validCookies.length > 0 && hasValidAccessToken(validCookies);
  } catch {
    return false;
  }
}

export async function buildCookieHeader() {
  try {
    const partition = getCookiePartition();
    const ses = session.fromPartition(partition);
    const all = await ses.cookies.get({});
    const cookies = all.filter((c) => isUnetiDomain(c.domain));
    const validCookies = cookies.filter(validateCookie);
    if (validCookies.length > 0 && hasValidAccessToken(validCookies)) {
      return validCookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch {}

  let stored = await loadCookiesFromSecureStorage();
  if (!stored || stored.length === 0) {
    stored = await loadCookiesFromJsonFile();
  }
  if (Array.isArray(stored) && stored.length > 0) {
    const valid = stored.map(normalizeCookie).filter(validateCookie);
    if (valid.length > 0 && hasValidAccessToken(valid)) {
      return valid.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  }

  return "";
}

export function clearAllCookies() {
  suspendCookiePersister();
  cookieEpoch++;
  return queued(async () => {
    const ses = session.fromPartition(getCookiePartition());
    const errors = [];
    async function attempt(task) { try { await task(); } catch (error) { errors.push(error); } }
    await attempt(() => ses.clearStorageData());
    await attempt(() => ses.clearCache());
    await attempt(() => ses.flushStorageData());
    for (const file of ["cookies.json", "cookies.json.bak", "cookies.txt", "cookies.txt.bak"]) {
      await attempt(() => fs.rm(path.join(getStoreDir(), file), { force: true }));
    }
    await attempt(() => keytar.deletePassword(CONFIG.COOKIE_KEYTAR_SERVICE, CONFIG.COOKIE_KEYTAR_ACCOUNT));
    if (errors.length) throw new AggregateError(errors, "Cookie storage could not be fully erased");
    logger.info("[cookieManager] cleared all cookies, storage and backups");
    return true;
  });
}
