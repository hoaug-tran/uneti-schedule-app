const $ = (s, r = document) => r.querySelector(s);
const setStatus = (msg) => {
  const el = $("#status");
  if (el) el.textContent = msg ?? "";
};

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

function byDay(data) {
  const m = {};
  for (const x of data) (m[x.day] ??= []).push(x);
  return m;
}
function periodSpan(p) {
  return p.length > 1 ? `${p[0]} - ${p[p.length - 1]}` : `${p[0]}`;
}
function periodTime(p) {
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
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

if (window.statusAPI?.onStatus) {
  window.statusAPI.onStatus((msg) => setStatus(msg));
}

if (window.scheduleAPI?.onReload) {
  window.scheduleAPI.onReload(async () => {
    await render();
  });
}

async function render() {
  const el = $("#content");
  try {
    const payload = await window.scheduleAPI?.load?.();

    if (!payload) {
      el.innerHTML = `<div class="empty">Chưa có dữ liệu lịch. Hãy kiểm tra mạng hoặc thử đăng nhập lại.</div>`;
      return;
    }

    const { updatedAt, data } = payload;
    const grouped = byDay(data);
    const days = Object.keys(grouped).sort();

    if (days.length === 0) {
      el.innerHTML = `<div class="empty">Không có lịch học trong tuần này.</div>`;
      return;
    }

    const firstDay = new Date(days[0]);
    const lastDay = new Date(days[days.length - 1]);
    const rangeText = `${firstDay.toLocaleDateString(
      "vi-VN"
    )} → ${lastDay.toLocaleDateString("vi-VN")}`;

    el.innerHTML = `
      <div class="shell">
        <div class="head">
          <div class="title">
            <img src="assets/uneti.webp" class="logo" alt="logo" />
            <span>Lịch học UNETI</span>
          </div>
          <div class="actions">
            <button id="btn-refresh" title="Làm mới">Làm mới</button>
            <button id="btn-hide" title="Ẩn">Ẩn</button>
            <button id="btn-exit" title="Thoát">Thoát</button>
          </div>
        </div>

        <div class="meta">
          Cập nhật: ${new Date(updatedAt).toLocaleString("vi-VN")}<br/>
          Tuần: ${rangeText}
        </div>

        <div class="calendar" id="cal">
          ${days
            .map(
              (d) => `
            <section class="day-col">
              <header class="day-h">
                ${new Date(d).toLocaleDateString("vi-VN", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </header>
              <div class="day-body">
                ${grouped[d]
                  .map(
                    (s) => `
                  <article class="card">
                    <div class="subject">${s.subject}</div>
                    <div class="line period">
                      Tiết ${periodSpan(s.periods)}
                      <span class="sep"> | </span>
                      ${periodTime(s.periods)}
                      <span class="sep"> | </span>
                      ${s.session}
                      <span class="tag ${normalizeType(s.type)}">${
                      s.type
                    }</span>
                    </div>
                    <div class="line room">${s.room ?? ""}</div>
                    ${
                      s.teacher
                        ? `<div class="line teacher">GV ${s.teacher}</div>`
                        : ""
                    }
                  </article>
                `
                  )
                  .join("")}
              </div>
            </section>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    const btnRefresh = $("#btn-refresh");
    const btnHide = $("#btn-hide");
    const btnExit = $("#btn-exit");

    btnRefresh?.addEventListener("click", async () => {
      if (!window.widgetAPI?.refresh) return;
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
    if (statusEl) {
      statusEl.style.display = "none";
    }
  } catch (e) {
    el.innerHTML = `<div class="empty">Có lỗi khi hiển thị: ${
      e?.message ?? e
    }</div>`;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!$("#status")) {
    const bar = document.createElement("div");
    bar.id = "status";
    bar.style.cssText = "padding:6px 10px;font-size:13px;color:#bbb;";
    bar.textContent = "Đang khởi động...";
    document.body.prepend(bar);
  }

  await render();
});
