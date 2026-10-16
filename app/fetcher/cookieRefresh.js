import { callSupportApi } from "./supportApi.js";
import { getStudentId } from "./userStore.js";
import { isAuthError, captureSession, assertSession } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { API_FIELDS } from "../constants.js";
import { logger } from "../utils/logger.js";

let refreshTimer = null;
let generation = 0;

export function startCookieRefreshService(onAuthExpired = null) {
  stopCookieRefreshService();
  const ownGeneration = generation;
  const snapshot = captureSession();

  refreshTimer = setInterval(async () => {
    try {
      const studentId = await getStudentId();
      if (!studentId || ownGeneration !== generation) return;
      assertSession(snapshot);

      const testUrl = `${CONFIG.UNETI_SCHEDULE_ENDPOINT}?${API_FIELDS.GRADES_STUDENT_ID}=${encodeURIComponent(studentId)}`;
      await callSupportApi({
        endpoint: testUrl,
        signal: snapshot.signal,
        method: "GET",
        label: "session-heartbeat",
      });
      logger.debug("[cookieRefresh] session heartbeat OK");
    } catch (err) {
      if (ownGeneration !== generation || snapshot.signal.aborted) return;
      logger.warn(`[cookieRefresh] heartbeat failed: ${err?.message}`);
      if (isAuthError(err)) {
        stopCookieRefreshService();
        if (typeof onAuthExpired === "function") {
          await onAuthExpired();
        }
      }
    }
  }, CONFIG.COOKIE_REFRESH_INTERVAL_MS);

  logger.info("[cookieRefresh] service started");
}

export function stopCookieRefreshService() {
  generation++;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info("[cookieRefresh] service stopped");
  }
}
