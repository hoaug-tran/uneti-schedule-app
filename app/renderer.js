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
  let toast = id ? document.getElementById(id) : null;
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    if (id) toast.id = id;
    document.body.appendChild(toast);
  }
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

function registerIpcListeners() {
  if (window.statusAPI?.onStatus) {
    window.statusAPI.onStatus((msg) => setStatus(msg));
  }
  if (window.scheduleAPI?.onReload) {
    window.scheduleAPI.onReload(async () => {
      window.loggerAPI?.debug("onReload event received");
      await render(window.dateAPI.weekKey(currentWeek));

      setTimeout(() => {
        createToast(i18n.t("refreshReminder"), {
          id: "refresh-reminder-toast",
          duration: 6000,
          type: "info"
        });
      }, 2000);
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
    updateToastShown = true;
    const html = `
      <div style="display:flex; gap:.75rem; align-items:center;">
        <div style="flex:1">${msg}</div>
        <button id="btn-toast-update-now" class="btn">Update Now</button>
      </div>`;
    const toast = createToast(html, { id: "update-available", clickable: true });
    toast
      .querySelector("#btn-toast-update-now")
      ?.addEventListener("click", async () => {
        const pToast = createToast(`<div id="upd-line">Updating: 0%</div>`, {
          id: "update-progress-toast",
          clickable: true,
          duration: 0,
        });
        hideToast("update-available");
        const ok = await window.updateAPI.install();
        if (!ok) {
          hideToast("update-progress-toast");
          createToast("Failed to start update download.", { duration: 3000 });
        }
      });
  });

  window.updateAPI?.onProgress?.((p) => {
    const el = document.getElementById("upd-line");
    if (!el) return;
    const pct = Math.max(0, Math.min(100, p?.percent ?? 0)).toFixed(0);
    const done = fmtBytes(p?.transferred ?? 0);
    const total = fmtBytes(p?.total ?? 0);
    const speed = fmtBytes(p?.bytesPerSecond ?? 0) + "/s";
    el.textContent = `Updating: ${pct}% (${done} / ${total} - ${speed})`;
  });

  window.updateAPI?.onDownloaded?.(() => {
    hideToast("update-progress-toast");
    createToast("Update downloaded. Restarting to install...", {
      id: "update-ready",
      duration: 3000,
    });
    setTimeout(() => {
      window.updateAPI.confirmInstall();
    }, 3000);
  });

  window.updateAPI?.onError?.((msg) => {
    hideToast("update-progress-toast");
    createToast(`Update error: ${msg}`, { duration: 4000 });
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

    if (btnUpdate) btnUpdate.onclick = async () => {
      const old = btnUpdate.textContent;
      btnUpdate.disabled = true;
      btnUpdate.textContent = i18n.t("checking");
      try {
        const res = await window.updateAPI?.check?.();
        if (res?.update) {
          showToast(`${i18n.t("newUpdate")} (v${res.version})`, "update-check-toast");
        } else {
          showToast(i18n.t("noUpdate"), "update-check-toast");
        }
      } catch (e) {
        showToast(i18n.t("checkError"), "check-update-toast");
      } finally {
        btnUpdate.disabled = false;
        btnUpdate.textContent = old;
      }
    };
    if (btnLogin) btnLogin.onclick = () => window.widgetAPI.login();
    if (btnRefresh) btnRefresh.onclick = async () => {
      const old = btnRefresh.textContent;
      btnRefresh.disabled = true;
      btnRefresh.textContent = "...";
      try {
        await window.widgetAPI.refresh();
      } catch (e) { }
      finally {
        btnRefresh.disabled = false;
        btnRefresh.textContent = old;
      }
    };
    if (btnHide) btnHide.onclick = () => window.widgetAPI.hide();
    if (btnExit) btnExit.onclick = () => window.widgetAPI.quit();
    if (btnPrevWeek) btnPrevWeek.onclick = () => changeWeek(-1);
    if (btnNextWeek) btnNextWeek.onclick = () => changeWeek(1);

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

async function changeWeek(offset) {
  if (weekChangeTimeout) {
    window.loggerAPI?.debug(`[changeWeek] Debouncing, ignoring rapid click`);
    return;
  }

  const toastId = "week-toast";
  const btnPrev = $("#btn-prev-week");
  const btnNext = $("#btn-next-week");
  const btnRefresh = $("#btn-refresh");

  window.loggerAPI?.debug(`[changeWeek] START offset=${offset}, currentWeek=${currentWeek.toISOString()}`);

  if (btnPrev) btnPrev.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (btnRefresh) btnRefresh.disabled = true;
  window.loggerAPI?.debug(`[changeWeek] Navigation buttons disabled`);

  weekChangeTimeout = setTimeout(() => {
    weekChangeTimeout = null;
  }, 300);

  try {
    const calendarEl = document.getElementById("cal");
    if (calendarEl) {
      calendarEl.outerHTML = createSkeletonHTML();
      window.loggerAPI?.debug(`[changeWeek] Skeleton UI injected`);
    }

    if (!isOnline) {
      window.loggerAPI?.warn(`[changeWeek] Offline mode, using cache only`);
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

    showToast(i18n.t("fetchingWeek"), toastId, "info");
    window.loggerAPI?.debug(`[changeWeek] Calling fetchWeek with offset=${offset}`);

    const payload = await window.widgetAPI.fetchWeek(offset, currentWeek.toISOString());
    window.loggerAPI?.debug(`[changeWeek] fetchWeek returned:`, payload ? `weekStart=${payload.weekStart}, data.length=${payload.data?.length}` : "null");

    if (!payload || !payload.weekStart) {
      window.loggerAPI?.warn(`[changeWeek] No payload from network, attempting cache fallback`);
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

    setTimeout(() => {
      createToast(i18n.t("fetchSuccess"), { id: toastId, duration: 2500, type: "success" });
    }, 100);

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
    if (btnPrev) btnPrev.disabled = false;
    if (btnNext) btnNext.disabled = false;
    if (btnRefresh) btnRefresh.disabled = false;
    window.loggerAPI?.debug(`[changeWeek] END, buttons re-enabled`);
  }
}

