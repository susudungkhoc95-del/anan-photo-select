# Hướng dẫn hệ màu và thành phần giao diện ANAN Photo Select

Tài liệu tham chiếu để đổi theme toàn bộ website sau này. Theme hiện tại là navy / teal dark cho khu vực quản trị và xanh sáng cho trang khách chọn ảnh.

## 1. File nguồn cần chỉnh

File CSS trung tâm:

```text
app/globals.css
```

Các file giao diện chính:

| Khu vực | File | Chức năng |
| --- | --- | --- |
| Vỏ ứng dụng | `components/App.tsx` | Chọn màn hình quản trị hoặc trang khách |
| Quản trị DP Select | `components/AdminView.tsx` | Đăng nhập, tạo album, quản lý album, cấu hình |
| Trang khách chọn ảnh | `components/ClientView.tsx` | Gallery, bộ lọc, chọn ảnh, xem lại, gửi ảnh |
| DP Workflow | `components/WorkflowView.tsx` | Kanban, thẻ, danh sách, kéo-thả, nhãn, lịch sử |
| Link nhanh | `components/QuickLinks.tsx` | Các nút truy cập nhanh ở trang quản trị |
| Kiểu dữ liệu | `lib/types.ts` | Không chứa màu UI, chỉ tham chiếu khi thêm trạng thái mới |

Quy tắc: ưu tiên thay các biến CSS dùng chung trước. Chỉ thay màu hard-code ở các section đặc biệt như gallery ảnh, zoom ảnh, trạng thái lỗi và màu nhãn workflow.

## 2. Bảng màu theme hiện tại

### 2.1. Màu nền và màu nền lớp

| Tên token | Giá trị hiện tại | Vai trò |
| --- | --- | --- |
| `--bg` | `#061a27` | Nền navy chính |
| `--panel` | `rgba(10, 42, 55, .76)` | Panel / card bán trong suốt |
| `--panel-strong` | `rgba(8, 35, 48, .94)` | Modal, menu, panel nổi |
| `--field` | `rgba(5, 28, 40, .78)` | Input, textarea, select |
| `--line` | `rgba(92, 222, 210, .24)` | Viền teal mờ |
| `--shadow` | `0 24px 64px rgba(0, 0, 0, .34)` | Bóng panel / modal |
| `--inner-light` | `inset 0 1px 0 rgba(165, 255, 244, .14)` | Highlight rất nhẹ bên trong control |

### 2.2. Màu chữ và trạng thái

| Tên token | Giá trị hiện tại | Vai trò |
| --- | --- | --- |
| `--ink` | `#f2fffd` | Chữ chính trên nền tối |
| `--muted` | `#91adb4` | Chữ phụ, mô tả, metadata |
| `--accent` | `#35e0c7` | Teal nhấn, focus, icon, trạng thái chọn |
| `--accent-dark` | `#9affed` | Chữ nhấn trên nền tối |
| `--ok` | `#63e4b1` | Thành công / hoàn tất |
| `--danger` | `#ff3b4f` | Xóa, lỗi nguy hiểm |
| `#f2ba55` | — | Cảnh báo / thẻ sắp trễ |
| `#ff8b97` | — | Thẻ trễ |
| `#74d6a6` | — | Thẻ hoàn thành |

### 2.3. Gradient nền navy

Nền chung trong `body`:

```css
radial-gradient(circle at 12% 12%, rgba(38, 206, 189, .28), transparent 29%),
radial-gradient(circle at 88% 8%, rgba(13, 103, 115, .34), transparent 34%),
linear-gradient(135deg, #061a27 0%, #092d3a 50%, #061722 100%)
```

Nền riêng cho `body.admin-mode`:

```css
radial-gradient(circle at 12% 8%, rgba(35, 216, 193, .24), transparent 30%),
radial-gradient(circle at 92% 12%, rgba(22, 111, 126, .28), transparent 36%),
linear-gradient(135deg, #04131e 0%, #092b39 48%, #061a27 100%)
```

### 2.4. Màu nút dùng chung

```css
/* Nút chính */
background: linear-gradient(180deg, #65f2dc, #35e0c7);
color: #fff;
border-color: rgba(255, 255, 255, .42);

/* Nút phụ / icon */
background: rgba(19, 67, 78, .74);
color: var(--ink);
border-color: var(--line);

/* Nút phụ trong admin */
background: #123d4b;
border-color: rgba(141, 182, 224, .28);

/* Nút chính trong admin */
background: #117c7a;
color: #f4f9ff;
border-color: rgba(151, 195, 239, .34);

/* Nút nguy hiểm */
background: rgba(255, 74, 92, .1);
border-color: rgba(255, 59, 79, .22);
color: #d71932;
```

