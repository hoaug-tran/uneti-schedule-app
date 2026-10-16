import { net } from "electron";
import { buildCookieHeader } from "./cookieManager.js";
import { createAuthError, isAuthError } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

function sanitizeUrlForLog(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname;
  } catch {
    return String(rawUrl || "").split(/[?#]/)[0];
  }
}

function getEndpointBase(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(rawUrl || "").split(/[?#]/)[0];
  }
}

function sanitizeErrorMessage(msg) {
  if (typeof msg !== "string") return "";
  return msg.replace(/https?:\/\/[^\s"'<>]+/g, (match) => sanitizeUrlForLog(match));
}

function getAllowedEndpoints() {
  const endpoints = [
    CONFIG.UNETI_SCHEDULE_ENDPOINT,
    CONFIG.UNETI_EXAM_ENDPOINT,
    CONFIG.UNETI_GRADES_ENDPOINT,
    CONFIG.UNETI_GPA_ENDPOINT,
    CONFIG.UNETI_CURRICULUM_ENDPOINT,
    CONFIG.UNETI_MAJOR_CURRICULUM_ENDPOINT,
  ];
  return new Set(
    endpoints
      .filter((url) => typeof url === "string" && url.startsWith("https://"))
      .map((url) => getEndpointBase(url))
  );
}

function combineSignals(userSignal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([userSignal, timeoutSignal]);
  }
  const controller = new AbortController();
  const onAbort = () => {
    try {
      controller.abort(userSignal.reason || timeoutSignal.reason);
    } catch {
      controller.abort();
    }
  };
  if (userSignal.aborted) {
    onAbort();
  } else {
    userSignal.addEventListener("abort", onAbort, { once: true });
    timeoutSignal.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export async function callSupportApi({
  endpoint,
  method = "GET",
  body = null,
  label = "support-api",
  signal = null,
}) {
  const sanitizedPath = sanitizeUrlForLog(endpoint);

  const allowedEndpoints = getAllowedEndpoints();
  let parsed;
  try { parsed = new URL(endpoint); } catch { /* rejected below */ }
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || !allowedEndpoints.has(`${parsed.origin}${parsed.pathname}`)) {
    logger.error(`[supportApi] rejected disallowed or non-HTTPS endpoint for ${label}: ${sanitizedPath}`);
    throw new Error(`Disallowed API endpoint: ${sanitizedPath}`);
  }

  if (signal?.aborted) {
    if (isAuthError(signal.reason)) {
      throw signal.reason;
    }
    throw signal.reason || new Error("Aborted");
  }

  const cookieHeader = await buildCookieHeader();
  if (!cookieHeader) {
    throw createAuthError(`No cookies available when calling ${label}`);
  }

  const headers = {
    Origin: "https://support.uneti.edu.vn",
    Referer: "https://support.uneti.edu.vn/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Cookie: cookieHeader,
  };

  const combinedSignal = combineSignals(signal, CONFIG.HTTP_TIMEOUT_MS || 15000);

  const options = {
    method,
    headers,
    signal: combinedSignal,
    redirect: "error",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const startTime = Date.now();
  let res;
  try {
    res = await net.fetch(endpoint, options);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const safeErrorMsg = sanitizeErrorMessage(err?.message);
    logger.error(`[supportApi] network error on ${label} (${sanitizedPath}) after ${elapsed}ms: ${safeErrorMsg}`);
    if (signal?.aborted && isAuthError(signal.reason)) {
      throw signal.reason;
    }
    if (err && typeof err.message === "string") {
      err.message = safeErrorMsg;
    }
    throw err;
  }

  const elapsed = Date.now() - startTime;
  logger.debug(`[supportApi] ${method} ${sanitizedPath} (${label}) -> ${res.status} (${elapsed}ms)`);

  if (res.status === 401) {
    logger.warn(`[supportApi] ${label} (${sanitizedPath}) returned 401 unauthorized`);
    throw createAuthError(`Session expired when calling ${label}`);
  }

  if (!res.ok) {
    logger.error(`[supportApi] ${label} (${sanitizedPath}) failed with status ${res.status}`);
    throw new Error(`HTTP ${res.status} when calling ${label}`);
  }

  let text;
  try {
    text = await res.text();
  } catch (err) {
    logger.error(`[supportApi] error reading response on ${label} (${sanitizedPath})`);
    if (err && typeof err.message === "string") {
      err.message = sanitizeErrorMessage(err.message);
    }
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    logger.error(`[supportApi] ${label} (${sanitizedPath}) returned non-JSON response`);
    throw new Error(`Invalid JSON response from ${label}`);
  }

  const isValidEnvelope =
    Array.isArray(data) ||
    (data !== null && typeof data === "object" && (Array.isArray(data.body) || Array.isArray(data.data)));

  if (!isValidEnvelope) {
    logger.error(`[supportApi] ${label} (${sanitizedPath}) returned invalid response envelope`);
    throw new Error(`Invalid response envelope from ${label}`);
  }

  return data;
}
