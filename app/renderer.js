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

const $ = (s, r = document) => r.querySelector(s);

function byDay(data) {
  const m = {};
  for (const x of data) (m[x.day] ??= []).push(x);
  return m;
}
function periodSpan(p) {
  return p.length > 1 ? `${p[0]} - ${p[p.length - 1]}` : `${p[0]}`;
}
function periodTime(p) {
  const a = periodsTime[p[0]]?.[0],
    b = periodsTime[p[p.length - 1]]?.[1];
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
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function render() {
  const el = $("#content");
  const payload = window.scheduleAPI.load();
  if (!payload) {
    el.innerHTML = `<div class="empty">Không tải được dữ liệu. Kiểm tra mạng hoặc đăng nhập lại.</div>`;
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
                  <div class="line room">${s.room}</div>
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

  $("#btn-refresh").onclick = async () => {
    const btn = $("#btn-refresh");
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Đang tải...";

    try {
      await window.widgetAPI.refresh();
      showToast("Lịch đã cập nhật!");
    } catch (err) {
      showToast("Không tải được dữ liệu. Lỗi: " + err);
    }

    btn.textContent = oldText;
    btn.disabled = false;
  };

  $("#btn-hide").onclick = () => window.widgetAPI.hide();
  $("#btn-exit").onclick = () => window.widgetAPI.quit();

  const cal = $("#cal");
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

window.addEventListener("DOMContentLoaded", () => {
  render();
  window.scheduleAPI.onReload(render);
});
