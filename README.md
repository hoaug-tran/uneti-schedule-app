# Widget Lịch học UNETI

Ứng dụng desktop giúp sinh viên UNETI xem lịch học nhanh và tiện lợi.

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/hoaug-tran/uneti-schedule-app)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/hoaug-tran/uneti-schedule-app)

---

## Giới thiệu

App này mình viết để tra cứu lịch học UNETI cho tiện. Thay vì phải mở browser, đăng nhập vào trang lịch của trường mỗi lần muốn xem, giờ chỉ cần click vào tray icon là xong.

App tự động làm mới lịch mỗi giờ, nên lịch luôn cập nhật. 

## Tính năng chính

- Hiển thị lịch học theo tuần
- Tự động làm mới: tuần hiện tại mỗi 1 giờ, tuần sau mỗi 6 giờ
- Hoạt động offline (dùng lịch đã lưu)
- Dark/Light theme
- Tiếng Việt/English
- Tray icon để truy cập nhanh

## Cài đặt

### Yêu cầu

- Windows 10/11 (64-bit)
- Khoảng 150MB ổ cứng

### Cách cài

1. Tải file `.exe` từ [Releases](https://github.com/hoaug-tran/uneti-schedule-app/releases)
2. Chạy installer
3. Mở app và đăng nhập bằng tài khoản UNETI

> [!IMPORTANT]
> Lần đầu cần internet để đăng nhập. Sau đó app vẫn chạy được khi offline.

## Sử dụng

### Đăng nhập

Mở app lần đầu sẽ hiện cửa sổ đăng nhập. Nhập username/password UNETI như bình thường.

> [!NOTE]
> App chỉ lưu cookie session được mã hóa tại máy của bạn, không lưu mật khẩu.

### Xem lịch

Sau khi đăng nhập, lịch sẽ tự động hiển thị. Dùng nút "← Trước" và "Sau →" để chuyển tuần.

### Làm mới lịch

Click nút "Làm mới" để tải lịch mới nhất từ server. Nên làm mới trước những ngày quan trọng (thi, nộp đồ án...).

> [!TIP]
> App tự động làm mới mỗi giờ, nhưng bạn vẫn nên bấm "Làm mới" thủ công trước ngày thi để chắc chắn.

### Tray Menu

Chuột phải vào icon tray để mở menu:

- **Khởi động cùng Windows**: Tự động chạy khi khởi động máy
- **Xoá dữ liệu lịch**: Xoá lịch đã lưu (dùng khi lịch bị lỗi)
- **Xoá dữ liệu người dùng (đăng xuất)**: Đăng xuất hoàn toàn
- **Xem file log**: Xem file log (để debug khi có lỗi)
- **Thông tin về app**: Xem version của app, thông tin của dev
- **Thoát**: Thoát app

## FAQ

**Q: App có miễn phí không?**  
A: Có, hoàn toàn miễn phí và open-source.

**Q: App có lưu mật khẩu không?**  
A: Không. App chỉ lưu cookie session được mã hóa tại máy của bạn, không lưu mật khẩu.

**Q: Tại sao nhiều khi phải đăng nhập lại?**  
A: Cookie của trường (UNETI) với mỗi tài khoản của sinh viên có thời hạn. Khi hết hạn thì phải đăng nhập lại.

**Q: Lịch có chính xác không?**  
A: Có. App lấy lịch trực tiếp từ server UNETI và tự động làm mới mỗi giờ.

**Q: App có hoạt động offline không?**  
A: Có. Khi mất mạng, app sẽ dùng lịch đã lưu. Khi có mạng lại sẽ tự động cập nhật.

**Q: Tại sao khi cài app nặng tận 150MB?**  
A: Electron runtime chiếm ~80MB (chuẩn của Electron app). Code app chỉ ~5MB.

**Q: Dữ liệu lưu ở đâu?**  
A: `%APPDATA%/uneti-schedule-widget/`. Cookie được mã hóa bằng Windows Credential Manager.

## Troubleshooting

### Không đăng nhập được

**Mô tả lỗi**: Click Login nhưng không mở cửa sổ đăng nhập.

**Thử các cách sau**:
1. Kiểm tra kết nối internet
2. Tắt firewall/antivirus tạm thời
3. Restart app
4. Chuột phải tray → Clear User Data → Thử lại

### Lịch bị sai hoặc thiếu

**Mô tả lỗi**: Lịch không khớp với trang web UNETI.

**Thử các cách sau**:
1. Click nút "Làm mới"
2. Nếu vẫn sai: Chuột phải tray → Xoá dữ liệu lịch → Thử lại
3. Kiểm tra log: Chuột phải tray → Xem file log (xem tên các buổi học có xuất hiện hay không)

### Chuyển tuần bị văng ra đăng nhập

**Mô tả lỗi**: Khi chuyển tuần click vào Trước/Sau bị chuyển hướng về màn hình đăng nhập.

**Nguyên nhân**: Cookie hết hạn.

**Giải pháp**: Đăng nhập lại.

### Toast "Bạn đang Offline" không biến mất

**Mô tả lỗi**: Dù đã có mạng nhưng vẫn hiện offline warning.

**Thử các cách sau**:
1. Đợi 5-10 giây
2. Click nút "Làm mới"
3. Khởi động lại app
4. Nếu vẫn bị, chuột phải tray → Thoát → Mở lại app

### App không tự động khởi động

**Mô tả lỗi**: Dù đã bật "Start with Windows" nhưng không tự khởi động.

**Thử các cách sau**:
1. Chuột phải tray → Tắt "Start with Windows"
2. Đợi 2 giây
3. Chuột phải tray → Bật lại
4. Restart máy để test

> [!WARNING]
> Nếu vẫn gặp lỗi, mở issue trên GitHub hoặc liên hệ qua email.

## Development

### Công nghệ sử dụng

- Electron 33.2.1
- JavaScript (ES Modules)
- better-sqlite3 (database)
- Cheerio (HTML parser)
- Keytar (secure cookie storage)

### Setup

```bash
git clone https://github.com/hoaug-tran/uneti-schedule-app.git
cd uneti-schedule-app
npm install
npm run dev
```

### Build

```bash
npm run build
```

File build sẽ nằm trong folder `dist/`.

## License

MIT License - xem file [LICENSE](LICENSE).

## Liên hệ

**Trần Kính Hoàng (hoaug)**

- GitHub: [@hoaug-tran](https://github.com/hoaug-tran)
- Facebook: [hoaugtr](https://facebook.com/hoaugtr)
- Email: hi@trkhoang.com

---

Made with ❤️ by Trần Kính Hoàng
