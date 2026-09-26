import {
  startOfWeek,
  getWeekDays,
  periodTime,
  periodSpan,
  cleanRoom,
} from "./utils/date.js";
import { i18nInstance as i18n } from "./utils/i18n.js";
import { themeManager } from "./utils/theme.js";
import {
  numberOf,
  formatScore,
  courseKeyOf,
  escapeHtml,
  rankOf,
} from "./utils/format.js";
import { LETTER_POINTS } from "./constants.js";
import { gradeOfScore10 } from "./utils/gpa.js";

let appVersionValue = null;
let currentWeek = startOfWeek(new Date());
let preFetchedWeek = null;
let justLoggedIn = false;

const $ = (s, r = document) => r.querySelector(s);

const toastManager = {
  container: null,
  activeTimers: new Map(),

  getContainer() {
    if (!this.container || !this.container.isConnected) {
      let el = document.getElementById("toast-container");
      if (!el) {
        el = document.createElement("div");
        el.id = "toast-container";
        el.className = "toast-container";
        document.body.appendChild(el);
      }
      this.container = el;
    }
    return this.container;
  },

  show(html, { id, duration = 3000, type = "info", clickable = false, onClick } = {}) {
    const container = this.getContainer();
    const toastId = id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let toast = document.getElementById(toastId);

    if (this.activeTimers.has(toastId)) {
      clearTimeout(this.activeTimers.get(toastId));
      this.activeTimers.delete(toastId);
    }

    if (toast && toast.isConnected) {
      toast.className = `toast toast-${type} show`;
      toast.innerHTML = html;
      if (clickable) {
        toast.style.cursor = "pointer";
        toast.onclick = onClick || null;
      } else {
        toast.style.cursor = "default";
        toast.onclick = null;
      }
    } else {
      toast = document.createElement("div");
      toast.id = toastId;
      toast.className = `toast toast-${type}`;
      toast.innerHTML = html;
      if (clickable) {
        toast.style.cursor = "pointer";
        toast.onclick = onClick || null;
      }
      container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("show"));
    }

    if (window.lucide) window.lucide.createIcons();

    if (duration > 0) {
      const timer = setTimeout(() => {
        this.hide(toastId);
      }, duration);
      this.activeTimers.set(toastId, timer);
    }

    return toastId;
  },

  hide(id) {
    if (this.activeTimers.has(id)) {
      clearTimeout(this.activeTimers.get(id));
      this.activeTimers.delete(id);
    }
    const toast = document.getElementById(id);
    if (!toast) return;
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 250);
  },
};

function createToast(html, options = {}) {
  return toastManager.show(html, options);
}

function hideToast(id) {
  toastManager.hide(id);
}

function showToast(msg, id = "default-toast", type = "info") {
  toastManager.show(msg, { id, type });
}

if (typeof window !== "undefined" && window.statusAPI) {
  window.statusAPI.onToastWarning?.((i18nKey) => {
    const message = i18n.t(i18nKey);
    createToast(message, { id: "stale-data-warning", duration: 0, type: "warning", clickable: true });
  });

  window.statusAPI.onToastStaleLogout?.((i18nKey) => {
    const message = i18n.t(i18nKey);
    createToast(message, { id: "stale-data-logout", duration: 8000, type: "warning" });
  });
}

function setStatus(msg) {
  const el = $("#status");
  if (el) el.innerHTML = msg ?? "";
}

function byDay(data) {
  const m = {};
  for (const x of data) (m[x.day] ??= []).push(x);
  return m;
}

function createSkeletonHTML() {
  const today = new Date();
  const weekDays = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    weekDays.push(d);
  }

  return `
    <div class="calendar" id="cal">
      ${weekDays.map(() => `
        <section class="day-col">
          <header class="day-h">
            <div class="skeleton skeleton-line" style="height: 18px; width: 80%; margin: 0 auto;"></div>
          </header>
          <div class="day-body loading">
            <div class="skeleton-block"></div>
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function safeResize() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay && overlay.style.display !== "none") return;

  const content = document.getElementById("content");
  if (!content) return;

  const shell = content.querySelector(".shell");
  if (!shell) return;

  const cal = shell.querySelector(".calendar");
  const gpaPanel = shell.querySelector(".gpa-panel");
  const emptyState = shell.querySelector(".empty-state");

  const head = shell.querySelector(".head");
  const footerBar = shell.querySelector(".footer-bar");
  const headHeight = head ? head.offsetHeight : 0;
  const footerHeight = (footerBar && footerBar.style.display !== "none") ? footerBar.offsetHeight : 0;
  const gap = 12;
  const padding = 16;
  const chromeHeight = headHeight + footerHeight + gap + padding;

  let bodyContentHeight = 400;

  if (gpaPanel) {
    bodyContentHeight = gpaPanel.scrollHeight || 450;
  } else if (cal) {
    const dayBodies = cal.querySelectorAll(".day-body");
    let maxDayHeight = 0;
    dayBodies.forEach(db => {
      const h = db.scrollHeight;
      if (h > maxDayHeight) maxDayHeight = h;
    });
    bodyContentHeight = Math.max(maxDayHeight + 40, 200);
  } else if (emptyState) {
    bodyContentHeight = emptyState.scrollHeight || 300;
  }

  const targetHeight = chromeHeight + bodyContentHeight;
  window.widgetAPI?.resizeHeight?.(targetHeight);
}

let isOnline = true;
let offlineToastId = "offline-warning";

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    isOnline = true;
    window.loggerAPI?.info("Network online");
    hideToast(offlineToastId);
    createToast(i18n.t("onlineRestored"), { id: "online-restored", duration: 3000, type: "success" });
  });

  window.addEventListener("offline", () => {
    isOnline = false;
    window.loggerAPI?.warn("Network offline");
    createToast(i18n.t("offlineWarning"), { id: offlineToastId, duration: 0, clickable: true, type: "warning" });
  });

  if (window.networkAPI && !window.networkAPI.isOnline()) {
    isOnline = false;
    setTimeout(() => {
      createToast(i18n.t("offlineWarning"), { id: offlineToastId, duration: 0, clickable: true, type: "warning" });
    }, 1000);
  }
}

let updateState = {
  currentVersion: "",
  newVersion: "",
  hasPendingUpdate: false,
};

