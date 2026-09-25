import { net } from "electron";
import { buildCookieHeader } from "./cookieManager.js";
import { createAuthError } from "./sessionState.js";
import { logger } from "../utils/logger.js";

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

  logger.debug(`[supportApi] ${method} ${endpoint} (${label})`);

  let res;
  try {
    res = await net.fetch(endpoint, options);
  } catch (err) {
    logger.error(`[supportApi] network error on ${label}: ${err?.message}`);
    throw err;
  }

  if (res.status === 401) {
    logger.warn(`[supportApi] ${label} returned 401 unauthorized`);
    throw createAuthError(`Session expired when calling ${label}`);
  }

  if (!res.ok) {
    const text = await res.text();
    logger.error(`[supportApi] ${label} failed with status ${res.status}: ${text.slice(0, 150)}`);
    throw new Error(`HTTP ${res.status} when calling ${label}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
