# Color palettes

## Legacy blue — giao diện trước buổi chỉnh màu 05/08/2026

Đây là palette xanh dương nguyên bản. Khi muốn trả giao diện về màu cũ, dùng các giá trị dưới đây và giữ nguyên cấu trúc/layout hiện tại.

### Web khách chọn ảnh

```css
--bg: #eaf3ff;
--panel: rgba(255, 255, 255, .72);
--panel-strong: rgba(255, 255, 255, .9);
--field: rgba(255, 255, 255, .82);
--ink: #082042;
--muted: #526b8d;
--line: rgba(125, 159, 205, .34);
--accent: #347cff;
--accent-dark: #0648b7;
--ok: #1d8b4f;
--shadow: 0 22px 58px rgba(42, 89, 150, .16);
--inner-light: inset 0 1px 0 rgba(255, 255, 255, .82);
```

Background:

```css
radial-gradient(circle at 12% 10%, rgba(255, 255, 255, .92), transparent 28%),
radial-gradient(circle at 88% 12%, rgba(116, 166, 255, .48), transparent 34%),
linear-gradient(135deg, #edf6ff 0%, #dcecff 48%, #f8fbff 100%)
```

Các màu bắt buộc của control khách:

```css
/* Nút chính */
linear-gradient(180deg, #6aa7ff, #347cff)

/* Nút phụ */
rgba(255, 255, 255, .66)

/* Focus input */
border: rgba(52, 124, 255, .7);
ring: rgba(52, 124, 255, .13);

/* Tim chưa chọn */
background: rgba(255, 255, 255, .88);
color: #347cff;

/* Tim đã chọn */
background: #347cff;
color: #fff;

/* Banner đã gửi */
color: #1d8b4f;
background: rgba(33, 168, 97, .1);
border: rgba(29, 139, 79, .25);

/* Nút chọn ảnh trong zoom */
background: rgba(12, 14, 18, .8);
color: rgba(255, 255, 255, .94);
/* trạng thái đã chọn */
background: #fff;
color: #111318;
```

### Admin/workflow — palette xanh cũ

```css
--bg: #071421;
--panel: rgba(16, 34, 51, .72);
--panel-strong: rgba(21, 44, 66, .9);
--field: rgba(8, 24, 38, .78);
--ink: #eaf5ff;
--muted: #9fb8cf;
--line: rgba(125, 159, 205, .22);
--accent: #5f9dff;
--accent-dark: #c7def8;
--shadow: 0 24px 64px rgba(0, 0, 0, .38);
--inner-light: inset 0 1px 0 rgba(255, 255, 255, .12);
```

Background admin/workflow:

```css
radial-gradient(circle at 12% 8%, rgba(99, 153, 255, .24), transparent 30%),
radial-gradient(circle at 92% 12%, rgba(76, 130, 210, .26), transparent 36%),
linear-gradient(135deg, #06111d 0%, #0a2033 48%, #071421 100%)
```

## Cách khôi phục

1. Đổi các biến trong `app/globals.css` theo đúng section tương ứng.
2. Với web khách, áp palette vào `body:has(.client-page)` để không ảnh hưởng admin.
3. Đảm bảo rule màu nút chính không ghi đè `.heart`, `.review-photo-button`, `.zoom-nav` và `.zoom-select`; các control này cần selector riêng.
4. Chạy `npm run lint && npm test` sau khi đổi.

File này là bảng tham chiếu chính thức cho palette xanh dương legacy; không dùng màu ước lượng bằng mắt từ screenshot.
