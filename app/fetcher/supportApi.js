import { net } from "electron";
import { buildCookieHeader } from "./cookieManager.js";
import { createAuthError } from "./sessionState.js";
import { logger } from "../utils/logger.js";

function sanitizeUrlForLog(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname;
  } catch {
    return String(rawUrl || "").split("?")[0];
  }
}

export async function callSupportApi({ endpoint, method = "GET", body = null, label = "support-api" }) {
  const cookieHeader = await buildCookieHeader();

  const headers = {
    Origin: "https://support.uneti.edu.vn",
    Referer: "https://support.uneti.edu.vn/",
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const sanitizedPath = sanitizeUrlForLog(endpoint);
  const startTime = Date.now();

  let res;
  try {
    res = await net.fetch(endpoint, options);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error(`[supportApi] network error on ${label} (${sanitizedPath}) after ${elapsed}ms: ${err?.message}`);
    throw err;
  }

  const elapsed = Date.now() - startTime;
  logger.debug(`[supportApi] ${method} ${sanitizedPath} (${label}) -> ${res.status} (${elapsed}ms)`);

  if (res.status === 401) {
    logger.warn(`[supportApi] ${label} (${sanitizedPath}) returned 401 unauthorized`);
    throw createAuthError(`Session expired when calling ${label}`);
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error(`[supportApi] ${label} (${sanitizedPath}) failed with status ${res.status}: ${text.slice(0, 150)}`);
    throw new Error(`HTTP ${res.status} when calling ${label}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
