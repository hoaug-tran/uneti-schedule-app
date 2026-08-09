import { startOfWeek, periodsTime } from "../app/utils/date.js";
import { i18nInstance as i18n } from "../app/utils/i18n.js";
import { themeManager } from "../app/utils/theme.js";

let appVersionValue = null;
let currentWeek = startOfWeek(new Date());
let preFetchedWeek = null;
let justLoggedIn = false;

const $ = (s, r = document) => r.querySelector(s);

if (typeof window !== "undefined" && window.statusAPI) {
  window.statusAPI.onToastWarning?.((i18nKey) => {
    const message = i18n.t(i18nKey);
    createToast(message, { id: "stale-data-warning", duration: 0, type: "warning", priority: true, clickable: true });
  });

  window.statusAPI.onToastStaleLogout?.((i18nKey) => {
    const message = i18n.t(i18nKey);
    createToast(message, { id: "stale-data-logout", duration: 8000, type: "warning", priority: true });
  });
}

function setStatus(msg) {
  const el = $("#status");
  if (el) el.innerHTML = msg ?? "";
}




const _toastQueue = [];
let _toastActive = false;
let _toastCurrentEl = null;
let _toastGapTimer = null;

function _processQueue() {
  if (_toastActive || _toastQueue.length === 0) return;

  const item = _toastQueue.shift();
  _toastActive = true;

  const existing = item.id ? document.getElementById(item.id) : null;
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${item.type}`;
  if (item.id) toast.id = item.id;
  toast.innerHTML = item.html;

  if (item.clickable) {
    toast.style.cursor = "pointer";
    if (item.onClick) toast.onclick = item.onClick;
  }

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  _toastCurrentEl = toast;

  const dismiss = () => {
    if (!toast.parentNode) {
      _toastActive = false;
      _toastCurrentEl = null;
      _scheduleNext();
      return;
    }
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
      _toastActive = false;
      _toastCurrentEl = null;
      _scheduleNext();
    }, 250);
  };

  if (item.duration > 0) {
    setTimeout(dismiss, item.duration);
  }
  toast._dismiss = dismiss;
}

function _scheduleNext() {
  if (_toastQueue.length === 0) return;
  clearTimeout(_toastGapTimer);
  _toastGapTimer = setTimeout(_processQueue, 100);
}

function createToast(html, { id, duration = 3000, clickable = false, type = "info", priority = false, onClick } = {}) {
  if (id !== "refresh-reminder-toast") {
    _dismissById("refresh-reminder-toast");
  }

  if (priority && _toastCurrentEl) {
    _toastCurrentEl._dismiss?.();
    clearTimeout(_toastGapTimer);
  }

  _toastQueue.push({ html, id, duration, clickable, type, onClick });

  if (!_toastActive) {
    _processQueue();
  }

  return null;
}

function hideToast(id) {
  _dismissById(id);
  const idx = _toastQueue.findIndex(t => t.id === id);
  if (idx !== -1) _toastQueue.splice(idx, 1);
}

function _dismissById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el._dismiss) {
    el._dismiss();
  } else {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
    if (_toastCurrentEl === el) {
      _toastActive = false;
      _toastCurrentEl = null;
      _scheduleNext();
    }
  }
}

function showToast(msg, id = "default-toast", type = "info") {
  createToast(msg, { id, type, priority: true });
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

  window.loggerAPI?.info("[DOMContentLoaded] Initialization started");
  window.loggerAPI?.debug("[DOMContentLoaded] Calling render...");
  try {
    await render(window.dateAPI.weekKey(currentWeek));
    window.loggerAPI?.debug("[DOMContentLoaded] Render completed");
  } catch (e) {
    window.loggerAPI?.error(`[DOMContentLoaded] Render failed: ${e?.message}`, e);
  }

  isOnline = await window.networkAPI?.isOnline?.();
  if (!isOnline) {
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();
    if (hasCookies) {
      setTimeout(() => {
        createToast(i18n.t("offlineWarning"), { id: offlineToastId, duration: 0, clickable: true, type: "warning", priority: true });
      }, 1000);
    }
  }

  window.addEventListener("online", async () => {
    window.loggerAPI?.info("[networkMonitor] online");
    isOnline = true;
    hideToast(offlineToastId);
    createToast(i18n.t("onlineRestored"), { id: "online-restored", duration: 3000, type: "success", priority: true });
  });

  window.addEventListener("offline", async () => {
    window.loggerAPI?.info("[networkMonitor] offline");
    isOnline = false;
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();
    if (hasCookies) {
      createToast(i18n.t("offlineWarning"), { id: offlineToastId, duration: 0, clickable: true, type: "warning", priority: true });
    }
  });
});

let updateState = {
  currentVersion: '',
  newVersion: '',
  hasPendingUpdate: false
};

let _dlToast = null;

function _getOrCreateDlToast() {
  if (_dlToast && _dlToast.isConnected) return _dlToast;
  const el = document.createElement('div');
  el.id = 'update-toast';
  el.className = 'toast toast-info';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  _dlToast = el;
  return el;
}

function _removeDlToast() {
  if (_dlToast && _dlToast.isConnected) {
    _dlToast.classList.remove('show');
    const ref = _dlToast;
    setTimeout(() => ref.remove(), 250);
  }
  _dlToast = null;
}

function showUpdateToast(state, data = {}) {
  const toastId = 'update-toast';

  if (state === 'available') updateState.hasPendingUpdate = false;

  if (state === 'downloading') {
    const pct   = Math.round(data.progress || 0);
    const dlMB  = ((data.transferred || 0) / 1024 / 1024).toFixed(1);
    const totMB = ((data.total || 0) / 1024 / 1024).toFixed(1);
    const spd   = ((data.bytesPerSecond || 0) / 1024 / 1024).toFixed(2);
    const el    = _getOrCreateDlToast();
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;min-width:200px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>⬇ ${i18n.t('updateDownloading')}</span>
          <b>${pct}%</b>
        </div>
        <div style="background:rgba(255,255,255,.25);border-radius:4px;height:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:#fff;border-radius:4px;transition:width .4s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;opacity:.85">
          <span>${dlMB} / ${totMB} MB</span>
          <span>${spd} MB/s</span>
        </div>
      </div>`;
    return;
  }

  if (state === 'downloaded') {
    const msg = data?.countdown || i18n.t('updateDownloaded');
    if (_dlToast && _dlToast.isConnected) {
      _dlToast.className = 'toast toast-success show';
      _dlToast.innerHTML = `<b>${msg}</b>`;
      return;
    }
    createToast(`<b>${msg}</b>`, { id: toastId, duration: 0, type: 'success', priority: true });
    return;
  }

  if (state === 'error') {
    _removeDlToast();
    hideToast(toastId);
    createToast(i18n.t('updateError'), { id: toastId, duration: 4000, type: 'error', priority: true });
    return;
  }

  if (state === 'checking') {
    const existing = document.getElementById(toastId);
    if (existing) { existing.innerHTML = i18n.t('updateChecking'); return; }
    createToast(i18n.t('updateChecking'), { id: toastId, duration: 0, type: 'info', priority: true });
    return;
  }

  if (state === 'available') {
    const msg = i18n.t('updateAvailableMessage').replace('{version}', data.newVersion || updateState.newVersion);
    createToast(msg, {
      id: toastId, duration: 8000, type: 'success', clickable: true,
      onClick: async () => {
        hideToast(toastId);
        showUpdateToast('downloading', { progress: 0 });
        try { await window.updateAPI?.install?.(); }
        catch (e) { showUpdateToast('error'); }
      }
    });
    return;
  }

  if (state === 'not-available') {
    const msg = `${i18n.t('updateNotAvailable')} (v${data.version || updateState.currentVersion})`;
    createToast(msg, { id: toastId, duration: 3000, type: 'info' });
  }
}


