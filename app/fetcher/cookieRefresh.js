import { callSupportApi } from "./supportApi.js";
import { getStudentId } from "./userStore.js";
import { isAuthError } from "./sessionState.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

let refreshTimer = null;

export function startCookieRefreshService(onAuthExpired = null) {
  stopCookieRefreshService();

  refreshTimer = setInterval(async () => {
    try {
      const studentId = await getStudentId();
      if (!studentId) return;

      const testUrl = `${CONFIG.UNETI_SCHEDULE_ENDPOINT}?TC_SV_KetQuaHocTap_MaSinhVien=${encodeURIComponent(studentId)}`;
      await callSupportApi({
        endpoint: testUrl,
        method: "GET",
        label: "session-heartbeat",
      });
      logger.debug("[cookieRefresh] session heartbeat OK");
    } catch (err) {
      logger.warn(`[cookieRefresh] heartbeat failed: ${err?.message}`);
      if (isAuthError(err)) {
        stopCookieRefreshService();
        if (typeof onAuthExpired === "function") {
          onAuthExpired();
        }
      }
    }
  }, CONFIG.COOKIE_REFRESH_INTERVAL_MS);

  logger.info("[cookieRefresh] service started");
}

export function stopCookieRefreshService() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info("[cookieRefresh] service stopped");
  }
}
