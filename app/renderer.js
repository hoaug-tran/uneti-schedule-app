import { startOfWeek } from "../app/utils/date.js";

const $ = (s, r = document) => r.querySelector(s);
function setStatus(msg) {
  const el = $("#status");
  if (el) el.innerHTML = msg ?? "";
}

function createToast(html, { id, duration = 3000, clickable = false } = {}) {
  let toast = id ? document.getElementById(id) : null;
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    if (id) toast.id = id;
    document.body.appendChild(toast);
  }
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

const periodsTime = {
  1: ["07:00", "07:45"],
  2: ["07:50", "08:35"],
  3: ["08:40", "09:25"],
  4: ["09:30", "10:15"],
  5: ["10:20", "11:05"],
  6: ["11:10", "11:55"],
  7: ["12:30", "13:15"],
  8: ["13:20", "14:05"],
  9: ["14:10", "14:55"],
  10: ["15:00", "15:45"],
  11: ["15:50", "16:35"],
  12: ["16:40", "17:25"],
};

let currentWeek = startOfWeek(new Date());

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
function normalizeType(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}
function showToast(msg) {
  createToast(msg);
}

if (window.statusAPI?.onStatus) {
  window.statusAPI.onStatus((msg) => setStatus(msg));
}
if (window.scheduleAPI?.onReload) {
  window.scheduleAPI.onReload(async () => {
    await render(window.dateAPI.weekKey(currentWeek));
  });
}

let updateToastShown = false;
let progressToastId = "update-progress-toast";