Khi đổi theme, giữ phân biệt giữa nút chính, nút phụ và nút nguy hiểm. Không dùng selector nút chính chung để ghi đè các control đặc biệt của trang khách.

## 3. Các thành phần giao diện hiện có

### 3.1. Thành phần nền tảng

| Class / thành phần | Mục đích | Token chính |
| --- | --- | --- |
| `body`, `.shell` | Nền và khung nội dung | `--bg`, `--ink` |
| `.panel` | Khối nội dung lớn | `--panel`, `--line`, `--shadow` |
| `.modal-backdrop` | Lớp phủ modal | nền đen trong suốt |
| `.modal-card` | Modal thông thường | `--panel-strong`, `--line` |
| `.notice` | Thông báo trung tính | `--line`, `--ink` |
| `.notice.error` | Thông báo lỗi | `#ffadb6`, `--danger` |
| `.toast` | Toast ngắn ở cuối màn hình | nền navy đậm, trắng |
| `.spinner` | Loading | viền xám xanh, `--accent` |
| `input`, `textarea`, `select` | Control nhập liệu | `--field`, `--line`, `--ink` |
| `label`, `.muted`, `.hint`, `.meta` | Chữ phụ / nhãn field | `--muted` |

Focus mặc định:

```css
border-color: rgba(53, 224, 199, .78);
box-shadow: var(--inner-light), 0 0 0 3px rgba(53, 224, 199, .14);
```

### 3.2. Trang quản trị DP Select

Màn hình nằm trong `AdminView.tsx`, dùng `body.admin-mode`.

| Thành phần | Class / selector | Ghi chú đổi màu |
| --- | --- | --- |
| Header | `.topbar`, `.admin-header` | Gradient navy-teal, viền `--line` |
| Logo | `.admin-logo-mark` | Asset `public/dp-logo.png`, không đổi bằng CSS màu |
| Tab DP Select / Workflow | `.app-tabs`, `.app-tabs a.active` | Tab active dùng teal sáng |
| Ô tìm kiếm | `.workflow-search`, `.admin-header-search` | Dùng `--field` |
| Panel tạo link | `.create-panel` | Panel lớn, border radius 28px |
| Panel album | `.library-panel` | Danh sách album và bộ lọc |
| Album card | `.album-card`, `.album-item` | Panel, viền, chữ muted |
| Nút copy / mở / Sheet | `.card-actions`, `.button.secondary` | Giữ cùng hierarchy của nút phụ |
| Trạng thái đã gửi | `.submitted-status` | Màu thành công / teal |
| Modal cài đặt | `.settings-modal` | `--panel-strong`, backdrop blur |
| Mẫu hướng dẫn | `.template-toolbar`, `.template-options` | Input, radio, nút phụ |
| Link nhanh | `.quick-links`, `.quick-link` | Dùng token panel/accent |
| Nút cài đặt góc màn hình | `.settings-fab` | Icon button tròn |
| Loading tạo album | `.spinner.small` | Trạng thái đang quét Drive |

### 3.3. Trang khách chọn ảnh

Trang khách được nhận diện bằng `body:has(.client-page)`. Đây là theme sáng độc lập, không dùng palette navy quản trị.

#### Token trang khách

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

#### Thành phần khách

| Thành phần | Class / selector | Màu đặc biệt |
| --- | --- | --- |
| Tên studio | `.studio-banner` | Chữ serif, `var(--ink)` |
| Toolbar sticky | `.toolbar` | `rgba(235,244,255,.78)` |
| Bộ đếm ảnh | `.counter` | `--accent-dark`, số dùng `--accent` |
| Bộ lọc | `.client-filters`, `.toolbar-concept` | Input/select sáng |
| Gallery | `.photos` | Grid ảnh |
| Ô ảnh | `.photo` | `rgba(219,233,255,.82)`, viền `--line` |
| Ảnh đã chọn | `.photo.selected` | Viền `--accent` |
| Nút tim chưa chọn | `button.heart` | Trắng mờ, tim `--accent` |
| Nút tim đã chọn | `.photo.selected button.heart` | Nền `--accent`, chữ trắng |
| Tên ảnh | `.caption` | Gradient đen trong suốt |
| Banner gửi thành công | `.success-banner` | Xanh lá `--ok` |
| Modal xem lại | `.review-panel` | `--panel-strong` |
| Ảnh trong review | `.review-item`, `.review-photo-button` | Panel và viền `--line` |
| Toggle ảnh phóng / để bàn | `.print-toggle` | Active dùng teal hoặc accent |
| Ghi chú album | `.album-note` | Border top `--line` |
| Modal xem lớn | `.zoom-backdrop` | Nền gần đen, chữ trắng |
| Nút trước / sau | `.zoom-nav` | Nền đen trong suốt |
| Nút chọn trong zoom | `.zoom-select` | Active nền trắng, chữ đen |
| Toast | `.toast` | Nền navy đậm, chữ trắng |
| Undo | `.undo-toast` | `--panel-strong`, viền `--line` |

