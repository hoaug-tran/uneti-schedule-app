# UNETI Schedule Widget

Ứng dụng widget desktop để xem lịch học theo tuần từ **Trường Đại học Kinh tế – Kỹ thuật Công nghiệp (UNETI)**.

Ứng dụng tích hợp trực tiếp với cổng thông tin sinh viên UNETI ([https://sinhvien.uneti.edu.vn](https://sinhvien.uneti.edu.vn)), cho phép sinh viên đăng nhập và lấy **thời khóa biểu chính thức**.

⚠️ **Lưu ý:** Ứng dụng này chỉ dành cho sinh viên UNETI. Bạn cần có tài khoản sinh viên hợp lệ để sử dụng.

---

## ✨ Tính năng

- 🖥️ Widget Electron gọn nhẹ, chạy nền và tích hợp vào **khay hệ thống (system tray)**
- 🔑 **Đăng nhập trực tiếp trong ứng dụng** (không cần mở trình duyệt ngoài)
- 📅 Hiển thị lịch học theo tuần: **môn học, buổi, tiết, phòng học, giảng viên**
- 🔄 **Tự động làm mới** dữ liệu mỗi 12 giờ hoặc làm mới thủ công
- 🍪 **Lưu cookies cục bộ** trong thư mục dữ liệu người dùng, không chia sẻ ra ngoài

---

## 🛠️ Hướng dẫn cài đặt & build

### 1. Clone repository

```bash
git clone https://github.com/your-username/uneti-schedule-widget.git
cd uneti-schedule-widget
```

### 2. Cài đặt Node.js

- Yêu cầu hệ thống: **Node.js ≥ 20**
- Tải tại: [https://nodejs.org/en/download](https://nodejs.org/en/download)

### 3. Cài dependencies

```bash
npm install
```

### 4. Chạy ở chế độ phát triển

```bash
npm run dev
```

Ứng dụng Electron sẽ khởi chạy trực tiếp.

### 5. Build file `.exe` (Windows)

```bash
npm run build
```

File cài đặt sẽ nằm trong thư mục `dist/`.

---

## 📂 Cấu trúc dự án

```
app/              # Frontend (HTML/CSS/JS cho widget)
app/fetcher/      # Logic lấy dữ liệu lịch + đăng nhập
main/             # Electron main process
```

- `schedule-*.json` và `cookies.txt` được lưu tại:  
  `%APPDATA%/uneti-schedule-widget/store/` (Windows)

---

## 🚀 Cách sử dụng

1. Chạy ứng dụng.
2. Lần đầu mở, cửa sổ đăng nhập sẽ hiện ra.
3. Đăng nhập bằng **tài khoản sinh viên UNETI**.
4. Sau khi đăng nhập thành công, lịch học sẽ được tải và hiển thị trong widget.
5. Ứng dụng sẽ thu gọn xuống **khay hệ thống**.
6. Bấm vào icon trong khay để bật/tắt widget.

---

## ✅ Kiểm thử

- Đã test: **Windows 10/11**
- Các nền tảng khác: _chưa test_

---

## ⚠️ Lưu ý

- Đây là công cụ **không chính thức**, phát triển nhằm hỗ trợ sinh viên UNETI theo dõi lịch học nhanh chóng.
- Ứng dụng **không thuộc về Trường Đại học Kinh tế – Kỹ thuật Công nghiệp (UNETI)**, mà là **sản phẩm cá nhân** do sinh viên UNETI xây dựng.
- Phần mềm **miễn phí**, **không thu thập hay sử dụng dữ liệu riêng tư**.
- Người dùng **tự chịu trách nhiệm** về việc cài đặt và sử dụng ứng dụng.
