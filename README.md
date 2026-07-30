# ANAN Photo Select — Next.js / Vercel

Phiên bản Next.js thay thế Google Apps Script của ANAN Studio. App dùng Google Drive để đọc ảnh/nhặt RAW, Google Sheets làm kho dữ liệu và lưu bảng kết quả có tô màu.

## Chức năng

- Trang quản trị có mật khẩu.
- Tạo album từ một thư mục Google Drive, quét cả thư mục con.
- Danh sách album có tìm kiếm thông minh, sắp xếp, phân trang, lưu trữ và xoá khỏi app.
- Link khách công khai theo dạng `/?album=ID`.
- Album ảnh tự tải thêm khi cuộn, lọc theo thư mục và giữ đúng tỷ lệ ảnh dọc/ngang.
- Chọn ảnh, xem lớn, tải ảnh, ghi chú từng ảnh và ghi chú chung.
- Đánh dấu ảnh phóng 60×90 và ảnh để bàn với giới hạn riêng.
- Lưu nháp trên server và trên trình duyệt.
- Tạo một Google Sheet kết quả riêng trong thư mục ảnh gốc; tô hồng ảnh 60×90, vàng ảnh để bàn, đen khi RAW thiếu/trùng.
- Quét thư mục RAW, tạo thư mục theo tên album và copy các file RAW tương ứng.
- Gửi email đến studio khi khách gửi hoặc cập nhật lựa chọn ảnh.

## 1. Chuẩn bị Google Cloud

1. Tạo hoặc chọn một project tại Google Cloud Console.
2. Bật **Google Drive API** và **Google Sheets API**.
3. Tạo một Google Sheet trống. Copy ID nằm giữa `/d/` và `/edit` trên URL.
4. Chọn một trong hai cách xác thực:

### Cách A — OAuth tài khoản studio (khuyên dùng)

Cách này cho phép app tạo/copy file bằng chính dung lượng và quyền của tài khoản studio.

1. Cấu hình OAuth consent screen.
2. Tạo OAuth Client ID.
3. Lấy refresh token có hai scope:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/spreadsheets`
4. Chuẩn bị `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

Có thể dùng OAuth 2.0 Playground: bật “Use your own OAuth credentials”, nhập client ID/secret, chọn hai scope trên rồi đổi authorization code lấy refresh token.

### Cách B — Service account

1. Tạo service account và private key JSON.
2. Chia sẻ Google Sheet dữ liệu, thư mục JPG và thư mục RAW cho email service account với quyền Editor.
3. Dùng `client_email` và `private_key` trong key JSON.

Lưu ý: tài khoản service account thông thường có thể bị giới hạn khi tạo/copy file trên My Drive. OAuth hoặc Shared Drive phù hợp hơn cho tính năng nhặt RAW.

## 2. Cấu hình môi trường

Copy `.env.example` thành `.env.local`, sau đó điền:

```env
ADMIN_PASSWORD=mat-khau-quan-tri
SESSION_SECRET=chuoi-ngau-nhien-dai-it-nhat-32-ky-tu
GOOGLE_DATA_SPREADSHEET_ID=id-google-sheet-trong
NEXT_PUBLIC_APP_URL=http://localhost:3000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

Nếu dùng service account, bỏ trống ba biến OAuth và điền:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Thư mục JPG vẫn nên bật **Anyone with the link — Viewer** để trình duyệt của khách tải thumbnail trực tiếp từ Drive. Dữ liệu xác thực Google chỉ chạy ở server và không được gửi xuống trình duyệt.

### Thông báo email (tuỳ chọn)

App dùng [Resend](https://resend.com) để gửi thông báo khi khách gửi hoặc gửi lại lựa chọn. Thêm ba biến sau vào môi trường chạy app:

```env
RESEND_API_KEY=re_...
NOTIFICATION_EMAIL_FROM="ANAN DP Select <notify@your-domain.com>"
NOTIFICATION_EMAIL_TO=studio@your-domain.com
```

`NOTIFICATION_EMAIL_TO` có thể chứa nhiều email, cách nhau bằng dấu phẩy. Trước khi gửi đến địa chỉ khác, domain trong địa chỉ `FROM` cần được xác minh trong Resend. Nếu chưa cấu hình đủ ba biến, app vẫn lưu lựa chọn và Sheet như bình thường, chỉ không gửi email.

## 3. Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`. Không có tham số `album` là trang quản trị; link album là trang dành cho khách.

## 4. Deploy Vercel

1. Đưa thư mục này lên GitHub/GitLab/Bitbucket hoặc dùng Vercel CLI.
2. Import project vào Vercel, framework sẽ được nhận diện là Next.js.
3. Thêm toàn bộ biến trong `.env.local` vào **Project Settings → Environment Variables**.
4. Đổi `NEXT_PUBLIC_APP_URL` thành domain production, ví dụ `https://select.ananstudio.vn`.
5. Deploy lại sau khi thêm biến.

API tạo album và nhặt RAW được cấu hình thời gian chạy tối đa 300 giây. Với album rất lớn, nên chia ảnh theo thư mục con.

## 5. Quy ước dữ liệu

App tự tạo các tab trong Google Sheet dữ liệu:

- `_albums`: metadata album.
- `_drafts`: bản nháp mới nhất của mỗi album.
- `_selections`: kết quả khách đã gửi.
- `_settings`: hướng dẫn mặc định.
- `photos_<albumId>`: danh sách ảnh của album, được ẩn.
- Mỗi album có một Google Sheet kết quả riêng, nằm trong thư mục ảnh gốc và mang tên `<tên album> - ảnh khách chọn`.

Xoá album trong app không xoá ảnh JPG/RAW trên Drive hoặc Google Sheet kết quả. Các tab dữ liệu cũ cũng được giữ lại để tránh mất dữ liệu ngoài ý muốn.

## Kiểm tra

```bash
npm run build
npm audit --omit=dev
```

Build production hiện đã vượt qua kiểm tra TypeScript và dependency audit không còn lỗ hổng đã biết.