Các rule `body:has(.client-page) button.heart`, `.review-photo-button`, `.zoom-nav`, `.zoom-select` là rule bắt buộc phải giữ riêng khi đổi theme. Nếu gom tất cả button vào cùng một màu, giao diện chọn ảnh và modal zoom sẽ bị sai tương phản.

### 3.4. DP Workflow / Kanban

Màn hình nằm trong `WorkflowView.tsx`, luôn thêm class `admin-mode` vào `body`.

| Thành phần | Class / selector | Vai trò |
| --- | --- | --- |
| Header workflow | `.workflow-header` | Logo, tab, tìm kiếm |
| Tìm kiếm thẻ | `.workflow-search` | Lọc theo tên, link, nhãn |
| Bảng | `.workflow-board` | Container kéo ngang |
| Cột danh sách | `.workflow-column` | Panel Kanban |
| Header cột | `.workflow-column > header` | Tên danh sách, số thẻ, menu |
| Thẻ | `.workflow-card` | Card công việc kéo-thả |
| Thẻ đang kéo | `.workflow-card.dragging` | Giảm opacity |
| Thẻ đang lưu | `.workflow-card.saving` | Viền accent, opacity `.78` |
| Preview khi kéo | `.workflow-drag-overlay` | Teal đậm, shadow mạnh |
| Thẻ rỗng | `.workflow-empty` | Muted |
| Thêm thẻ | `.workflow-add-card` | Nền accent trong suốt |
| Thêm danh sách | `.workflow-add-list` | Viền dashed accent |
| Modal tạo thẻ | `.workflow-create-modal` | Panel strong |
| Modal chi tiết thẻ | `.workflow-modal` | Nội dung, link, hoạt động |
| Modal cài đặt nhanh | `.workflow-quick-card-modal` | Ngày cưới và nhãn |
| Modal quản lý nhãn | `.workflow-labels-modal` | Tạo, sửa, xóa nhãn |
| Chip nhãn | `.workflow-label-chips span` | Màu động từ `--label-color` |
| Tuổi thẻ | `.workflow-age` | Teal / vàng / đỏ / xanh hoàn thành |
| Lịch sử | `.workflow-activity` | Metadata và mô tả hoạt động |
| Xóa danh sách | `.workflow-delete-modal` | Nút danger |

#### Màu trạng thái workflow

```css
.workflow-age        { color: #9de9df; } /* bình thường */
.workflow-age.warning { color: #f2ba55; } /* cảnh báo */
.workflow-age.late    { color: #ff8b97; } /* trễ */
.workflow-age.done    { color: #74d6a6; } /* hoàn thành */
```

Nhãn workflow dùng bảng màu cố định trong `WorkflowView.tsx`:

```ts
const LABEL_COLORS = [
  "#ef4444", // đỏ
  "#f97316", // cam
  "#eab308", // vàng
  "#22c55e", // xanh lá
  "#3b82f6", // xanh dương
  "#a855f7", // tím
];
```

Đây là màu dữ liệu của nhãn, không nên thay bằng token theme nếu muốn các nhãn đã lưu giữ nguyên ý nghĩa. Chỉ thay khi chủ động migrate dữ liệu hoặc muốn đổi toàn bộ hệ thống nhãn.

## 4. Typography, hình khối và tương tác

| Hạng mục | Giá trị hiện tại |
| --- | --- |
| Font UI | `Inter`, fallback system UI |
| Font tên studio | `Didot`, `Bodoni 72`, `Times New Roman`, serif |
| Border radius button | `14px` |
| Border radius input | `15px` |
| Border radius panel | `28px` |
| Border radius workflow column | `18px` |
| Border radius workflow card | `13px` |
| Border radius icon button | `999px` |
| Transition chính | khoảng `150–180ms ease` |
| Focus ring | 3px accent mờ |
| Backdrop blur | 20–22px ở toolbar/panel |

