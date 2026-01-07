import { startOfWeek, periodsTime } from "../app/utils/date.js";
import { i18nInstance as i18n } from "../app/utils/i18n.js";
import { themeManager } from "../app/utils/theme.js";

let appVersionValue = null;
let currentWeek = startOfWeek(new Date());
let preFetchedWeek = null;

const $ = (s, r = document) => r.querySelector(s);

function setStatus(msg) {
  const el = $("#status");
  if (el) el.innerHTML = msg ?? "";
}



function createToast(html, { id, duration = 3000, clickable = false, type = "info" } = {}) {
  if (id !== "refresh-reminder-toast") {
    hideToast("refresh-reminder-toast");
  }

  const existingToast = id ? document.getElementById(id) : null;
  if (existingToast) {
    existingToast.classList.remove("show");
    setTimeout(() => {
      existingToast.remove();

      const toast = document.createElement("div");
      toast.className = "toast";
      if (id) toast.id = id;
      document.body.appendChild(toast);

      toast.classList.remove("toast-success", "toast-warning", "toast-error", "toast-info");
      toast.classList.add(`toast-${type}`);

      toast.innerHTML = html;
      requestAnimationFrame(() => toast.classList.add("show"));
      if (!clickable && duration > 0) {
        setTimeout(() => {
          toast.classList.remove("show");
          setTimeout(() => toast.remove(), 250);
        }, duration);
      }
    }, 250);
    return existingToast;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  if (id) toast.id = id;
  document.body.appendChild(toast);

  toast.classList.remove("toast-success", "toast-warning", "toast-error", "toast-info");
  toast.classList.add(`toast-${type}`);

  toast.innerHTML = html;
  requestAnimationFrame(() => toast.classList.add("show"));
  if (!clickable && duration > 0) {
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
  return toast;
}

function hideToast(id) {
  const toast = document.getElementById(id);
  if (!toast) return;
  toast.classList.remove("show");
  setTimeout(() => toast.remove(), 250);
}

function showToast(msg, id = "default-toast", type = "info") {
  createToast(msg, { id, type });
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function byDay(data) {
  const m = {};
  for (const x of data) (m[x.day] ??= []).push(x);
  return m;
}

function periodSpan(p = []) {
  if (!Array.isArray(p) || p.length === 0) return "";
  return p.length > 1 ? `${p[0]} - ${p[p.length - 1]}` : `${p[0]}`;
}

function periodTime(p = []) {
  if (!Array.isArray(p) || p.length === 0) return "";
  const a = periodsTime[p[0]]?.[0];
  const b = periodsTime[p[p.length - 1]]?.[1];
  return a && b ? `${a} - ${b}` : "";
}

function cleanRoom(room = "") {
  return room
    .replace(/^Phòng học\//i, "")
    .replace(/^Phòng hiệu năng cao\s*/i, "");
}

function getWeekDays(firstDay, lastDay) {
  const days = [];
  const d = new Date(firstDay);
  while (d <= lastDay) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push(`${yyyy}-${mm}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function createSkeletonHTML() {
  const locale = i18n.getLang() === "vi" ? "vi-VN" : "en-US";
  const today = new Date();
  const weekDays = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    weekDays.push(d);
  }

  return `
    <div class="calendar" id="cal">
      ${weekDays.map(d => `
        <section class="day-col">
          <header class="day-h">
            <div class="skeleton skeleton-line" style="height: 18px; width: 80%; margin: 0 auto;"></div>
          </header>
          <div class="day-body loading">
            <div class="skeleton-block"></div>
          </div>
        </section>
      `).join('')}
    </div>
  `;
}

function safeResize() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay && overlay.style.display !== "none") return;

  const body = document.querySelector(".shell");
  if (body) {
    const rect = body.getBoundingClientRect();
    const newHeight = rect.height;
    window.widgetAPI.resizeHeight(newHeight);
  }
}

document.documentElement.lang = i18n.getLang();

let isOnline = navigator.onLine;
let offlineToastId = "offline-warning";

window.addEventListener("DOMContentLoaded", async () => {
  try {
    appVersionValue = await window.appAPI?.getVersion?.();
    const el = document.querySelector(".version-label");
    if (el && appVersionValue) el.textContent = `v${appVersionValue}`;
  } catch (e) {
    window.loggerAPI?.warn(`Failed to get version: ${e}`);
  }

  registerIpcListeners();

  await render(window.dateAPI.weekKey(currentWeek));

  isOnline = await window.networkAPI?.isOnline?.();
  if (!isOnline) {
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();
    if (hasCookies) {
      setTimeout(() => {
        createToast(i18n.t("offlineWarning"), { id: offlineToastId, duration: 0, clickable: true, type: "warning" });
      }, 1000);
    }
  }

  window.addEventListener("online", async () => {
    window.loggerAPI?.info("[networkMonitor] online");
    isOnline = true;
    hideToast(offlineToastId);
    createToast(i18n.t("onlineRestored"), { id: "online-restored", duration: 3000, type: "success" });
  });

  window.addEventListener("offline", async () => {
    window.loggerAPI?.info("[networkMonitor] offline");
    isOnline = false;
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();
    if (hasCookies) {
      createToast(i18n.t("offlineWarning"), { id: offlineToastId, duration: 0, clickable: true, type: "warning" });
    }
  });
});

let updateState = {
  currentVersion: '',
  newVersion: '',
  hasPendingUpdate: false
};

function showUpdateToast(state, data = {}) {
  const toastId = 'update-toast';

  if (state === 'available' || state === 'checking') {
    const existingToasts = document.querySelectorAll('.toast.show');
    if (existingToasts.length > 0) {
      console.log('[Update] Skipping toast, other toasts are visible');
      if (state === 'available') {
        updateState.hasPendingUpdate = true;
        updateState.newVersion = data.newVersion;
      }
      return;
    }
  }

  if (state === 'available') {
    updateState.hasPendingUpdate = false;
  }

  let message = '';
  let type = 'info';
  let duration = 3000;
  let clickable = false;

  if (state === 'checking') {
    message = i18n.t('updateChecking');
    type = 'info';
    duration = 0;
  } else if (state === 'available') {
    message = i18n.t('updateAvailableMessage').replace('{version}', data.newVersion || updateState.newVersion);
    type = 'success';
    duration = 6000; // Auto-dismiss after 6 seconds
    clickable = true;
  } else if (state === 'downloading') {
    const percent = Math.round(data.progress || 0);
    message = `${i18n.t('updateDownloading')}: ${percent}%`;
    type = 'info';
    duration = 0;
  } else if (state === 'downloaded') {
    message = i18n.t('updateDownloaded');
    type = 'success';
    duration = 0;
  } else if (state === 'not-available') {
    message = `${i18n.t('updateNotAvailable')} (v${data.version || updateState.currentVersion})`;
    type = 'info';
    duration = 3000;
  } else if (state === 'error') {
    message = i18n.t('updateError');
    type = 'error';
    duration = 4000;
  }

  const toast = createToast(message, {
    id: toastId,
    duration,
    type
  });

  if (clickable && toast) {
    toast.style.cursor = 'pointer';
    toast.onclick = async () => {
      hideToast(toastId);
      showUpdateToast('downloading', { progress: 0 });
      try {
        await window.updateAPI?.install?.();
      } catch (e) {
        showUpdateToast('error');
      }
    };
  }
}

window.addEventListener('focus', () => {
  if (updateState.hasPendingUpdate) {
    setTimeout(() => {
      const existingToasts = document.querySelectorAll('.toast.show');
      if (existingToasts.length === 0) {
        showUpdateToast('available', { newVersion: updateState.newVersion });
      }
    }, 1000);
  }
});



function registerIpcListeners() {
  const justUpdated = sessionStorage.getItem('justUpdated');
  if (justUpdated) {
    sessionStorage.removeItem('justUpdated');
    const version = window.appAPI?.getVersion?.() || '1.5.0';
    setTimeout(() => {
      createToast(i18n.t('updateSuccess').replace('{version}', version), {
        id: 'update-success',
        duration: 5000,
        type: 'success'
      });
    }, 2000);
  }
  if (window.statusAPI?.onStatus) {
    window.statusAPI.onStatus((msg) => setStatus(msg));
  }
  if (window.scheduleAPI?.onReload) {
    window.scheduleAPI.onReload(async () => {
      window.loggerAPI?.debug("scheduleAPI.onReload triggered");

      hideToast("refresh-reminder-toast");

      await render(window.dateAPI.weekKey(currentWeek));

      if (Math.random() < 0.1) {
        const existingToasts = document.querySelectorAll('.toast.show');
        if (existingToasts.length === 0) {
          setTimeout(() => {
            createToast(i18n.t("refreshReminder"), {
              id: "refresh-reminder-toast",
              duration: 6000,
              type: "info"
            });
          }, 2000);
        }
      }
    });
  }
  if (window.widgetAPI?.onLogin) {
    window.widgetAPI.onLogin(async () => {
      window.loggerAPI?.debug("onLogin event received, re-rendering schedule");
      loadSchedule(0);
      showToast(i18n.t("loginSuccess"));
    });
  }
  if (window.widgetAPI?.onLoginRequired) {
    window.widgetAPI.onLoginRequired(() => {
      window.loggerAPI?.debug("onLoginRequired event received");
      showToast(i18n.t("sessionExpired"), "login-required-toast");
      render(window.dateAPI.weekKey(currentWeek));
    });
  }


  window.updateAPI?.onUpdateToast?.((msg) => {
    const versionMatch = msg.match(/v([\d.]+)/);
    if (versionMatch) {
      updateState.newVersion = versionMatch[1];
      updateState.currentVersion = window.appAPI?.getVersion?.() || '1.5.0';
      showUpdateToast('available', { newVersion: versionMatch[1] });
    }
  });

  if (window.updateAPI?.onChecking) {
    window.updateAPI.onChecking(() => {
      showUpdateToast('checking');
    });
  }

  if (window.updateAPI?.onNotAvailable) {
    window.updateAPI.onNotAvailable(() => {
      showUpdateToast('not-available');
    });
  }

  window.updateAPI?.onProgress?.((p) => {
    updateState.progress = p?.percent ?? 0;
    updateState.downloaded = p?.transferred ?? 0;
    updateState.total = p?.total ?? 0;

    showUpdateToast('downloading', { progress: p.percent });
  });

  window.updateAPI?.onDownloaded?.(() => {
    showUpdateToast('downloaded');
    setTimeout(() => {
      window.updateAPI.confirmInstall();
    }, 3000);
  });

  window.updateAPI?.onError?.((msg) => {
    window.loggerAPI?.error(`[Update] Error: ${msg}`);
    showUpdateToast('error');
  });

  window.addEventListener("languagechange", async () => {
    window.loggerAPI?.debug("language changed, re-rendering");
    await render(window.dateAPI.weekKey(currentWeek));
  });
}

function loadSchedule(offset) {
  return changeWeek(offset);
}

async function render(isoDate) {
  const el = $("#content");
  window.loggerAPI?.debug(`[render] START, isoDate: ${isoDate}`);

  try {
    window.loggerAPI?.debug(`render start, isoDate: ${isoDate}`);
    const payload = await window.scheduleAPI?.load?.(isoDate);
    window.loggerAPI?.debug(`payload loaded: ${payload ? "YES" : "NO"}, data length: ${payload?.data?.length ?? "N/A"}`);
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();
    window.loggerAPI?.debug(`hasCookies: ${hasCookies}`);

    let version = appVersionValue || "dev";
    let state = "first";
    let loginLabel = i18n.t("login");

    if (payload && payload.weekStart) {
      state = "ok";
      currentWeek = new Date(payload.weekStart);
      window.loggerAPI?.debug(`[render] Updated currentWeek to: ${currentWeek.toISOString()}`);
    } else if (hasCookies) {
      state = "expired";
      loginLabel = i18n.t("loginAgain");
    }

    if (!payload && !hasCookies)
      window.loggerAPI?.debug("no data, waiting for login");
    else if (payload) window.loggerAPI?.debug(`schedule loaded successfully, ${payload.data?.length ?? 0} classes`);

    const currentWeekKey = window.dateAPI.weekKey(new Date());
    const thisWeekKey = window.dateAPI.weekKey(isoDate);

    if (currentWeekKey === thisWeekKey && payload) {
      if (preFetchedWeek !== currentWeekKey) {
        preFetchedWeek = currentWeekKey;
        setTimeout(async () => {
          try {
            await window.widgetAPI.fetchWeek(-1);
            await window.widgetAPI.fetchWeek(1);
            window.loggerAPI?.debug("pre-fetched prev/next weeks");
          } catch (e) {
            window.loggerAPI?.warn(`pre-fetch failed: ${e}`);
          }
        }, 100);
      } else {
        window.loggerAPI?.debug("pre-fetch skipped (already done for this week)");
      }
    }

    let metaHtml = "";
    let bodyHtml = "";

    if (!payload) {
      metaHtml = i18n.t("noData");
      bodyHtml = `<div class="empty">${i18n
        .t("noDataDesc")
        .replace("đăng nhập", `<b>${loginLabel}</b>`)}</div>`;
    } else {
      const { updatedAt, data, weekStart } = payload;
      const grouped = byDay(data);
      const firstDay = new Date(weekStart);
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);

      const weekDays = getWeekDays(firstDay, lastDay);
      const locale = i18n.getLang() === "vi" ? "vi-VN" : "en-US";

      metaHtml = `${i18n.t("updated")}: ${new Date(updatedAt).toLocaleString(
        locale
      )}<br/>`;
      metaHtml += `<span class="week-range" style="font-weight:bold;color:white">${i18n.t(
        "week"
      )}: 
  ${firstDay.toLocaleDateString(locale)} > ${lastDay.toLocaleDateString(
        locale
      )}
</span>`;

      bodyHtml = `
    <div class="calendar" id="cal">
      ${weekDays
          .map((d) => {
            const entries = grouped[d] ?? [];
            return `
            <section class="day-col">
              <header class="day-h">
                ${new Date(d).toLocaleDateString(locale, {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
            })}
              </header>
              <div class="day-body">
                ${entries.length > 0
                ? entries
                  .map(
                    (s) => `
                            <article class="card">
                              <div class="subject">${s.subject}</div>
                              <div class="line period">
                                ${i18n.t("period")} ${periodSpan(s.periods)}
                                <span class="sep"> | </span>${periodTime(s.periods)}
                                <span class="sep"> | </span>${s.session}
                                <span class="tag type-${(
                        s.type || ""
                      ).toLowerCase()}">${s.type}</span>
                              </div>
                              <div class="line room">${cleanRoom(
                        s.room || ""
                      )}</div>
                              ${s.teacher
                        ? `<div class="line teacher">${i18n.t(
                          "instructor"
                        )} ${s.teacher}</div>`
                        : ""
                      }
                            </article>
                          `
                  )
                  .join("")
                : `<div class="no-class">${i18n.t("noClass")}</div>`
              }
              </div>
            </section>`;
          })
          .join("")}
    </div>`;
    }

    el.innerHTML = `
  <div class="shell">
    <div class="head">
      <div class="title">
        <img src="assets/uneti.webp" class="logo" alt="logo" />
        <span>${i18n.t(
      "title"
    )} <span class="version-label">v${version}</span></span>
      </div>
      <div class="actions">
        <div class="left-group">
          <button class="lang-btn" data-lang="vi" title="Tiếng Việt">VI</button>
          <button class="lang-btn" data-lang="en" title="English">EN</button>
          <button id="btn-update">${i18n.t("checkUpdate")}</button>
          <button id="btn-login">${loginLabel}</button>
          <button id="btn-refresh">${i18n.t("refresh")}</button>
        </div>
        <div class="right-group">
          <button id="btn-theme" class="theme-btn" title="Toggle theme">
            <i data-lucide="sun" class="icon"></i>
          </button>
          <button id="btn-hide">${i18n.t("minimize")}</button>
          <button id="btn-exit">${i18n.t("exit")}</button>
        </div>
      </div>
    </div>

    <div class="body">
      ${bodyHtml}
    </div>

    <div class="footer-bar">
      <div class="meta">${metaHtml}</div>
      <div class="week-nav">
        <button id="btn-prev-week">${i18n.t("previous")}</button>
        <button id="btn-next-week">${i18n.t("next")}</button>
      </div>
    </div>
  </div>`;

    requestAnimationFrame(() => {
      safeResize();
    });

    const cal = document.getElementById("cal");
    if (cal) {
      cal.addEventListener(
        "wheel",
        (e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            cal.scrollLeft += e.deltaY;
            e.preventDefault();
          }
        },
        { passive: false }
      );
    }

    const btnUpdate = $("#btn-update");
    const btnLogin = $("#btn-login");
    const btnRefresh = $("#btn-refresh");
    const btnHide = $("#btn-hide");
    const btnExit = $("#btn-exit");
    const btnPrevWeek = $("#btn-prev-week");
    const btnNextWeek = $("#btn-next-week");
    const btnTheme = $("#btn-theme");

    window.loggerAPI?.debug(`[Buttons] btnUpdate exists: ${!!btnUpdate}, btnRefresh exists: ${!!btnRefresh}`);

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === i18n.getLang());
      btn.onclick = () => {
        i18n.setLanguage(btn.dataset.lang);
      };
    });

    const updateThemeIcon = () => {
      if (!btnTheme) return;
      const theme = themeManager.getTheme();
      const iconEl = btnTheme.querySelector("[data-lucide]");
      if (!iconEl) return;
      const icons = { light: "sun", dark: "moon", system: "monitor" };
      iconEl.setAttribute("data-lucide", icons[theme] || "sun");
      if (window.lucide) window.lucide.createIcons();
    };
    if (btnTheme) {
      updateThemeIcon();
      btnTheme.onclick = () => {
        themeManager.cycleTheme();
        updateThemeIcon();
      };
    }

    if (btnUpdate) {
      window.loggerAPI?.debug("[btnUpdate] Attaching event handler");
      btnUpdate.onclick = async () => {
        window.loggerAPI?.debug("[btnUpdate] Clicked");
        btnUpdate.disabled = true;

        showUpdateToast('checking');

        try {
          const res = await window.updateAPI?.check?.();
          if (res?.update) {
            updateState.newVersion = res.version;
            updateState.currentVersion = appVersionValue || '1.5.0';
            showUpdateToast('available', { newVersion: res.version });
          } else if (res?.error) {
            showUpdateToast('error');
          } else {
            showUpdateToast('not-available', { version: res.version });
          }
        } catch (e) {
          showUpdateToast('error');
        } finally {
          btnUpdate.disabled = false;
          window.loggerAPI?.debug("[btnUpdate] Button re-enabled");
        }
      };
    }
    if (btnLogin) btnLogin.onclick = () => window.widgetAPI.login();
    if (btnRefresh) btnRefresh.onclick = async () => {
      btnRefresh.disabled = true;
      createToast(i18n.t("fetchingWeek"), { id: "refresh-loading", duration: 0, type: "info" });
      try {
        await window.widgetAPI.refresh();
        hideToast("refresh-loading");
        createToast(i18n.t("fetchSuccess"), { id: "refresh-success", duration: 2500, type: "success" });
      } catch (e) {
        hideToast("refresh-loading");
        createToast(i18n.t("fetchError"), { id: "refresh-error", duration: 3000, type: "error" });
      } finally {
        btnRefresh.disabled = false;
      }
    };
    if (btnHide) btnHide.onclick = () => window.widgetAPI.hide();
    if (btnExit) btnExit.onclick = () => window.widgetAPI.quit();
    if (btnPrevWeek) btnPrevWeek.onclick = async () => {
      window.loggerAPI?.debug("[btnPrevWeek] Clicked, disabling button");
      btnPrevWeek.disabled = true;
      try {
        await changeWeek(-1);
      } finally {
        btnPrevWeek.disabled = false;
        window.loggerAPI?.debug("[btnPrevWeek] Re-enabled button");
      }
    };
    if (btnNextWeek) btnNextWeek.onclick = async () => {
      window.loggerAPI?.debug("[btnNextWeek] Clicked, disabling button");
      btnNextWeek.disabled = true;
      try {
        await changeWeek(1);
      } finally {
        btnNextWeek.disabled = false;
        window.loggerAPI?.debug("[btnNextWeek] Re-enabled button");
      }
    };

    if (state === "ok") {
      if (btnLogin) btnLogin.style.display = "none";
    } else {
      if (btnRefresh) btnRefresh.style.display = "none";
    }

    if (window.lucide) window.lucide.createIcons();

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.style.display = "none";
    const overlay = document.getElementById("loading-overlay");
    if (overlay && state !== "first") {
      setTimeout(() => {
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.style.display = "none";
          safeResize();
        }, 300);
      }, 500);
    } else if (overlay && state === "first" && !payload && !hasCookies) {
      overlay.style.display = "none";
    }
  } catch (e) {
    el.innerHTML = `<div class="empty">${i18n.t("renderError")} ${e?.message ?? e}</div>`;
  }
}


let weekChangeTimeout = null;
let isChangingWeek = false;

async function changeWeek(offset) {
  if (isChangingWeek) {
    window.loggerAPI?.debug(`[changeWeek] Already changing, ignoring spam click`);
    return;
  }

  if (weekChangeTimeout) {
    window.loggerAPI?.debug(`[changeWeek] Debouncing, ignoring rapid click`);
    return;
  }

  isChangingWeek = true;

  const toastId = "week-toast";

  window.loggerAPI?.debug(`[changeWeek] START offset=${offset}, currentWeek=${currentWeek.toISOString()}`);

  try {
    const calendarEl = document.getElementById("cal");
    if (calendarEl) {
      calendarEl.outerHTML = createSkeletonHTML();
      window.loggerAPI?.debug(`[changeWeek] Skeleton UI injected`);
    }

    const targetWeek = new Date(currentWeek);
    targetWeek.setDate(targetWeek.getDate() + (offset * 7));
    const cacheKey = window.dateAPI.weekKey(targetWeek);

    if (!isOnline) {
      window.loggerAPI?.warn(`[changeWeek] Offline mode, trying cache for key: ${cacheKey}`);
      const cachedData = await window.scheduleAPI?.load?.(cacheKey);

      if (cachedData && cachedData.weekStart) {
        window.loggerAPI?.info(`[changeWeek] Cache HIT, showing cached data`);
        currentWeek = new Date(cachedData.weekStart);
        await render(window.dateAPI.weekKey(currentWeek));
        showToast(i18n.t("offlineMode"), toastId, "warning");
      } else {
        window.loggerAPI?.warn(`[changeWeek] Cache MISS, no data available`);
        showToast(i18n.t("noDataForWeek"), toastId, "error");
      }
      return;
    }

    showToast(i18n.t("fetchingWeek"), toastId, "info");
    window.loggerAPI?.debug(`[changeWeek] Calling fetchWeek with offset=${offset}`);

    const payload = await window.widgetAPI.fetchWeek(offset, currentWeek.toISOString());
    window.loggerAPI?.debug(`[changeWeek] fetchWeek returned:`, payload ? `weekStart=${payload.weekStart}, data.length=${payload.data?.length}` : "null");

    if (!payload || !payload.weekStart) {
      const targetWeek = new Date(currentWeek);
      targetWeek.setDate(targetWeek.getDate() + (offset * 7));
      const cacheKey = window.dateAPI.weekKey(targetWeek);
      window.loggerAPI?.debug(`[changeWeek] Cache lookup for key: ${cacheKey}`);
      const cachedData = await window.scheduleAPI?.load?.(cacheKey);

      if (cachedData && cachedData.weekStart) {
        window.loggerAPI?.info(`[changeWeek] Cache HIT, showing cached data`);
        currentWeek = new Date(cachedData.weekStart);
        await render(window.dateAPI.weekKey(currentWeek));
        showToast(i18n.t("offlineMode"), toastId, "warning");
      } else {
        window.loggerAPI?.warn(`[changeWeek] Cache MISS, no data available`);
        showToast(i18n.t("noDataForWeek"), toastId, "error");
      }
      return;
    }

    window.loggerAPI?.info(`[changeWeek] Network fetch SUCCESS, rendering new week`);
    currentWeek = new Date(payload.weekStart);
    await render(window.dateAPI.weekKey(currentWeek));
    createToast(i18n.t("fetchSuccess"), { id: toastId, duration: 2500, type: "success" });

  } catch (err) {
    window.loggerAPI?.error(`[changeWeek] ERROR: ${err?.message}`, err);

    if (err?.message?.includes("Cookie expired") || err?.message?.includes("Session")) {
      window.loggerAPI?.warn(`[changeWeek] Session expired, triggering login`);
      showToast(i18n.t("sessionExpired"), toastId, "error");
      throw err;
    }

    window.loggerAPI?.debug(`[changeWeek] Network error, attempting cache fallback`);
    try {
      const targetWeek = new Date(currentWeek);
      targetWeek.setDate(targetWeek.getDate() + (offset * 7));
      const cacheKey = window.dateAPI.weekKey(targetWeek);
      window.loggerAPI?.debug(`[changeWeek] Cache lookup for key: ${cacheKey}`);
      const cachedData = await window.scheduleAPI?.load?.(cacheKey);

      if (cachedData && cachedData.weekStart) {
        window.loggerAPI?.info(`[changeWeek] Cache fallback SUCCESS`);
        currentWeek = new Date(cachedData.weekStart);
        await render(window.dateAPI.weekKey(currentWeek));
        showToast(i18n.t("offlineMode"), toastId, "warning");
      } else {
        window.loggerAPI?.warn(`[changeWeek] Cache fallback FAILED`);
        showToast(i18n.t("fetchError") + ": " + (err?.message || "Unknown"), toastId, "error");
      }
    } catch (cacheErr) {
      window.loggerAPI?.error(`[changeWeek] Cache fallback exception:`, cacheErr);
      showToast(i18n.t("fetchError") + ": " + (err?.message || "Unknown"), toastId, "error");
    }
  } finally {
    isChangingWeek = false;
    window.loggerAPI?.debug(`[changeWeek] END, isChangingWeek reset`);
  }
}