window.addEventListener('focus', () => {
  if (updateState.hasPendingUpdate) {
    setTimeout(() => {
      showUpdateToast('available', { newVersion: updateState.newVersion });
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
      justLoggedIn = true;
      setTimeout(() => { justLoggedIn = false; }, 10000);
      showToast(i18n.t("loginSuccess"), "login-success-toast", "success");
      loadSchedule(0);
    });
  }
  if (window.widgetAPI?.onLoginRequired) {
    window.widgetAPI.onLoginRequired(() => {
      window.loggerAPI?.debug("onLoginRequired event received");
      showToast(i18n.t("sessionExpired"), "login-required-toast", "error");
      render(window.dateAPI.weekKey(currentWeek));
      window.widgetAPI.login();
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

    showUpdateToast('downloading', {
      progress: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond
    });
  });

  window.updateAPI?.onDownloaded?.(() => {
    let countdown = 5;
    const updateCountdown = () => {
      const message = `${i18n.t('updateDownloaded')} (${countdown}s)`;
      showUpdateToast('downloaded', { countdown: message });
      countdown--;
      if (countdown >= 0) {
        setTimeout(updateCountdown, 1000);
      }
    };
    updateCountdown();

    setTimeout(() => {
      window.updateAPI.confirmInstall();
    }, 5000);
  });

  window.updateAPI?.onError?.((msg) => {
    window.loggerAPI?.error(`[Update] Error: ${msg}`);
    showUpdateToast('error');
  });

  window.addEventListener("languagechange", async () => {
    window.loggerAPI?.debug("language changed, re-rendering");
    const btnGpa = document.getElementById("btn-gpa");
    const wasGpa = btnGpa && btnGpa.dataset.view === "gpa";

    await render(window.dateAPI.weekKey(currentWeek));

    if (wasGpa) {
      const newBtnGpa = document.getElementById("btn-gpa");
      if (newBtnGpa) {
        newBtnGpa.click();
      }
    }
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
      justLoggedIn = false;
      loginLabel = i18n.t("logout");
      currentWeek = new Date(payload.weekStart);
      window.loggerAPI?.debug(`[render] Updated currentWeek to: ${currentWeek.toISOString()}`);
    } else if (hasCookies) {
      if (justLoggedIn) {
        state = "loading";
      } else {
        state = "expired";
        loginLabel = i18n.t("loginAgain");
      }
    }

    if (!payload && !hasCookies)
      window.loggerAPI?.debug("no data, waiting for login");
    else if (payload) {
      window.loggerAPI?.debug(`schedule loaded successfully, ${payload.data?.length ?? 0} classes`);
    }

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
      if (state === "loading") {
        metaHtml = i18n.t("noData");
        bodyHtml = createSkeletonHTML();
      } else {
        metaHtml = i18n.t("noData");
        bodyHtml = `<div class="empty">${i18n
          .t("noDataDesc")
          .replace("đăng nhập", `<b>${loginLabel}</b>`)}</div>`;
      }
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
          <button id="btn-gpa">GPA</button>
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
    const btnGpa = $("#btn-gpa");
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

          hideToast('update-toast');

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
          hideToast('update-toast');
          showUpdateToast('error');
        } finally {
          btnUpdate.disabled = false;
          window.loggerAPI?.debug("[btnUpdate] Button re-enabled");
        }
      };
    }
    if (btnGpa) {
      btnGpa.onclick = async () => {
        const body = document.querySelector(".body");

        const footerBar = document.querySelector(".footer-bar");

        if (btnGpa.dataset.view === "gpa") {
          btnGpa.dataset.view = "schedule";
          btnGpa.textContent = "GPA";
          btnGpa.classList.remove("active");
          if (footerBar) footerBar.style.display = "";
          await render(window.dateAPI.weekKey(currentWeek));
          return;
        }

        btnGpa.dataset.view = "gpa";
        btnGpa.textContent = i18n.t("scheduleTab");
        btnGpa.classList.add("active");
        if (footerBar) footerBar.style.display = "none";

        body.innerHTML = `
          <div class="gpa-panel">
            <div class="gpa-head">
              <div>
                <h3 class="gpa-head-title">${i18n.t("gpaTitle")}</h3>
                <p class="gpa-head-sub">${i18n.t("gpaLoading")}</p>
              </div>
              <select disabled><option>${i18n.t("gpaTargetGood")}</option></select>
            </div>
            ${Array.from({ length: 4 })
              .map(
                () => `
              <section class="gpa-semester">
                <div class="gpa-semester-head">
                  <b class="skeleton-line w40"></b>
                  <span class="skeleton-line w30"></span>
                </div>
                <div class="gpa-skeleton-list">
                  ${Array.from({ length: 4 })
                    .map(
                      () => `
                    <div class="gpa-skeleton-row"><span></span><span></span><span></span></div>
                  `
                    )
                    .join("")}
                </div>
              </section>
            `
              )
              .join("")}
          </div>
        `;

        const esc = (v) =>
          String(v ?? "").replace(
            /[&<>"]/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
          );

        const isGpaSubj = (s) => {
          const name = String(s?.subjectName ?? "").toLowerCase().trim();
          if (!name) return false;
          if (name.includes("giáo dục thể chất") || name.includes("gdtc")) return false;
          if (name.includes("giáo dục quốc phòng") || name.includes("gdqp")) return false;
          if (name.includes("điểm test") || name.includes("toeic")) return false;
          return true;
        };

        const calcSemGpa = (items, semSummary) => {
          if (semSummary?.semGpa4 != null) {
            const gpaItems = items.filter(isGpaSubj);
            const credits = gpaItems.reduce((sum, s) => sum + (Number(s.credits) || 0), 0);
            return { gpa: semSummary.semGpa4, credits: semSummary.accumulatedCredits ?? credits };
          }
          const gpaItems = items.filter((s) => isGpaSubj(s) && !s.isPending && s.gradePoint !== null);
          const credits = gpaItems.reduce((sum, s) => sum + (Number(s.credits) || 0), 0);
          if (!credits) return { gpa: 0, credits: 0 };
          const weighted = gpaItems.reduce((sum, s) => sum + (Number(s.gradePoint) || 0) * (Number(s.credits) || 0), 0);
          return { gpa: weighted / credits, credits };
        };

        const getGradeClass = (letter) => {
          const l = String(letter || "").trim().toUpperCase();
          if (l.startsWith("A")) return "grade-a";
          if (l.startsWith("B")) return "grade-b";
          if (l.startsWith("C")) return "grade-c";
          if (l.startsWith("D") || l === "F") return "grade-d";
          return "";
        };

        const renderView = async (data, selectedTarget = "good") => {
          const footerBar = document.querySelector(".footer-bar");
          if (footerBar) footerBar.style.display = "none";

          if (!data?.subjects?.length) {
            body.innerHTML = `<div class="gpa-panel"><div class="gpa-head"><div><h3 class="gpa-head-title">${i18n.t("gpaNoDataTitle")}</h3><p class="gpa-head-sub">${i18n.t("gpaNoDataDesc")}</p></div></div></div>`;
            return;
          }

          const plan = await window.academicAPI?.plan?.(selectedTarget);
          const suggestionMap = new Map();
          (plan?.data?.suggestions || []).forEach((x) => {
            if (x.index >= 0) suggestionMap.set(`idx:${x.index}`, x);
            if (x.key) suggestionMap.set(`key:${x.key}`, x);
            if (x.subjectCode) suggestionMap.set(`code:${String(x.subjectCode).trim().toLowerCase()}`, x);
            if (x.subjectName) suggestionMap.set(`name:${String(x.subjectName).trim().toLowerCase()}`, x);
          });

          const groups = data.subjects.reduce((acc, s) => {
            const sem = s.semester || i18n.t("unknownSemester");
            (acc[sem] ||= []).push(s);
            return acc;
          }, {});

          const targetLabels = {
            excellent: i18n.t("gpaTargetExcellent"),
            good: i18n.t("gpaTargetGood"),
            fair: i18n.t("gpaTargetFair"),
          };

          const currentGpa = data?.summary?.cumGpa4 ?? plan?.data?.gpa ?? 0;
          const totalCredits = plan?.data?.credits ?? 0;
          const regCredits = data?.summary?.registeredCredits;
          const accCredits = data?.summary?.accumulatedCredits;

          const unitStr = i18n.t("gpaCreditsUnit");
          let creditLabel = "";
          if (accCredits != null && regCredits != null) {
            creditLabel = `${accCredits}/${regCredits} ${unitStr}`;
          } else {
            creditLabel = `${totalCredits} ${unitStr}`;
          }

          const achieved = plan?.data?.achieved;
          const suggestCount = plan?.data?.suggestions?.length ?? 0;

          let statusMsg = "";
          if (achieved) {
            statusMsg = i18n.t("gpaAchieved").replace("{target}", targetLabels[selectedTarget] || "");
          } else {
            statusMsg = i18n.t("gpaImproveNeeded").replace("{count}", suggestCount);
          }

          const sectionsHtml = Object.entries(groups)
            .map(([semester, subjects]) => {
              const semSummary = data?.semesterSummaries?.[semester];
              const semStats = calcSemGpa(subjects, semSummary);
              const rowsHtml = subjects
                .map((s) => {
                  const idx = data.subjects.indexOf(s);
                  const isGpa = isGpaSubj(s);
                  const isPending = s.isPending || (!s.letter && s.gradePoint === null && s.finalScore === null);
                  const sKey = String(s.subjectCode || s.subjectName || "").trim().toLowerCase();
                  const sCode = String(s.subjectCode || "").trim().toLowerCase();
                  const sName = String(s.subjectName || "").trim().toLowerCase();

                  const sug = isGpa && !isPending ? (
                    suggestionMap.get(`idx:${idx}`) ||
                    suggestionMap.get(`key:${sKey}`) ||
                    (sCode ? suggestionMap.get(`code:${sCode}`) : null) ||
                    (sName ? suggestionMap.get(`name:${sName}`) : null)
                  ) : null;

                  const gradeCls = getGradeClass(s.letter);

                  let suggestCell = "";
                  if (isPending) {
                    suggestCell = `<span class="gpa-tag-pending">${i18n.t("gpaTagPending")}</span>`;
                  } else if (!isGpa) {
                    suggestCell = `<span class="gpa-tag-nogpa">${i18n.t("gpaTagNoGpa")}</span>`;
                  } else if (sug) {
                    suggestCell = `<span class="gpa-need">${i18n.t("gpaTagNeedA")}</span>`;
                  }

                  const letterCell = isPending
                    ? `<span class="gpa-tag-pending">${i18n.t("gpaTagPendingLetter")}</span>`
                    : s.letter
                    ? `<span class="grade-pill ${gradeCls}">${esc(s.letter)}</span>`
                    : `-`;

                  return `
                    <tr>
                      <td class="gpa-col-name">${esc(s.subjectName)}</td>
                      <td class="gpa-col-tc gpa-cell-center">${s.credits ?? "-"}</td>
                      <td class="gpa-col-letter gpa-cell-center">${letterCell}</td>
                      <td class="gpa-col-score gpa-cell-center">${s.finalScore != null ? s.finalScore.toFixed(1) : "-"}</td>
                      <td class="gpa-col-suggest gpa-cell-center">${suggestCell}</td>
                    </tr>
                  `;
                })
                .join("");

              const semSummaryText = i18n
                .t("gpaSemSummary")
                .replace("{gpa}", semStats.gpa.toFixed(2))
                .replace("{credits}", semStats.credits);

              return `
                <section class="gpa-semester">
                  <div class="gpa-semester-head">
                    <b>${esc(semester)}</b>
                    <span>${semSummaryText}</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th class="gpa-col-name">${i18n.t("gpaColSubject")}</th>
                        <th class="gpa-col-tc gpa-cell-center">${i18n.t("gpaColCredits")}</th>
                        <th class="gpa-col-letter gpa-cell-center">${i18n.t("gpaColLetter")}</th>
                        <th class="gpa-col-score gpa-cell-center">${i18n.t("gpaColScore")}</th>
                        <th class="gpa-col-suggest gpa-cell-center">${i18n.t("gpaColSuggest")}</th>
                      </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                  </table>
                </section>
              `;
            })
            .join("");

          const titleText = i18n
            .t("gpaCurrentTitle")
            .replace("{gpa}", currentGpa.toFixed(2))
            .replace("{credits}", creditLabel);

          body.innerHTML = `
            <div class="gpa-panel">
              <div class="gpa-head">
                <div>
                  <h3 class="gpa-head-title">${titleText}</h3>
                  <p class="gpa-head-sub">${statusMsg}</p>
                </div>
                <select id="gpa-target">
                  <option value="excellent" ${selectedTarget === "excellent" ? "selected" : ""}>${i18n.t("gpaTargetExcellent")}</option>
                  <option value="good" ${selectedTarget === "good" ? "selected" : ""}>${i18n.t("gpaTargetGood")}</option>
                  <option value="fair" ${selectedTarget === "fair" ? "selected" : ""}>${i18n.t("gpaTargetFair")}</option>
                </select>
              </div>
              ${sectionsHtml}
            </div>
          `;

          const selectEl = document.getElementById("gpa-target");
          if (selectEl) {
            selectEl.onchange = (e) => renderView(data, e.target.value);
          }
        };

        const loadPromise = window.academicAPI?.load?.();
        const refreshPromise = window.academicAPI?.refresh?.();
        const delayPromise = new Promise((res) => setTimeout(res, 450));

        const [academic, refreshed] = await Promise.all([loadPromise, refreshPromise]);
        await delayPromise;

        const data = refreshed?.data || academic;
        if (!data?.subjects?.length) {
          createToast(i18n.t("noDataDesc"), { id: "gpa-toast", type: "info", priority: true });
          await renderView({ subjects: [] });
          return;
        }

        await renderView(data, "good");
      };
    }

    if (btnLogin) {
      btnLogin.onclick = async () => {
        if (state === "ok") {
          await window.widgetAPI?.logout?.();
        } else {
          await window.widgetAPI?.login?.();
        }
      };
    }

    if (btnRefresh) {
      btnRefresh.onclick = async () => {
        btnRefresh.disabled = true;
        hideToast("refresh-success");
        hideToast("refresh-error");
        createToast(i18n.t("fetchingWeek"), { id: "refresh-loading", duration: 0, type: "info", priority: true });
        try {
          await window.widgetAPI.refresh();
          hideToast("refresh-loading");
          createToast(i18n.t("fetchSuccess"), { id: "refresh-success", duration: 2500, type: "success", priority: true });
        } catch (e) {
          hideToast("refresh-loading");
          createToast(i18n.t("fetchError"), { id: "refresh-error", duration: 3000, type: "error", priority: true });
        } finally {
          btnRefresh.disabled = false;
        }
      };
    }

    if (btnHide) btnHide.onclick = () => window.widgetAPI.hide();
    if (btnExit) btnExit.onclick = () => window.widgetAPI.quit();

    if (btnPrevWeek) {
      btnPrevWeek.onclick = async () => {
        window.loggerAPI?.debug("[btnPrevWeek] Clicked, disabling button");
        btnPrevWeek.disabled = true;
        try {
          await changeWeek(-1);
        } finally {
          btnPrevWeek.disabled = false;
          window.loggerAPI?.debug("[btnPrevWeek] Re-enabled button");
        }
      };
    }

    if (btnNextWeek) {
      btnNextWeek.onclick = async () => {
        window.loggerAPI?.debug("[btnNextWeek] Clicked, disabling button");
        btnNextWeek.disabled = true;
        try {
          await changeWeek(1);
        } finally {
          btnNextWeek.disabled = false;
          window.loggerAPI?.debug("[btnNextWeek] Re-enabled button");
        }
      };
    }

    if (state !== "ok") {
      if (btnRefresh) btnRefresh.style.display = "none";
    }

    if (window.lucide) window.lucide.createIcons();

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.style.display = "none";

    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.display = "none";
      safeResize();
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

    createToast(i18n.t("fetchingWeek"), { id: toastId, duration: 0, type: "info", priority: true });
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
        hideToast(toastId);
        if (!isOnline) {
          createToast(i18n.t("offlineMode"), { id: toastId, type: "warning", priority: true });
        } else {
          createToast(i18n.t("loadFailed"), { id: toastId, type: "error", priority: true });
        }
      } else {
        window.loggerAPI?.warn(`[changeWeek] Cache MISS, no data available`);
        hideToast(toastId);
        createToast(i18n.t("noDataForWeek"), { id: toastId, type: "error", priority: true });
      }
      return;
    }

    window.loggerAPI?.info(`[changeWeek] Network fetch SUCCESS, rendering new week`);
    currentWeek = new Date(payload.weekStart);
    await render(window.dateAPI.weekKey(currentWeek));
    hideToast(toastId);
    createToast(i18n.t("fetchSuccess"), { id: toastId, duration: 2500, type: "success", priority: true });

  } catch (err) {
    window.loggerAPI?.error(`[changeWeek] ERROR: ${err?.message}`, err);

    if (err?.message?.includes("Cookie expired") || err?.message?.includes("Session") || err?.message?.includes("No cookies")) {
      window.loggerAPI?.warn(`[changeWeek] Session expired, triggering login`);
      hideToast(toastId);
      createToast(i18n.t("sessionExpired"), { id: toastId, type: "error", priority: true });
      window.widgetAPI.login();
      return;
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
        hideToast(toastId);
        if (!isOnline) {
          createToast(i18n.t("offlineMode"), { id: toastId, type: "warning", priority: true });
        } else {
          createToast(i18n.t("loadFailed"), { id: toastId, type: "error", priority: true });
        }
      } else {
        window.loggerAPI?.warn(`[changeWeek] Cache fallback FAILED`);
        hideToast(toastId);
        createToast(i18n.t("fetchError") + ": " + (err?.message || "Unknown"), { id: toastId, type: "error", priority: true });
      }
    } catch (cacheErr) {
      window.loggerAPI?.error(`[changeWeek] Cache fallback exception:`, cacheErr);
      hideToast(toastId);
      createToast(i18n.t("fetchError") + ": " + (err?.message || "Unknown"), { id: toastId, type: "error", priority: true });
    }
  } finally {
    isChangingWeek = false;
    window.loggerAPI?.debug(`[changeWeek] END, isChangingWeek reset`);
  }
}