function showUpdateToast(state, data = {}) {
  const toastId = "update-toast";

  if (state === "available") updateState.hasPendingUpdate = false;

  if (state === "downloading") {
    const pct = Math.round(data.progress || 0);
    const dlMB = ((data.transferred || 0) / 1024 / 1024).toFixed(1);
    const totMB = ((data.total || 0) / 1024 / 1024).toFixed(1);
    const spd = ((data.bytesPerSecond || 0) / 1024 / 1024).toFixed(2);
    const html = `
      <div style="display:flex;flex-direction:column;gap:4px;min-width:200px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="display:inline-flex;align-items:center;gap:4px">
            <i data-lucide="download" class="icon-inline"></i>
            ${i18n.t("updateDownloading")}
          </span>
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
    toastManager.show(html, { id: toastId, duration: 0, type: "info" });
    return;
  }

  if (state === "downloaded") {
    const msg = data?.countdown || i18n.t("updateDownloaded");
    toastManager.show(`<b>${msg}</b>`, { id: toastId, duration: 0, type: "success" });
    return;
  }

  if (state === "error") {
    toastManager.show(i18n.t("updateError"), { id: toastId, duration: 4000, type: "error" });
    return;
  }

  if (state === "checking") {
    toastManager.show(i18n.t("updateChecking"), { id: toastId, duration: 0, type: "info" });
    return;
  }

  if (state === "available") {
    const msg = i18n.t("updateAvailableMessage").replace("{version}", data.newVersion || updateState.newVersion);
    toastManager.show(msg, {
      id: toastId,
      duration: 10000,
      type: "success",
      clickable: true,
      onClick: async () => {
        showUpdateToast("downloading", { progress: 0 });
        try {
          await window.updateAPI?.install?.();
        } catch {
          showUpdateToast("error");
        }
      },
    });
    return;
  }

  if (state === "not-available") {
    const msg = `${i18n.t("updateNotAvailable")} (v${data.version || updateState.currentVersion})`;
    toastManager.show(msg, { id: toastId, duration: 3500, type: "info" });
  }
}

window.addEventListener("focus", () => {
  if (updateState.hasPendingUpdate) {
    setTimeout(() => {
      showUpdateToast("available", { newVersion: updateState.newVersion });
    }, 1000);
  }
});

function registerIpcListeners() {
  const justUpdated = sessionStorage.getItem("justUpdated");
  if (justUpdated) {
    sessionStorage.removeItem("justUpdated");
    const version = window.appAPI?.getVersion?.() || "1.9.1";
    setTimeout(() => {
      createToast(i18n.t("updateSuccess").replace("{version}", version), {
        id: "update-success",
        duration: 5000,
        type: "success",
      });
    }, 2000);
  }
  if (window.statusAPI?.onStatus) {
    window.statusAPI.onStatus((msg) => setStatus(msg));
  }
  if (window.scheduleAPI?.onReload) {
    window.scheduleAPI.onReload(async () => {
      window.loggerAPI?.debug("scheduleAPI.onReload triggered");
      await render(window.dateAPI.weekKey(currentWeek));
    });
  }
  if (window.widgetAPI?.onLogin) {
    window.widgetAPI.onLogin(async () => {
      window.loggerAPI?.debug("onLogin event received, re-rendering schedule");
      justLoggedIn = true;
      setTimeout(() => { justLoggedIn = false; }, 10000);
      hideToast("login-required-toast");
      hideToast("stale-data-logout");
      hideToast("stale-data-warning");
      showToast(i18n.t("loginSuccess"), "login-success-toast", "success");
      const btnGpa = document.getElementById("btn-gpa");
      if (btnGpa && btnGpa.dataset.view === "gpa") {
        btnGpa.dataset.view = "schedule";
        btnGpa.click();
      } else {
        await render(window.dateAPI.weekKey(currentWeek));
      }
    });
  }
  if (window.widgetAPI?.onLoginRequired) {
    window.widgetAPI.onLoginRequired(() => {
      window.loggerAPI?.debug("onLoginRequired event received");
      createToast(i18n.t("sessionExpired"), {
        id: "login-required-toast",
        type: "error",
        clickable: true,
        duration: 0,
        onClick: () => window.widgetAPI.login(),
      });
      const btnGpa = document.getElementById("btn-gpa");
      if (btnGpa && btnGpa.dataset.view === "gpa") {
        const body = document.querySelector(".body");
        if (body) {
          body.innerHTML = `
            <div class="empty-state">
              <i data-lucide="graduation-cap" class="empty-icon"></i>
              <div class="empty-title">${i18n.t("gpaNotLoggedInTitle")}</div>
              <div class="empty-desc">${i18n.t("gpaNotLoggedInDesc")}</div>
              <button id="btn-empty-gpa-login" class="empty-btn">${i18n.t("login")}</button>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
          const btnEmptyGpaLogin = document.getElementById("btn-empty-gpa-login");
          if (btnEmptyGpaLogin) {
            btnEmptyGpaLogin.onclick = () => window.widgetAPI?.login?.();
          }
        }
      } else {
        render(window.dateAPI.weekKey(currentWeek));
      }
    });
  }

  window.updateAPI?.onUpdateToast?.((msg) => {
    const versionMatch = msg.match(/v([\d.]+)/);
    if (versionMatch) {
      updateState.newVersion = versionMatch[1];
      updateState.currentVersion = window.appAPI?.getVersion?.() || "1.9.1";
      showUpdateToast("available", { newVersion: versionMatch[1] });
    }
  });

  if (window.updateAPI?.onChecking) {
    window.updateAPI.onChecking(() => {
      showUpdateToast("checking");
    });
  }

  if (window.updateAPI?.onNotAvailable) {
    window.updateAPI.onNotAvailable(() => {
      showUpdateToast("not-available");
    });
  }

  window.updateAPI?.onProgress?.((p) => {
    updateState.progress = p?.percent ?? 0;
    updateState.downloaded = p?.transferred ?? 0;
    updateState.total = p?.total ?? 0;

    showUpdateToast("downloading", {
      progress: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });

  window.updateAPI?.onDownloaded?.(() => {
    let countdown = 5;
    const updateCountdown = () => {
      const message = `${i18n.t("updateDownloaded")} (${countdown}s)`;
      showUpdateToast("downloaded", { countdown: message });
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
    showUpdateToast("error");
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

function getGradeClass(letter) {
  const l = String(letter || "").trim().toUpperCase();
  if (l.startsWith("A")) return "grade-a";
  if (l.startsWith("B")) return "grade-b";
  if (l.startsWith("C")) return "grade-c";
  if (l.startsWith("D") || l === "F") return "grade-d";
  return "";
}

const isGpaSubj = (s) => !s.excludedFromGpa;

const calcSemGpa = (items, semSummary) => {
  if (semSummary?.semGpa4 != null) return { gpa: semSummary.semGpa4, credits: semSummary.accumulatedCredits ?? 0 };
  const gpaItems = items.filter((s) => isGpaSubj(s) && !s.isPending && s.gradePoint !== null);
  const credits = gpaItems.reduce((sum, s) => sum + (Number(s.credits) || 0), 0);
  const weighted = gpaItems.reduce((sum, s) => sum + (Number(s.gradePoint) || 0) * (Number(s.credits) || 0), 0);
  return { gpa: credits ? weighted / credits : 0, credits };
};

async function render(isoDate) {
  const el = $("#content");
  window.loggerAPI?.debug(`[render] START, isoDate: ${isoDate}`);

  try {
    const payload = await window.scheduleAPI?.load?.(isoDate);
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();

    let version = appVersionValue || "1.9.1";
    let state = "first";
    let loginLabel = i18n.t("login");

    if (hasCookies) {
      state = "ok";
      loginLabel = i18n.t("logout");
      hideToast("login-required-toast");
      if (payload?.weekStart) {
        currentWeek = new Date(payload.weekStart);
      }
    } else if (payload?.weekStart) {
      state = "expired";
      loginLabel = i18n.t("loginAgain");
      currentWeek = new Date(payload.weekStart);
    } else {
      state = "first";
      loginLabel = i18n.t("login");
    }

    const currentWeekKey = window.dateAPI.weekKey(new Date());
    const thisWeekKey = window.dateAPI.weekKey(isoDate);

    if (state === "ok" && currentWeekKey === thisWeekKey && payload) {
      if (preFetchedWeek !== currentWeekKey) {
        preFetchedWeek = currentWeekKey;
        setTimeout(async () => {
          try {
            await window.widgetAPI.fetchWeek(-1);
            await window.widgetAPI.fetchWeek(1);
          } catch (e) {
            window.loggerAPI?.warn(`pre-fetch failed: ${e}`);
          }
        }, 100);
      }
    }

    let metaHtml = "";
    let bodyHtml = "";

    if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) {
      if (state === "loading") {
        metaHtml = i18n.t("noData");
        bodyHtml = createSkeletonHTML();
      } else if (state === "ok") {
        metaHtml = i18n.t("noData");
        bodyHtml = `
          <div class="empty-state">
            <i data-lucide="calendar-check-2" class="empty-icon"></i>
            <div class="empty-title">${i18n.t("noClass")}</div>
            <div class="empty-desc">${i18n.t("refreshReminder")}</div>
            <button id="btn-empty-refresh" class="empty-btn">${i18n.t("refresh")}</button>
          </div>
        `;
      } else {
        metaHtml = i18n.t("noData");
        bodyHtml = `
          <div class="empty-state">
            <i data-lucide="calendar-off" class="empty-icon"></i>
            <div class="empty-title">${i18n.t("noData")}</div>
            <div class="empty-desc">${i18n.t("noDataDesc")}</div>
            <button id="btn-empty-login" class="empty-btn">${loginLabel}</button>
          </div>
        `;
      }
    } else {
      const { updatedAt, data, weekStart } = payload;
      const grouped = byDay(data);
      const firstDay = new Date(weekStart);
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);

      const weekDays = getWeekDays(firstDay, lastDay);
      const locale = i18n.getLang() === "vi" ? "vi-VN" : "en-US";

      metaHtml = `${i18n.t("updated")}: ${new Date(updatedAt).toLocaleString(locale)}<br/>`;
      metaHtml += `<span class="week-range" style="font-weight:bold;color:white">${i18n.t("week")}: ${firstDay.toLocaleDateString(locale)} <i data-lucide="arrow-right" class="icon-inline"></i> ${lastDay.toLocaleDateString(locale)}</span>`;

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
                              <div class="subject">${escapeHtml(s.subject)}</div>
                              <div class="line period">
                                ${i18n.t("period")} ${periodSpan(s.periods)}
                                <span class="sep"> | </span>${periodTime(s.periods)}
                                <span class="sep"> | </span>${escapeHtml(s.session)}
                                <span class="tag type-${(s.type || "").toLowerCase()}">${escapeHtml(s.type)}</span>
                              </div>
                              <div class="line room">${escapeHtml(cleanRoom(s.room || ""))}</div>
                              ${s.teacher
                                ? `<div class="line teacher">${i18n.t("instructor")} ${escapeHtml(s.teacher)}</div>`
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
        <span>${i18n.t("title")} <span class="version-label">v${version}</span></span>
      </div>
      <div class="actions">
        <div class="left-group">
          <button id="btn-lang" class="lang-btn" title="Đổi ngôn ngữ (Language)">
            <i data-lucide="globe" class="icon"></i>
            <span>${i18n.getLang().toUpperCase()}</span>
          </button>
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
        <button id="btn-prev-week" class="nav-btn">
          <i data-lucide="chevron-left" class="icon"></i>
          <span>${i18n.t("previous")}</span>
        </button>
        <button id="btn-next-week" class="nav-btn">
          <span>${i18n.t("next")}</span>
          <i data-lucide="chevron-right" class="icon"></i>
        </button>
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
    const btnEmptyLogin = $("#btn-empty-login");
    const btnEmptyRefresh = $("#btn-empty-refresh");

    if (btnEmptyRefresh) {
      btnEmptyRefresh.onclick = async () => {
        btnEmptyRefresh.disabled = true;
        createToast(i18n.t("fetchingWeek"), { id: "refresh-loading", duration: 0, type: "info" });
        try {
          await window.widgetAPI.refresh();
          hideToast("refresh-loading");
          createToast(i18n.t("fetchSuccess"), { id: "refresh-success", duration: 2500, type: "success" });
        } catch {
          hideToast("refresh-loading");
          createToast(i18n.t("fetchError"), { id: "refresh-error", duration: 3000, type: "error" });
        } finally {
          btnEmptyRefresh.disabled = false;
        }
      };
    }

    if (btnEmptyLogin) {
      btnEmptyLogin.onclick = async () => {
        const body = document.querySelector(".body");
        if (body) body.innerHTML = createSkeletonHTML();
        try {
          await window.widgetAPI?.login?.();
        } catch {
          await render(window.dateAPI.weekKey(currentWeek));
        }
      };
    }

    const btnLang = $("#btn-lang");
    if (btnLang) {
      btnLang.onclick = () => {
        const nextLang = i18n.getLang() === "vi" ? "en" : "vi";
        i18n.setLanguage(nextLang);
      };
    }

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
      btnUpdate.onclick = async () => {
        btnUpdate.disabled = true;
        showUpdateToast("checking");

        try {
          const res = await window.updateAPI?.check?.();
          if (res?.update) {
            updateState.newVersion = res.version;
            updateState.currentVersion = appVersionValue || "1.9.1";
            showUpdateToast("available", { newVersion: res.version });
          } else if (res?.error) {
            showUpdateToast("error");
          } else {
            showUpdateToast("not-available", { version: res?.version });
          }
        } catch {
          showUpdateToast("error");
        } finally {
          btnUpdate.disabled = false;
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

        const hasAuthCookies = await window.scheduleAPI?.cookiesExists?.();
        if (!hasAuthCookies) {
          body.innerHTML = `
            <div class="empty-state">
              <i data-lucide="graduation-cap" class="empty-icon"></i>
              <div class="empty-title">${i18n.t("gpaNotLoggedInTitle")}</div>
              <div class="empty-desc">${i18n.t("gpaNotLoggedInDesc")}</div>
              <button id="btn-empty-gpa-login" class="empty-btn">${i18n.t("login")}</button>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
          const btnEmptyGpaLogin = document.getElementById("btn-empty-gpa-login");
          if (btnEmptyGpaLogin) {
            btnEmptyGpaLogin.onclick = () => window.widgetAPI?.login?.();
          }
          return;
        }

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
                  <div class="skeleton skeleton-line" style="height: 14px; width: 30%;"></div>
                </div>
                <div class="gpa-skeleton-list">
                  ${Array.from({ length: 3 })
                    .map(
                      () => `
                    <div class="gpa-skeleton-row">
                      <span class="skeleton skeleton-line w40"></span>
                      <span class="skeleton skeleton-line"></span>
                      <span class="skeleton skeleton-line w30"></span>
                    </div>
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

        const renderView = async (
          data,
          selectedTarget = "good",
          overrides = {},
          customSelectedKeys = [],
          customGradeOverrides = {}
        ) => {
          if (footerBar) footerBar.style.display = "none";
          if (!data?.subjects?.length) {
            body.innerHTML = `<div class="gpa-panel"><div class="gpa-head"><div><h3 class="gpa-head-title">${i18n.t("gpaNoDataTitle")}</h3><p class="gpa-head-sub">${i18n.t("gpaNoDataDesc")}</p></div></div></div>`;
            return;
          }

          const isCustomMode = Array.isArray(customSelectedKeys);
          const plan = isCustomMode
            ? await window.academicAPI?.customPlan?.(selectedTarget, customSelectedKeys, customGradeOverrides)
            : await window.academicAPI?.plan?.(selectedTarget);

          const suggestionMap = new Map((plan?.data?.suggestions || []).map((s) => [s.key, s]));

          const GRADE_BASELINE_SCORES = { "A": 8.5, "B+": 8.0, "B": 7.0 };
          const effectiveOverrides = { ...overrides };

          if (isCustomMode) {
            for (const key of customSelectedKeys) {
              if (effectiveOverrides[key] === undefined || effectiveOverrides[key] === "" || effectiveOverrides[key] === null) {
                const targetGrade = customGradeOverrides[key] || "A";
                effectiveOverrides[key] = GRADE_BASELINE_SCORES[targetGrade] || 8.5;
              }
            }
          } else {
            for (const [key, s] of suggestionMap) {
              if (effectiveOverrides[key] === undefined || effectiveOverrides[key] === "" || effectiveOverrides[key] === null) {
                const targetGrade = s.improveTo || "A";
                effectiveOverrides[key] = GRADE_BASELINE_SCORES[targetGrade] || 8.5;
              }
            }
          }

          const simulation = await window.academicAPI?.simulate?.(effectiveOverrides);
          const projected = simulation?.ok ? simulation.data : null;

          const groups = data.subjects.reduce((acc, s) => {
            const sem = s.semester || i18n.t("unknownSemester");
            (acc[sem] ||= []).push(s);
            return acc;
          }, {});

          const parseSemKey = (name, subjects = []) => {
            const isPendingGroup = subjects.length > 0 && subjects.every((s) => s.isPending || (!s.letter && s.gradePoint === null && s.finalScore === null));
            const isPhu = /hockyphu|kyphu|phu/i.test(name);
            const m = name.match(/(\d+)\s*\(\s*(\d{4})\s*-\s*(\d{4})\s*\)/);
            const mYear = name.match(/\(\s*(\d{4})\s*-\s*(\d{4})\s*\)/);
            const endYear = m ? parseInt(m[3], 10) : mYear ? parseInt(mYear[2], 10) : 0;
            const sem = isPhu ? 3 : m ? parseInt(m[1], 10) : 0;
            return { isPendingGroup, endYear, sem };
          };

          const sortedGroups = Object.entries(groups).sort(([nameA, subsA], [nameB, subsB]) => {
            const pa = parseSemKey(nameA, subsA);
            const pb = parseSemKey(nameB, subsB);
            if (pa.isPendingGroup !== pb.isPendingGroup) return pa.isPendingGroup ? -1 : 1;
            if (pb.endYear !== pa.endYear) return pb.endYear - pa.endYear;
            return pb.sem - pa.sem;
          });

          const targetLabels = {
            excellent: i18n.t("gpaTargetExcellent"),
            good: i18n.t("gpaTargetGood"),
            fair: i18n.t("gpaTargetFair"),
          };

          const currentGpa = data?.summary?.cumGpa4 ?? null;
          const currentGpa10 = data?.summary?.cumGpa10 ?? null;
          const localGpa = plan?.data?.gpa ?? 0;
          const hasActiveProjections = Object.keys(overrides).length > 0 || (Array.isArray(customSelectedKeys) && customSelectedKeys.length > 0);
          const projectedGpa = hasActiveProjections ? (projected?.gpa ?? localGpa) : (currentGpa ?? localGpa);
          const projectedGpa10 = hasActiveProjections ? (projected?.gpa10 ?? null) : (currentGpa10 ?? null);
          const delta4 = currentGpa != null ? projectedGpa - currentGpa : null;
          const delta10 = projectedGpa10 != null && currentGpa10 != null ? projectedGpa10 - currentGpa10 : null;
          const accCredits = data?.summary?.accumulatedCredits ?? plan?.data?.credits ?? 0;
          const baseGpaSubjs = data.subjects.filter((s) => !s.isPending && s.finalScore !== null && !s.excludedFromGpa);
          const baseKeys = new Set(baseGpaSubjs.map((s) => courseKeyOf(s)));

          let additionalCredits = 0;
          const countedKeys = new Set();
          for (const s of data.subjects) {
            if (s.excludedFromGpa) continue;
            const key = courseKeyOf(s);
            if (!key || baseKeys.has(key) || countedKeys.has(key)) continue;
            const ov = overrides[key];
            if (ov !== undefined && ov !== null && ov !== "") {
              const num = numberOf(ov);
              if (num !== null && num >= 4.0) {
                additionalCredits += (Number(s.credits) || 0);
                countedKeys.add(key);
              }
            }
          }
          const projectedAccCredits = accCredits + additionalCredits;

          const rank = data?.summary?.academicRank || rankOf(currentGpa || localGpa) || "";
          const projectedRank = rankOf(projectedGpa);
          const rankOrder = { "Xuất sắc": 5, "Giỏi": 4, "Khá": 3, "Trung bình": 2, "Yếu": 1 };

          let deltaRankHtml = `<span class="gpa-delta-eq"><i data-lucide="minus" class="icon-inline"></i></span>`;
          if (projectedRank && rank && projectedRank !== rank) {
            const isUp = (rankOrder[projectedRank] || 0) > (rankOrder[rank] || 0);
            deltaRankHtml = isUp
              ? `<span class="gpa-delta-up"><i data-lucide="trending-up" class="icon-inline"></i> ${escapeHtml(projectedRank)}</span>`
              : `<span class="gpa-delta-down"><i data-lucide="trending-down" class="icon-inline"></i> ${escapeHtml(projectedRank)}</span>`;
          }

          const deltaSign = (v) => {
            if (v === null) return `<span class="gpa-delta-eq"><i data-lucide="minus" class="icon-inline"></i></span>`;
            const rounded = Number(v.toFixed(2));
            if (rounded > 0) return `<span class="gpa-delta-up">+${rounded.toFixed(2)}</span>`;
            if (rounded < 0) return `<span class="gpa-delta-down">${rounded.toFixed(2)}</span>`;
            return `<span class="gpa-delta-eq"><i data-lucide="minus" class="icon-inline"></i></span>`;
          };

          let planMsg = "";
          if (plan?.data?.achieved) {
            planMsg = `<span class="gpa-status-ok">${i18n.t("gpaPlanAchieved").replace("{target}", targetLabels[selectedTarget] || "")}</span>`;
          } else if (isCustomMode) {
            const selectedCredits = (plan?.data?.suggestions || []).reduce((sum, s) => sum + (Number(s.credit) || 0), 0);
            if (plan?.data?.possible) {
              planMsg = `<span class="gpa-status-ok">${i18n.t("gpaCustomSelected").replace("{count}", customSelectedKeys.length).replace("{credits}", selectedCredits)} • ${i18n.t("gpaCustomTargetAchieved").replace("{gpa}", (plan.data.projectedGpa || 0).toFixed(2))}</span>`;
            } else if (customSelectedKeys.length === 0) {
              planMsg = `<span class="gpa-status-warn">${i18n.t("gpaPlanImprove")} tối thiểu <b>${plan?.data?.additionalCreditsNeeded || 0} TC</b> để đạt ${targetLabels[selectedTarget] || ""}</span>`;
            } else {
              planMsg = `<span class="gpa-status-warn">${i18n.t("gpaCustomSelected").replace("{count}", customSelectedKeys.length).replace("{credits}", selectedCredits)} • ${i18n.t("gpaCustomNeedMore").replace("{credits}", plan?.data?.additionalCreditsNeeded || 0)}</span>`;
            }
          } else if (plan?.data?.possible) {
            const suggestCredits = (plan?.data?.suggestions || []).reduce((sum, s) => sum + (Number(s.credit) || 0), 0);
            planMsg = `${i18n.t("gpaPlanImprove")}: <b>${plan.data.suggestions.length} môn</b> (${suggestCredits} TC)`;
          } else {
            planMsg = `<span class="gpa-status-warn">${i18n.t("gpaPlanImpossible")}</span>`;
          }

          const displayCurrentGpa4 = currentGpa != null ? `<b>${currentGpa.toFixed(2)}</b>` : `<span class="gpa-delta-eq" title="Đăng nhập để cập nhật">${localGpa.toFixed(2)}*</span>`;
          const summaryCard = `<div class="gpa-summary-card">
            <table class="gpa-summary-table">
              <thead><tr><th></th><th>${i18n.t("gpaSummaryActual")}</th><th>${i18n.t("gpaSummaryProjected")}</th><th>${i18n.t("gpaSummaryDelta")}</th></tr></thead>
              <tbody>
                <tr><td>GPA / 4.0</td><td>${displayCurrentGpa4}</td><td><b>${projectedGpa.toFixed(2)}</b></td><td>${deltaSign(delta4)}</td></tr>
                ${currentGpa10 != null ? `<tr><td>GPA / 10</td><td>${currentGpa10.toFixed(2)}</td><td>${projectedGpa10 != null ? projectedGpa10.toFixed(2) : '<i data-lucide="minus" class="icon-inline"></i>'}</td><td>${deltaSign(delta10)}</td></tr>` : ""}
                <tr><td>${i18n.t("gpaSummaryCredits")}</td><td>${accCredits}</td><td><b>${projectedAccCredits}</b></td><td>${additionalCredits > 0 ? `<span class="gpa-delta-up">+${additionalCredits} TC</span>` : `<span class="gpa-delta-eq"><i data-lucide="minus" class="icon-inline"></i></span>`}</td></tr>
                ${rank ? `<tr><td>${i18n.t("gpaSummaryRank")}</td><td>${escapeHtml(rank)}</td><td><b>${escapeHtml(projectedRank)}</b></td><td>${deltaRankHtml}</td></tr>` : ""}
              </tbody>
            </table>
            <div class="gpa-summary-footer">
              <div class="gpa-plan-msg">${planMsg}</div>
              <div class="gpa-summary-actions">
                ${hasActiveProjections
                  ? `<button id="gpa-reset" class="gpa-reset-btn">${i18n.t("gpaResetBtn")}</button>`
                  : (!plan?.data?.achieved
                      ? `<button id="gpa-auto-suggest" class="gpa-suggest-btn"><i data-lucide="sparkles" class="icon-inline"></i> ${i18n.t("gpaAutoSuggestBtn")}</button>`
                      : "")}
                <div class="gpa-target-wrap">
                  <span class="gpa-target-label">${i18n.t("gpaTargetLabel")}:</span>
                  <div class="gpa-custom-select" id="gpa-target-wrap">
                    <button class="gpa-custom-select-btn" id="gpa-target-btn" aria-haspopup="listbox">${targetLabels[selectedTarget] || ""}</button>
                    <ul class="gpa-custom-select-list" id="gpa-target-list" role="listbox">
                      <li data-val="excellent" role="option" ${selectedTarget === "excellent" ? 'class="selected"' : ""}>${i18n.t("gpaTargetExcellent")}</li>
                      <li data-val="good" role="option" ${selectedTarget === "good" ? 'class="selected"' : ""}>${i18n.t("gpaTargetGood")}</li>
                      <li data-val="fair" role="option" ${selectedTarget === "fair" ? 'class="selected"' : ""}>${i18n.t("gpaTargetFair")}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>`;

          const sectionsHtml = sortedGroups.map(([semester, semSubjects]) => {
            const semStats = calcSemGpa(semSubjects, data?.semesterSummaries?.[semester]);
            const isCurrentSem = semSubjects.length > 0 && semSubjects.every((s) => s.isPending || (!s.letter && s.gradePoint === null && s.finalScore === null));
            const semBadge = isCurrentSem ? ` <span class="gpa-sem-current-badge">Đang học</span>` : "";
            const rowsHtml = semSubjects.map((s) => {
              const key = courseKeyOf(s);
              const isGpa = !s.excludedFromGpa && Boolean(key);
              const isPending = s.isPending || (!s.letter && s.gradePoint === null && s.finalScore === null);
              const suggestion = suggestionMap.get(key);
              const hasOverride = Object.hasOwn(overrides, key);
              const overrideVal = hasOverride ? overrides[key] : null;

              const isSelected = isCustomMode
                ? customSelectedKeys.includes(key)
                : Boolean(suggestion);

              const currentSubjPoint = numberOf(s.gradePoint ?? s.point) ?? 0;
              const possibleGrades = ["A", "B+", "B"].filter((g) => (LETTER_POINTS[g] || 0) > currentSubjPoint);
              const targetGrade = isSelected
                ? (customGradeOverrides[key] || (suggestion ? suggestion.improveTo : possibleGrades[0]))
                : null;

              const hasTargetScore = !hasOverride && isSelected && Boolean(targetGrade);
              const targetDefaultScore = targetGrade ? (GRADE_BASELINE_SCORES[targetGrade] || 8.5).toFixed(1) : null;

              const placeholder = hasTargetScore
                ? targetDefaultScore
                : s.finalScore != null
                ? Number(s.finalScore).toFixed(1)
                : isPending
                ? "—"
                : "0.0";

              const input = isGpa
                ? `<input class="gpa-score-input${hasOverride ? " has-override" : ""}${hasTargetScore ? " has-target-score" : ""}${isPending ? " is-pending-input" : ""}" data-gpa-key="${escapeHtml(key)}" value="${overrideVal ?? ""}" placeholder="${placeholder}" inputmode="decimal" aria-label="Điểm dự kiến ${escapeHtml(s.subjectName)}">`
                : `<span class="gpa-tag-nogpa">${i18n.t("gpaTagNoGpa")}</span>`;

              let suggestionCell = "";
              if (!isGpa || isPending) {
                suggestionCell = `<i data-lucide="minus" class="icon-inline"></i>`;
              } else if (!possibleGrades.length) {
                suggestionCell = `<i data-lucide="minus" class="icon-inline"></i>`;
              } else {
                const currentTarget = isSelected ? (targetGrade || possibleGrades[0]) : null;
                const displayLabel = isSelected ? currentTarget : `+ ${i18n.t("gpaCustomSelectSubject")}`;
                const gradeItems = possibleGrades
                  .map((g) => `<div class="gpa-target-item${g === currentTarget ? " active" : ""}" data-val="${g}">${g}</div>`)
                  .join("");
                const removeItem = isSelected
                  ? `<div class="gpa-target-item item-remove" data-val="__unselect">${i18n.t("gpaCustomUnselect")}</div>`
                  : "";

                suggestionCell = `
                  <div class="gpa-target-dropdown ${isSelected ? "selected" : "unselected"}" data-target-key="${escapeHtml(key)}">
                    <button type="button" class="gpa-target-trigger" title="${i18n.t("gpaCustomClickToToggle")}">
                      <span>${escapeHtml(displayLabel)}</span>
                      <i data-lucide="chevron-down" class="icon-chevron"></i>
                    </button>
                    <div class="gpa-target-menu">
                      ${gradeItems}
                      ${removeItem}
                    </div>
                  </div>
                `;
              }

              const letterCell = isPending
                ? `<span class="gpa-tag-pending">${i18n.t("gpaTagPendingLetter")}</span>`
                : s.letter
                ? `<span class="grade-pill ${getGradeClass(s.letter)}">${escapeHtml(s.letter)}</span>`
                : `<i data-lucide="minus" class="icon-inline"></i>`;

              return `<tr>
                <td class="gpa-col-name">${escapeHtml(s.subjectName)}</td>
                <td class="gpa-col-tc gpa-cell-center">${s.credits ?? "-"}</td>
                <td class="gpa-col-letter gpa-cell-center">${letterCell}</td>
                <td class="gpa-col-score gpa-cell-center">${input}</td>
                <td class="gpa-col-suggest gpa-cell-center">${suggestionCell}</td>
              </tr>`;
            }).join("");

            const regCredits = semSubjects.reduce((sum, s) => sum + (Number(s.credits) || 0), 0);
            const semSummaryText = isCurrentSem
              ? i18n.t("gpaCurrentSemSummary").replace("{credits}", regCredits)
              : i18n.t("gpaSemSummary").replace("{gpa}", semStats.gpa.toFixed(2)).replace("{credits}", semStats.credits);
            const semTitle = String(semester || "").replace(/^Hockyphu/i, "Học kỳ phụ") || i18n.t("unknownSemester");
            return `<section class="gpa-semester">
              <div class="gpa-semester-head">
                <span class="gpa-sem-title"><b>${escapeHtml(semTitle)}</b>${semBadge}</span>
                <span>${semSummaryText}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th class="gpa-col-name">${i18n.t("gpaColSubject")}</th>
                    <th class="gpa-col-tc gpa-cell-center">${i18n.t("gpaColCredits")}</th>
                    <th class="gpa-col-letter gpa-cell-center">${i18n.t("gpaColLetter")}</th>
                    <th class="gpa-col-score gpa-cell-center">${i18n.t("gpaProjectedCol")} <i data-lucide="pencil" class="icon-inline"></i></th>
                    <th class="gpa-col-suggest gpa-cell-center">${i18n.t("gpaTargetCol")}</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </section>`;
          }).join("");

          const prevPanel = body.querySelector(".gpa-panel");
          const savedScrollTop = prevPanel ? prevPanel.scrollTop : 0;

          body.innerHTML = `<div class="gpa-panel">${summaryCard}${sectionsHtml}</div>`;
          if (window.lucide) window.lucide.createIcons();

          const newPanel = body.querySelector(".gpa-panel");
          if (newPanel && savedScrollTop > 0) {
            newPanel.scrollTop = savedScrollTop;
            requestAnimationFrame(() => {
              if (newPanel) newPanel.scrollTop = savedScrollTop;
            });
          }

          document.getElementById("gpa-reset")?.addEventListener("click", () => {
            renderView(data, selectedTarget, {}, [], {});
          });

          document.getElementById("gpa-auto-suggest")?.addEventListener("click", async () => {
            const autoPlan = await window.academicAPI?.plan?.(selectedTarget);
            const suggestions = autoPlan?.data?.suggestions || [];
            const nextKeys = suggestions.map((s) => s.key);
            const nextGradeOverrides = {};
            const nextOverrides = {};
            for (const s of suggestions) {
              const targetGrade = s.improveTo || "A";
              nextGradeOverrides[s.key] = targetGrade;
              nextOverrides[s.key] = GRADE_BASELINE_SCORES[targetGrade] || 8.5;
            }
            renderView(data, selectedTarget, nextOverrides, nextKeys, nextGradeOverrides);
          });

          body.querySelectorAll(".gpa-target-trigger").forEach((btn) => {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              const parent = btn.closest(".gpa-target-dropdown");
              if (!parent) return;
              const wasOpen = parent.classList.contains("open");
              body.querySelectorAll(".gpa-target-dropdown.open").forEach((d) => d.classList.remove("open"));
              if (!wasOpen) parent.classList.add("open");
            });
          });

          body.querySelectorAll(".gpa-target-item").forEach((item) => {
            item.addEventListener("click", (e) => {
              e.stopPropagation();
              const parent = item.closest(".gpa-target-dropdown");
              if (!parent) return;
              parent.classList.remove("open");
              const key = parent.dataset.targetKey;
              if (!key) return;
              const val = item.dataset.val;

              let currentKeys = customSelectedKeys || [];
              let currentGradeOverrides = { ...customGradeOverrides };
              if (!Array.isArray(customSelectedKeys)) {
                currentKeys = Array.from(suggestionMap.keys());
                for (const [k, s] of suggestionMap) {
                  if (!currentGradeOverrides[k] && s.improveTo) {
                    currentGradeOverrides[k] = s.improveTo;
                  }
                }
              }

              let nextKeys;
              const nextGradeOverrides = { ...currentGradeOverrides };
              const nextOverrides = { ...overrides };

              if (val === "__unselect" || !val) {
                nextKeys = currentKeys.filter((k) => k !== key);
                delete nextGradeOverrides[key];
                delete nextOverrides[key];
              } else {
                nextKeys = currentKeys.includes(key) ? currentKeys : [...currentKeys, key];
                nextGradeOverrides[key] = val;
                nextOverrides[key] = GRADE_BASELINE_SCORES[val] || 8.5;
              }

              renderView(data, selectedTarget, nextOverrides, nextKeys, nextGradeOverrides);
            });
          });

          document.addEventListener("click", () => {
            body.querySelectorAll(".gpa-target-dropdown.open").forEach((d) => d.classList.remove("open"));
          });

          const targetBtn = document.getElementById("gpa-target-btn");
          const targetList = document.getElementById("gpa-target-list");
          const targetWrap = document.getElementById("gpa-target-wrap");
          if (targetBtn && targetList && targetWrap) {
            targetBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const open = targetWrap.classList.toggle("open");
              targetBtn.setAttribute("aria-expanded", String(open));
            });
            targetList.querySelectorAll("li").forEach((li) => li.addEventListener("click", () => {
              const val = li.dataset.val;
              if (val && val !== selectedTarget) {
                renderView(data, val, overrides, customSelectedKeys, customGradeOverrides);
              } else {
                targetWrap.classList.remove("open");
              }
            }));
            document.addEventListener("click", (e) => {
              if (!targetWrap.contains(e.target)) targetWrap.classList.remove("open");
            }, { once: false, capture: false });
          }

          body.querySelectorAll(".gpa-score-input").forEach((inp) => {
            inp.addEventListener("input", (event) => {
              const raw = event.target.value;
              const cleaned = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
              if (raw !== cleaned) event.target.value = cleaned;
              const score = Number(cleaned);
              if (cleaned !== "" && cleaned !== "." && Number.isFinite(score) && score > 10) event.target.value = "10";
            });
            inp.addEventListener("change", (event) => {
              const key = event.target.dataset.gpaKey;
              if (!key) return;
              const value = String(event.target.value).trim().replace(",", ".");
              const score = Number(value);

              let currentKeys = customSelectedKeys || [];
              let currentGradeOverrides = { ...customGradeOverrides };
              if (!Array.isArray(customSelectedKeys)) {
                currentKeys = Array.from(suggestionMap.keys());
                for (const [k, s] of suggestionMap) {
                  if (!currentGradeOverrides[k] && s.improveTo) {
                    currentGradeOverrides[k] = s.improveTo;
                  }
                }
              }

              const nextOverrides = { ...overrides };
              const nextGradeOverrides = { ...currentGradeOverrides };
              let nextKeys = [...currentKeys];

              const subject = data.subjects.find((s) => courseKeyOf(s) === key);
              const isPendingSubj = subject?.isPending || (!subject?.letter && subject?.gradePoint === null && subject?.finalScore === null);
              const currentPoint = subject ? (numberOf(subject.gradePoint ?? subject.point) ?? 0) : 0;

              if (value === "") {
                delete nextOverrides[key];
                delete nextGradeOverrides[key];
                nextKeys = nextKeys.filter((k) => k !== key);
              } else if (Number.isFinite(score) && score >= 0 && score <= 10) {
                nextOverrides[key] = score;
                if (!isPendingSubj) {
                  const grade = gradeOfScore10(score);
                  if (grade && grade.point > currentPoint) {
                    nextGradeOverrides[key] = grade.letter;
                    if (!nextKeys.includes(key)) {
                      nextKeys.push(key);
                    }
                  } else {
                    delete nextGradeOverrides[key];
                    nextKeys = nextKeys.filter((k) => k !== key);
                  }
                }
              } else {
                event.target.value = "";
                delete nextOverrides[key];
                delete nextGradeOverrides[key];
                nextKeys = nextKeys.filter((k) => k !== key);
              }

              renderView(data, selectedTarget, nextOverrides, nextKeys, nextGradeOverrides);
            });
          });
        };

        const loadPromise = window.academicAPI?.load?.();
        const refreshPromise = window.academicAPI?.refresh?.();
        const delayPromise = new Promise((res) => setTimeout(res, 450));

        const [academic, refreshed] = await Promise.all([loadPromise, refreshPromise]);
        await delayPromise;

        const data = refreshed?.data || academic;
        if (!data?.subjects?.length) {
          body.innerHTML = `
            <div class="empty-state">
              <i data-lucide="graduation-cap" class="empty-icon"></i>
              <div class="empty-title">${i18n.t("gpaNoDataTitle")}</div>
              <div class="empty-desc">${i18n.t("gpaNoDataDesc")}</div>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
          return;
        }

        await renderView(data, "good", {}, [], {});
      };
    }

    if (btnLogin) {
      btnLogin.onclick = async () => {
        if (state === "ok") {
          await window.widgetAPI?.logout?.();
        } else {
          const body = document.querySelector(".body");
          if (body) body.innerHTML = createSkeletonHTML();
          try {
            await window.widgetAPI?.login?.();
          } catch {
            await render(window.dateAPI.weekKey(currentWeek));
          }
        }
      };
    }

    if (btnRefresh) {
      btnRefresh.onclick = async () => {
        btnRefresh.disabled = true;
        hideToast("refresh-success");
        hideToast("refresh-error");
        createToast(i18n.t("fetchingWeek"), { id: "refresh-loading", duration: 0, type: "info" });
        try {
          await window.widgetAPI.refresh();
          hideToast("refresh-loading");
          createToast(i18n.t("fetchSuccess"), { id: "refresh-success", duration: 2500, type: "success" });
        } catch {
          hideToast("refresh-loading");
          createToast(i18n.t("fetchError"), { id: "refresh-error", duration: 3000, type: "error" });
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
        }
      };
    }

    if (state !== "ok") {
      if (btnRefresh) btnRefresh.style.display = "none";
    }

    if (window.lucide) window.lucide.createIcons();

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.style.display = "none";

  } catch (e) {
    window.loggerAPI?.error(`[render] Exception: ${e?.message ?? e}`);
    el.innerHTML = `<div class="empty">${i18n.t("renderError")} ${e?.message ?? e}</div>`;
  } finally {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      overlay.style.opacity = "0";
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
    }
    safeResize();
  }
}

let isChangingWeek = false;

async function changeWeek(offset) {
  if (isChangingWeek) {
    window.loggerAPI?.debug("[changeWeek] Already changing, ignoring spam click");
    return;
  }

  isChangingWeek = true;
  const toastId = "week-toast";

  try {
    const calendarEl = document.getElementById("cal");
    if (calendarEl) {
      calendarEl.outerHTML = createSkeletonHTML();
    }

    createToast(i18n.t("fetchingWeek"), { id: toastId, duration: 0, type: "info" });
    const payload = await window.widgetAPI.fetchWeek(offset, currentWeek.toISOString());

    if (!payload || !payload.weekStart) {
      const targetWeek = new Date(currentWeek);
      targetWeek.setDate(targetWeek.getDate() + (offset * 7));
      const cacheKey = window.dateAPI.weekKey(targetWeek);
      const cachedData = await window.scheduleAPI?.load?.(cacheKey);

      if (cachedData && cachedData.weekStart) {
        currentWeek = new Date(cachedData.weekStart);
        await render(window.dateAPI.weekKey(currentWeek));
        hideToast(toastId);
        if (!isOnline) {
          createToast(i18n.t("offlineMode"), { id: toastId, type: "warning" });
        } else {
          createToast(i18n.t("loadFailed"), { id: toastId, type: "error" });
        }
      } else {
        hideToast(toastId);
        createToast(i18n.t("noDataForWeek"), { id: toastId, type: "error" });
      }
      return;
    }

    currentWeek = new Date(payload.weekStart);
    await render(window.dateAPI.weekKey(currentWeek));
    hideToast(toastId);
    createToast(i18n.t("fetchSuccess"), { id: toastId, duration: 2500, type: "success" });
  } catch (err) {
    window.loggerAPI?.error(`[changeWeek] ERROR: ${err?.message}`, err);

    if (err?.message?.includes("Cookie expired") || err?.message?.includes("Session") || err?.message?.includes("No cookies")) {
      hideToast(toastId);
      createToast(i18n.t("sessionExpired"), {
        id: toastId,
        type: "error",
        clickable: true,
        onClick: () => window.widgetAPI.login(),
      });
      return;
    }

    try {
      const targetWeek = new Date(currentWeek);
      targetWeek.setDate(targetWeek.getDate() + (offset * 7));
      const cacheKey = window.dateAPI.weekKey(targetWeek);
      const cachedData = await window.scheduleAPI?.load?.(cacheKey);

      if (cachedData && cachedData.weekStart) {
        currentWeek = new Date(cachedData.weekStart);
        await render(window.dateAPI.weekKey(currentWeek));
        hideToast(toastId);
        if (!isOnline) {
          createToast(i18n.t("offlineMode"), { id: toastId, type: "warning" });
        } else {
          createToast(i18n.t("loadFailed"), { id: toastId, type: "error" });
        }
      } else {
        hideToast(toastId);
        createToast(i18n.t("fetchError") + ": " + (err?.message || "Unknown"), { id: toastId, type: "error" });
      }
    } catch {
      hideToast(toastId);
      createToast(i18n.t("fetchError") + ": " + (err?.message || "Unknown"), { id: toastId, type: "error" });
    }
  } finally {
    isChangingWeek = false;
  }
}

let isAppInitialized = false;

async function initApp() {
  if (isAppInitialized) return;
  isAppInitialized = true;
  window.loggerAPI?.debug("initApp triggered");
  try {
    appVersionValue = await window.appAPI?.getVersion?.();
  } catch {
    appVersionValue = "1.9.1";
  }

  registerIpcListeners();
  await render(window.dateAPI.weekKey(currentWeek));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