Khi đổi theme, nên giữ nguyên hình khối và spacing nếu chỉ muốn đổi tone màu. Điều này giúp người dùng không phải học lại giao diện.

## 5. Cách đổi sang một theme mới

### Bước 1 — Tạo bảng màu mới

Tạo một section mới trong file này, ghi đủ:

```text
bg / panel / panel-strong / field / ink / muted / line
accent / accent-dark / ok / danger
gradient nền / màu scrollbar / màu focus
```

Đảm bảo contrast tối thiểu:

- Chữ chính trên nền: dễ đọc ở kích thước thường.
- Chữ muted chỉ dùng cho thông tin phụ, không dùng cho nút chính.
- Nút danger phải khác rõ với accent.
- Focus ring phải nhìn thấy trên cả nền panel và nền input.

### Bước 2 — Đổi token trong `app/globals.css`

Đổi đồng bộ ba khu vực:

1. `:root` — giá trị mặc định.
2. `body.admin-mode` — DP Select và DP Workflow.
3. `body:has(.client-page)` — trang khách chọn ảnh.

Nếu admin có theme sáng, cập nhật thêm `body.admin-mode.admin-light-mode`.

### Bước 3 — Đổi các màu hard-code đặc biệt

Tìm toàn bộ màu còn sót bằng:

```bash
rg -n "#[0-9a-fA-F]{3,8}|rgba?\\(" app components
```

Kiểm tra các nhóm sau:

- Gradient `body`, header và nút.
- Nút tim, nút zoom, control review của khách.
- Màu trạng thái workflow.
- Scrollbar admin.
- Thông báo lỗi, thành công, cảnh báo.
- Preview kéo-thả.
- Màu nhãn workflow.

### Bước 4 — Kiểm tra toàn bộ màn hình

Kiểm tra thủ công:

1. Trang đăng nhập admin.
2. Trang tạo album và album đã tạo.
3. Modal cài đặt mẫu hướng dẫn / link nhanh.
4. Trang khách trên mobile và desktop.
5. Chọn ảnh, bỏ chọn, xem lại, ghi chú, gửi ảnh.
6. Xem ảnh lớn, chuyển ảnh trước / sau, chọn trong zoom.
7. Workflow: tạo danh sách, tạo thẻ, kéo-thả, menu, modal chi tiết.
8. Nhãn, ngày cưới, lịch sử, xóa thẻ / xóa danh sách.
9. Loading, empty state, error notice, toast và undo.

### Bước 5 — Chạy kiểm tra

```bash
npm run lint
npm test
npm run build
```

## 6. Quy tắc khi phát triển thêm UI

1. Dùng token CSS (`var(--bg)`, `var(--panel)`, `var(--ink)`...) cho màu chung.
2. Chỉ hard-code màu khi đó là màu trạng thái hoặc control có nền riêng biệt.
3. Không dùng màu navy admin cho modal zoom ảnh của khách.
4. Không đổi `--accent` mà quên focus ring, active state và spinner.
5. Không đổi màu nhãn workflow bằng CSS nếu chưa quyết định có đổi dữ liệu nhãn đã lưu hay không.
6. Mỗi trạng thái mới cần có màu cho: bình thường, hover, focus, disabled, loading, success và error.
7. Không dùng opacity thấp cho chữ quan trọng hoặc nút có thể bấm.
8. Giữ selector override của `body.admin-mode` và `body:has(.client-page)` để hai khu vực không ảnh hưởng lẫn nhau.

## 7. Tóm tắt nhanh để đổi tone navy

Nếu chỉ muốn đổi toàn bộ navy sang một màu khác, bắt đầu tại các dòng token đầu file `app/globals.css`:

```css
:root { ... }
body.admin-mode { ... }
```

Sau đó đổi:

```css
body.admin-mode { background: ...; }
body.admin-mode button:not(.secondary):not(.danger):not(.icon-button) { ... }
body.admin-mode button.secondary,
body.admin-mode .icon-button { ... }
body.admin-mode *::-webkit-scrollbar { ... }
```

Cuối cùng kiểm tra lại toàn bộ selector `.workflow-*`, vì Workflow có thêm màu hard-code cho drag overlay, card hover, trạng thái tuổi thẻ và nút thêm thẻ.

Tài liệu palette cũ trước đây vẫn được lưu tại [`docs/color-palettes.md`](./color-palettes.md). File hiện tại là hướng dẫn tổng thể cho theme và UI hiện hành.
