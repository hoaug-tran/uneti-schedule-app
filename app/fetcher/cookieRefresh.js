import { buildCookieHeader } from "./cookieManager.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

let refreshTimer = null;

export function startCookieRefreshService() {
  stopCookieRefreshService();

  refreshTimer = setInterval(async () => {
    try {
      const header = await buildCookieHeader();
      if (!header) {
        logger.warn("[cookieRefresh] no cookies found");
        return;
      }

      logger.debug("[cookieRefresh] keeping session alive");
    } catch (err) {
      logger.warn(`[cookieRefresh] failed: ${err?.message}`);
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
