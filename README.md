# UNETI Schedule Widget

Ứng dụng widget desktop để xem lịch học theo tuần từ **Trường Đại học Kinh tế – Kỹ thuật Công nghiệp (UNETI)**.

Ứng dụng tích hợp trực tiếp với cổng thông tin sinh viên UNETI (`https://sinhvien.uneti.edu.vn`), cho phép sinh viên đăng nhập và lấy thời khóa biểu chính thức.

Lưu ý: Ứng dụng này chỉ dành cho **sinh viên UNETI**. Bạn cần có tài khoản sinh viên hợp lệ để sử dụng.

---

## Tính năng

- Widget Electron gọn nhẹ, tích hợp vào khay hệ thống (system tray)
- Đăng nhập trực tiếp trong ứng dụng (không cần mở trình duyệt ngoài)
- Phân tích và hiển thị lịch học theo tuần (môn học, buổi, phòng, giảng viên)
- Tự động làm mới mỗi 12 giờ
- Lưu cookies cục bộ trong thư mục dữ liệu người dùng

---

## Hướng dẫn build thủ công

### 1. Clone repository

```bash
git clone https://github.com/your-username/uneti-schedule-widget.git
cd uneti-schedule-widget
```

### 2. Cài đặt Node.JS

- https://nodejs.org/en/download

### 3. Cài đặt dependencies

- Dự án sử dụng npm. Nếu chưa cài:

```bash
npm install
```

### 4. Chạy chế độ phát triển

```bash
npm run dev
```

- Ứng dụng Electron sẽ được khởi chạy trực tiếp.

### 5. Build file .exe (Windows)

```bash
npm run build
```

- File cài đặt (.exe) sẽ nằm trong thư mục dist/.

### Cấu trúc dự án

```bash
app/              # Frontend (HTML/CSS/JS cho widget)
app/fetcher/      # Logic lấy dữ liệu lịch + đăng nhập
main/             # Electron main process
schedule.json và cookies.txt sẽ được lưu tại %APPDATA%/uneti-schedule-widget/store/ (Windows).
```

### 6. Sử dụng

- Chạy ứng dụng.
- Lần đầu mở, cửa sổ đăng nhập sẽ hiện ra.
- Đăng nhập bằng tài khoản sinh viên UNETI.
- Sau khi đăng nhập thành công, lịch học sẽ được tải và hiển thị trong widget.
- Ứng dụng sẽ thu gọn xuống khay hệ thống.
- Bấm vào icon khay để bật/tắt widget.
- Yêu cầu hệ thống: Node.js ≥ 20

### 7. Test

- Windows 10/11 (đã kiểm thử).
- Các nền tảng khác có thể chạy nhưng chưa được hỗ trợ chính thức.

### 8. Lưu ý !!!

- Đây là công cụ không chính thức, chỉ nhằm hỗ trợ sinh viên UNETI xem lịch học tiện lợi hơn.
- Ứng dụng không phải sản phẩm chính thức của UNETI.
- Người dùng tự chịu trách nhiệm khi sử dụng.
