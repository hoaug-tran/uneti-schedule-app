# Kiểm tra máy chủ cập nhật cục bộ

Hướng dẫn này giúp kiểm tra các file cập nhật do bản build tạo ra và phục vụ chúng
qua HTTP trên máy phát triển. Không chạy thử cài đè trên bản ứng dụng đang dùng.

## Build và mở máy chủ

Yêu cầu Windows, Node.js từ 22.12 trở lên và npm. Chạy tại thư mục gốc project:

```powershell
npm ci
npm run check
npm test
npm run build -- --publish never
npm run update-server
```

Máy chủ chạy tại `http://localhost:8080`, phục vụ các file trong `dist/`:

- `latest.yml`: phiên bản, tên bộ cài, kích thước và SHA-512.
- `uneti-schedule-widget-<version>-setup.exe`: bộ cài.
- File `.exe.blockmap` tương ứng: dữ liệu phục vụ tải cập nhật theo từng phần.

Bước sau build sẽ đối chiếu thông tin trong `latest.yml` với bộ cài. Nếu thay đổi
bộ cài, hãy build lại để các file cập nhật khớp nhau.

Mở cửa sổ PowerShell khác để xem máy chủ có trả metadata hay không:

```powershell
Invoke-WebRequest http://localhost:8080/latest.yml | Select-Object -ExpandProperty Content
```

Dừng máy chủ bằng `Ctrl+C` khi kiểm tra xong.

## Chạy từ source với máy chủ riêng

Bản chạy từ source mặc định dùng `http://localhost:8080`. Để dùng địa chỉ khác:

```powershell
$env:USE_LOCAL_UPDATE_SERVER = 'true'
$env:LOCAL_UPDATE_SERVER_URL = 'http://localhost:8080'
npm run dev
```

Các biến này chỉ áp dụng khi chạy từ source. Bản đã đóng gói lấy cập nhật từ
GitHub. Để bỏ các biến trong cửa sổ PowerShell hiện tại:

```powershell
Remove-Item Env:USE_LOCAL_UPDATE_SERVER -ErrorAction SilentlyContinue
Remove-Item Env:LOCAL_UPDATE_SERVER_URL -ErrorAction SilentlyContinue
```

## Kiểm tra quá trình nâng cấp

Project sử dụng bộ cài chưa ký và không yêu cầu chứng thư để phát hành hoặc
cập nhật. File tải về được đối chiếu kích thước và SHA-512 với metadata. Phép
đối chiếu này phát hiện file không khớp, không xác thực danh tính nhà phát hành.

Updater chỉ đề xuất phiên bản cao hơn bản đang chạy. Vì vậy, build rồi kiểm tra
cập nhật trên chính phiên bản đó sẽ không có bản mới để tải. Khi thử nâng cấp,
cần chạy bản cũ và phục vụ bộ cài có version cao hơn.

Việc tải được latest.yml từ máy chủ chỉ xác nhận máy chủ phục vụ file được.
Để kiểm tra toàn bộ quá trình, dùng máy ảo hoặc Windows Sandbox: tải bản cập
nhật, cài đặt, kiểm tra version sau cài, mở ứng dụng, đăng nhập, tải lịch và
đăng xuất. Không thử cài đè trên bản đang dùng để học tập.
