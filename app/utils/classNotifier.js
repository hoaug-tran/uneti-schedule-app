import { Notification } from "electron";
import { formatYMDLocal, periodsTime, vietnamNow } from "./date.js";
import { logger } from "./logger.js";

const notifiedItems = new Set();
let reminderInterval = null;
let lastRecordedDay = "";
let generation = 0;

function parseClassTime(dayStr, timeStr) {
  try {
    const value = new Date(dayStr + "T" + timeStr + ":00+07:00");
    return Number.isFinite(value.getTime()) ? value : null;
  } catch {
    return null;
  }
}

function pruneOldNotifiedItems(todayStr) {
  if (lastRecordedDay && lastRecordedDay !== todayStr) {
    notifiedItems.clear();
  }
  lastRecordedDay = todayStr;

  for (const itemKey of notifiedItems) {
    if (!itemKey.startsWith(todayStr)) {
      notifiedItems.delete(itemKey);
    }
  }
}

export function startClassReminderService({ getTodaySchedule, onNotificationClick, iconPath }) {
  stopClassReminderService();
  const ownGeneration = generation;

  const check = async () => {
    try {
      if (!Notification.isSupported()) return;
      if (typeof getTodaySchedule !== "function") return;

      const scheduleItems = await getTodaySchedule();
      if (ownGeneration !== generation) return;
      if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return;

      const now = new Date();
      const todayStr = formatYMDLocal(vietnamNow(now));
      pruneOldNotifiedItems(todayStr);

      const todayItems = scheduleItems.filter((it) => it.day === todayStr);

      for (const item of todayItems) {
        if (!item.periods || item.periods.length === 0) continue;

        const firstPeriod = item.periods[0];
        const timePair = periodsTime[firstPeriod];
        if (!timePair) continue;

        const startTimeStr = timePair[0];
        const classDate = parseClassTime(todayStr, startTimeStr);
        if (!classDate) continue;

        const diffMinutes = (classDate.getTime() - now.getTime()) / 60000;
        const itemKey = `${todayStr}:${item.subject}:${firstPeriod}`;

        if (diffMinutes > 0 && diffMinutes <= 20 && !notifiedItems.has(itemKey)) {
          notifiedItems.add(itemKey);

          const isExam = item.type === "Thi";
          const title = isExam ? "Nhắc lịch thi UNETI" : "Nhắc lịch học UNETI";
          const periodText = item.periods.length > 1
            ? `${item.periods[0]} - ${item.periods[item.periods.length - 1]}`
            : `${item.periods[0]}`;
          const roomText = item.room ? `tại ${item.room}` : "";
          const body = `${item.subject} (Tiết ${periodText}) ${roomText} lúc ${startTimeStr}`.trim();

          const notif = new Notification({
            title,
            body,
            icon: iconPath || undefined,
            silent: false,
          });

          if (typeof onNotificationClick === "function") {
            notif.on("click", onNotificationClick);
          }

          notif.show();
          logger.info("[classNotifier] Sent class reminder");
        }
      }
    } catch (err) {
      logger.warn(`[classNotifier] check failed: ${err?.message}`);
    }
  };

  check();
  reminderInterval = setInterval(check, 2 * 60 * 1000);
}

export function stopClassReminderService() {
  generation++;
  notifiedItems.clear();
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
