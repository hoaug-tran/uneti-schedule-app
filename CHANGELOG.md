# Changelog

Các thay đổi được ghi theo phiên bản. Mô tả trên GitHub Release chỉ sử dụng nội
dung của phiên bản tương ứng trong file này.

## [1.9.4] - 2026-10-16

### Đăng nhập và dữ liệu tài khoản

- Ngăn nhiều lần bấm Đăng nhập tạo các phiên đăng nhập chồng nhau. Khi đóng cửa sổ đăng nhập hoặc Đăng xuất, yêu cầu đang chạy được hủy.
- Chỉ thông báo đăng nhập thành công khi cookie và hồ sơ đã được lưu. Nếu lưu thất bại, ứng dụng dọn dữ liệu của lần đăng nhập đó và báo lỗi để bạn thử lại.
- Gắn dữ liệu lịch và kết quả học tập đã lưu với từng tài khoản. Kết quả trả về từ phiên cũ không được ghi đè dữ liệu của tài khoản vừa đăng nhập.
- Khi Đăng xuất, xóa cookie, dữ liệu đăng nhập trong trình duyệt, lịch, kết quả học tập và các bản sao lưu liên quan. Nếu không xóa được, ứng dụng báo lỗi thay vì thông báo thành công.
- Lưu cookie bằng Windows Credential Manager hoặc cơ chế mã hóa của hệ điều hành. Dữ liệu theo định dạng mã hóa cũ được chuyển đổi khi lưu thành công.

### Lịch học và thông báo

- Thay dữ liệu lịch đã lưu bằng dữ liệu đầy đủ nhận từ API, tránh giữ lại buổi học đã bị xóa hoặc thay đổi ở những tuần khác.
- Hiển thị cảnh báo khi lịch đã lưu quá 6 giờ. Bạn vẫn có thể xem lịch khi mất mạng và nhấn Làm mới khi có kết nối; dữ liệu quá 30 ngày không được dùng làm cache.
- Phân biệt làm mới thành công, dùng dữ liệu đã lưu và phiên đăng nhập hết hạn. Không báo làm mới thành công khi không lấy được dữ liệu mới.
- Tính ngày, tuần học và giờ nhắc lịch theo múi giờ Việt Nam, kể cả khi máy sử dụng múi giờ khác. Hủy nhắc lịch đang chờ sau khi Đăng xuất.

### Điểm và kế hoạch GPA

- Kiểm tra dữ liệu đầu vào của công cụ GPA: điểm, số tín chỉ, mục tiêu và số lượng môn phải nằm trong giới hạn được hỗ trợ; từ chối giá trị không hợp lệ.
- Giữ các quy tắc tính điểm, học lại và môn chưa có điểm. Với ký hiệu điểm hành chính từ API, dùng điểm số hợp lệ đi kèm để tính thay vì từ chối toàn bộ bảng điểm.
- Chuyển tính toán kế hoạch GPA sang worker riêng, có giới hạn hàng đợi và thời gian xử lý để tránh chặn luồng chính của ứng dụng.
- Dọn event listener khi rời màn hình GPA để không tích lũy sau nhiều lần sửa điểm hoặc mở lại màn hình.

### Giao diện

- Bổ sung điều khiển danh sách chọn bằng các phím mũi tên, Home, End, Enter, Space và Escape; trả focus về nút mở khi đóng danh sách.
- Điều chỉnh bố cục và vùng cuộn cho cửa sổ nhỏ, giới hạn kích thước cửa sổ theo vùng hiển thị của màn hình.
- Dùng font có sẵn trên máy để giao diện không cần tải font qua mạng. Bổ sung trạng thái focus và hỗ trợ chế độ tương phản cao.
- Hiển thị nội dung từ API dưới dạng văn bản đã escape để dữ liệu không bị diễn giải thành HTML.

### Bảo mật và cập nhật

- Nâng Electron lên 44.7.2, electron-builder lên 26.15.3 và electron-updater lên 6.8.9; cập nhật các dependency liên quan và đồng bộ lockfile.
- Kiểm tra domain, thời hạn token và origin của API; không chuyển tiếp cookie qua redirect sang địa chỉ khác.
- Kiểm tra cửa sổ gửi IPC, main frame và tham số đầu vào; chặn điều hướng, popup và yêu cầu quyền không được phép. Áp dụng Content Security Policy và sandbox cho cửa sổ đăng nhập.
- Che thông tin nhạy cảm trong log; giới hạn dung lượng và thời gian lưu log. Ghi JSON qua file tạm rồi đổi tên; truyền lỗi lưu dữ liệu lên nơi gọi để xử lý.
- Kiểm tra cập nhật độc lập với trạng thái đăng nhập. Thay đổi thiết lập tự cập nhật có hiệu lực trong lúc ứng dụng đang chạy; không tạo thêm biểu tượng khay hệ thống.
- Hủy tải cập nhật khi cần và hoàn tất dọn tài nguyên trước khi thoát hoặc cài bản mới. Không đề xuất hạ phiên bản.
- Tiếp tục hỗ trợ phát hành và tự cập nhật bằng bộ cài chưa ký. Đối chiếu kích thước và SHA-512 của file tải về với metadata cập nhật.

### Build và phát hành

- Tự tạo mô tả GitHub Release từ riêng mục khớp version trong CHANGELOG.md. Dừng build nếu mục này thiếu, rỗng hoặc trùng; không dùng lại mô tả cũ.
- Thay script sửa latest.yml bằng bước xác minh version, tên bộ cài, kích thước, SHA-512 và blockmap sau build.
- CI chạy npm ci để cài dependency, kiểm tra cú pháp, test, kiểm tra dependency và build trên push main/dev hoặc pull request; chỉ push main mới chạy bước phát hành.
- Thêm test hồi quy cho đăng nhập, phiên tài khoản, lưu trữ, GPA, nhắc lịch và cách lấy nội dung phát hành từ changelog.

## [1.9.3] - 2026-10-02

- Bản phát hành 1.9.3. Xem các ghi chú đã công bố trên GitHub Release của phiên bản này.