window.updateAPI?.onUpdateToast?.((msg) => {
  updateToastShown = true;
  const html = `
    <div style="display:flex; gap:.75rem; align-items:center;">
      <div style="flex:1">${msg}</div>
      <button id="btn-toast-update-now" class="btn">Cập nhật ngay</button>
    </div>`;
  const toast = createToast(html, { id: "update-available", clickable: true });
  toast
    .querySelector("#btn-toast-update-now")
    ?.addEventListener("click", async () => {
      createToast(`<div id="upd-line">Đnag cập nhật: 0%</div>`, {
        id: progressToastId,
        clickable: true,
        duration: 0,
      });
      hideToast("update-available");
      const ok = await window.updateAPI.install();
      if (!ok) {
        hideToast(progressToastId);
        createToast("Không thể bắt đầu tải cập nhật.", { duration: 3000 });
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
  el.textContent = `Đang cập nhật: ${pct}% (${done} / ${total} - ${speed})`;
});

window.updateAPI?.onDownloaded?.(() => {
  hideToast(progressToastId);

  createToast(
    "Đã tải xong bản cập nhật. Chuẩn bị khởi động lại để cài đặt...",
    {
      id: "update-ready",
      duration: 3000,
    }
  );

  setTimeout(() => {
    window.updateAPI.confirmInstall();
  }, 3000);
});

window.updateAPI?.onError?.((msg) => {
  hideToast(progressToastId);
  createToast(`Lỗi cập nhật: ${msg}`, { duration: 4000 });
});

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

function cleanRoom(room = "") {
  return room
    .replace(/^Phòng học\//i, "")
    .replace(/^Phòng hiệu năng cao\s*/i, "");
}

async function changeWeek(offset) {
  try {
    const payload = await window.widgetAPI.fetchWeek(offset);
    if (!payload) {
      showToast("Không có dữ liệu tuần này.");
      return;
    }
    if (payload.weekStart) {
      currentWeek = new Date(payload.weekStart);
      await render(window.dateAPI.weekKey(currentWeek));
    }
  } catch (err) {
    console.warn("[changeWeek:B] fetch fail:", err);
  }
}

async function render(isoDate) {
  const el = $("#content");
  try {
    const payload = await window.scheduleAPI?.load?.(isoDate);
    const hasCookies = await window.scheduleAPI?.cookiesExists?.();

    let state = "first";
    let loginLabel = "Đăng nhập";

    if (payload) state = "ok";
    else if (hasCookies) {
      state = "expired";
      loginLabel = "Đăng nhập lại";
    }

    let metaHtml = "";
    let bodyHtml = "";

    if (!payload) {
      metaHtml = "Chưa có dữ liệu";
      bodyHtml = `<div class="empty">Chưa có dữ liệu lịch. Bạn cần <b>${loginLabel}</b> để tải lịch.</div>`;
    } else {
      const { updatedAt, data, weekStart } = payload;
      const grouped = byDay(data);
      const firstDay = new Date(weekStart);
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);

      const weekDays = getWeekDays(firstDay, lastDay);

      metaHtml = `Cập nhật: ${new Date(updatedAt).toLocaleString(
        "vi-VN"
      )}<br/>`;
      metaHtml += `<span class="week-range" style="font-weight:bold;color:white">Tuần: 
      ${firstDay.toLocaleDateString("vi-VN")} → ${lastDay.toLocaleDateString(
        "vi-VN"
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
                    ${new Date(d).toLocaleDateString("vi-VN", {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </header>
                  <div class="day-body">
                    ${
                      entries.length > 0
                        ? entries
                            .map(
                              (s) => `
                                <article class="card">
                                  <div class="subject">${s.subject}</div>
                                  <div class="line period">
                                    Tiết ${periodSpan(s.periods)}
                                    <span class="sep"> | </span>${periodTime(
                                      s.periods
                                    )}
                                    <span class="sep"> | </span>${s.session}
                                    <span class="tag type-${s.type.toLowerCase()}">${
                                s.type
                              }</span>
                                  </div>
                                  <div class="line room">${cleanRoom(
                                    s.room
                                  )}</div>
                                  ${
                                    s.teacher
                                      ? `<div class="line teacher">GV ${s.teacher}</div>`
                                      : ""
                                  }
                                </article>
                              `
                            )
                            .join("")
                        : `<div class="no-class">Không phải đi học <span class="icon">🎉</span></div>`
                    }
                  </div>
                </section>`;
            })
            .join("")}
        </div>`;
    }

    const version = await window.appAPI.getVersion();

    el.innerHTML = `
      <div class="shell">
        <div class="head">
          <div class="title">
            <img src="assets/uneti.webp" class="logo" alt="logo" />
            <span>Lịch học UNETI <span class="version-label">v${version}</span></span>
          </div>
          <div class="actions">
            <div class="left-group">
              <button id="btn-update">Cập nhật</button>
              <button id="btn-login">${loginLabel}</button>
              <button id="btn-refresh">Làm mới</button>
            </div>
            <div class="right-group">
              <button id="btn-hide">Thu nhỏ</button>
              <button id="btn-exit">Thoát</button>
            </div>
          </div>
        </div>
        
        <div class="footer-bar">
          <div class="meta">${metaHtml}</div>
          <div class="week-nav">
            <button id="btn-prev-week">← Trước</button>
            <button id="btn-next-week">Sau →</button>
          </div>
        </div>

        <div class="body">${bodyHtml}</div>
      </div>`;

    const btnUpdate = $("#btn-update");
    const btnLogin = $("#btn-login");
    const btnRefresh = $("#btn-refresh");
    const btnHide = $("#btn-hide");
    const btnExit = $("#btn-exit");
    const btnPrevWeek = $("#btn-prev-week");
    const btnNextWeek = $("#btn-next-week");

    if (state === "ok") btnLogin.style.display = "none";
    else btnRefresh.style.display = "none";

    btnPrevWeek?.addEventListener("click", async () => {
      btnPrevWeek.disabled = true;
      showToast("Vui lòng đợi...");
      try {
        await changeWeek(-1);
        showToast("Tải lịch thành công!");
      } catch (err) {
        showToast("Lỗi khi tải tuần trước: " + (err?.message ?? err));
      } finally {
        btnPrevWeek.disabled = false;
      }
    });

    btnNextWeek?.addEventListener("click", async () => {
      btnNextWeek.disabled = true;
      showToast("Vui lòng đợi...");
      try {
        await changeWeek(1);
        showToast("Tải lịch thành công!");
      } catch (err) {
        showToast("Lỗi khi tải tuần sau: " + (err?.message ?? err));
      } finally {
        btnNextWeek.disabled = false;
      }
    });

    btnUpdate?.addEventListener("click", async () => {
      const old = btnUpdate.textContent;
      btnUpdate.disabled = true;
      btnUpdate.textContent = "Đang kiểm tra...";
      try {
        const res = await window.updateAPI?.check?.();
        if (res?.update) {
          if (!updateToastShown) {
            window.updateAPI.onUpdateToast((msg) => {});
            const html = `
              <div style="display:flex; gap:.75rem; align-items:center;">
                <div style="flex:1">Có bản cập nhật mới (v${res.version}). Bấm để cập nhật ngay.</div>
                <button id="btn-toast-update-now" class="btn">Cập nhật ngay</button>
              </div>`;
            const toast = createToast(html, {
              id: "update-available",
              clickable: true,
            });
            toast
              .querySelector("#btn-toast-update-now")
              ?.addEventListener("click", async () => {
                createToast(`<div id="upd-line">Đang cập nhật: 0%</div>`, {
                  id: progressToastId,
                  clickable: true,
                  duration: 0,
                });
                hideToast("update-available");
                const ok = await window.updateAPI.install();
                if (!ok) {
                  hideToast(progressToastId);
                  createToast("Không thể bắt đầu tải cập nhật.", {
                    duration: 3000,
                  });
                }
              });
          }
        } else if (res?.error) {
          showToast("Lỗi kiểm tra: " + res.error);
        } else {
          showToast(`Bạn đang dùng phiên bản mới nhất (v${res.version}).`);
        }
      } catch (e) {
        showToast("Lỗi kiểm tra cập nhật: " + (e?.message ?? e));
      } finally {
        btnUpdate.textContent = old;
        btnUpdate.disabled = false;
      }
    });

    btnLogin?.addEventListener("click", async () => {
      try {
        await window.widgetAPI?.login?.();
        showToast("Đăng nhập thành công, lịch đã cập nhật!");
        btnLogin.style.display = "none";
        if (btnRefresh) btnRefresh.style.display = "";
        await render(window.dateAPI.weekKey(currentWeek));
      } catch (e) {
        showToast("Đăng nhập thất bại: " + (e?.message ?? e));
      }
    });

    btnRefresh?.addEventListener("click", async () => {
      const old = btnRefresh.textContent;
      btnRefresh.disabled = true;
      btnRefresh.textContent = "Đang tải...";
      try {
        await window.widgetAPI.refresh();
        showToast("Lịch đã cập nhật!");
      } catch (err) {
        showToast("Không tải được dữ liệu: " + (err?.message ?? err));
      } finally {
        btnRefresh.textContent = old;
        btnRefresh.disabled = false;
      }
    });

    btnHide?.addEventListener("click", () => window.widgetAPI?.hide?.());
    btnExit?.addEventListener("click", () => window.widgetAPI?.quit?.());

    const cal = $("#cal");
    cal?.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          cal.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false }
    );

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.style.display = "none";
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      setTimeout(() => {
        overlay.style.opacity = "0";
        setTimeout(() => (overlay.style.display = "none"), 300);
      }, 800);
    }
  } catch (e) {
    el.innerHTML = `<div class="empty">Có lỗi khi hiển thị: ${
      e?.message ?? e
    }</div>`;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await render(window.dateAPI.weekKey(currentWeek));
});
