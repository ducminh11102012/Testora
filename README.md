# Examina — nền tảng khảo thí trên máy

Phần mềm thi trên trình duyệt: giao diện thí sinh dựng theo chuẩn computer-delivered,
trang quản trị đầy đủ, hỗ trợ cả **B2C** (học sinh tự đăng ký, mua credit) và **B2B**
(trường / trung tâm có không gian riêng, logo riêng, lớp riêng, kỳ thi riêng).

Thương hiệu, màu sắc và logo đều cấu hình được — không gắn với bất kỳ tổ chức khảo thí nào.

---

## Chạy thử trong 2 phút

```bash
npm install
npm run seed      # tạo data/examina.db + tổ chức mẫu + tài khoản + đề mẫu
npm run dev       # http://localhost:3000
```

Yêu cầu **Node 22.5 trở lên** (dùng driver SQLite tích hợp sẵn của Node — không cài native
module, không cần database server).

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin@examina.test` | `admin1234` | Quản trị nền tảng (thấy mọi tổ chức) |
| `owner@chuyen.test` | `owner1234` | Chủ sở hữu trường |
| `teacher@chuyen.test` | `teach1234` | Giáo viên — chấm bài, tạo kỳ thi |
| `candidate@chuyen.test` | `test1234` | Thí sinh của trường |
| `learner@examina.test` | `test1234` | Học sinh tự đăng ký (B2C) |

Mã vào phòng thi mẫu: **`CHUYEN1`** — đăng nhập bằng tài khoản thí sinh rồi vào `/join`.

---

## Kiến trúc B2C / B2B

Một database, mọi bảng thuộc về khách hàng đều mang `orgId`, và mọi truy vấn đọc dữ liệu
khách hàng đều nhận `orgId`. Danh mục công khai (B2C) chính là một tổ chức — tổ chức
`kind = 'platform'`.

| | B2C | B2B |
|---|---|---|
| Vào hệ thống | tự đăng ký ở `/signup` | tài khoản do trường cấp, hoặc mã truy cập |
| Trang riêng | `/catalogue` | `/o/<slug>` mang logo và màu của trường |
| Trả tiền | credit — mua hoặc nhập mã | trường trả theo gói, học sinh không trả |
| Đề | danh mục công khai | ngân hàng đề riêng, không ai khác thấy |
| Vai trò | candidate | owner / admin / teacher / candidate |

Đổi thương hiệu ở **Admin → Branding**: tên, tagline, logo (upload PNG/SVG), 6 màu, và có
xem trước ngay màn hình thi. Mỗi tổ chức một bộ.

---

## Các dạng câu hỏi

Bao phủ cả chuẩn quốc tế lẫn format đề chuyên Anh / học sinh giỏi Việt Nam.

| Nhóm | Dạng |
|---|---|
| Đọc hiểu | Multiple choice (1 đáp án / nhiều đáp án) · True-False-Not Given · Yes-No-Not Given · Short answer |
| Nối | Matching headings · matching information · matching features · matching sentence endings · multiple matching · **gapped text** (chọn câu điền vào chỗ trống) |
| Điền | Sentence / summary / note / table / flow-chart / form completion · diagram labelling |
| Từ vựng – ngữ pháp | **Multiple-choice cloze** · **open cloze** · **word formation** · **error identification** (bảng lỗi/sửa) · **sentence transformation** (có từ khoá bắt buộc và giới hạn số từ) |
| Viết | Task 1 / Task 2, đếm từ trực tiếp, chấm tay theo rubric |

Đề nhiều kỹ năng (`module: "mixed"`) hiển thị được cả `SECTION A/B/C` và `Part 1/2/3` bên trong.

---

## Import đề tự động: rule-based + AI

Upload `.docx`, `.pdf` hoặc `.txt` ở **Admin → Import a paper**.

1. **Trích văn bản** — `mammoth` cho Word, `pdf-parse` cho PDF.
2. **Bộ luật (chạy luôn, không tốn tiền)** — nhận `SECTION A`, `Part 2. (10 points)`,
   `Questions 12–18`, câu đánh số, và **tách được phương án bị dính liền một dòng**
   (`...?A. abcB. defC. ghi` → 4 lựa chọn riêng), điều mà Word thường gây ra. Đọc luôn
   bảng đáp án ở cuối bài bằng cách dò *số câu kế tiếp* thay vì đoán dấu phân cách, nên
   đọc đúng cả `1 ii 2 iv 3 iii` lẫn đáp án nhiều chữ hay đáp án là con số. Bỏ qua bảng
   "Your answers" trống.
3. **Lượt AI** — gửi văn bản thô + khung do bộ luật dựng cho model, yêu cầu trả JSON đúng
   schema, kèm hướng dẫn riêng cho từng dạng đề Việt Nam. Sau đó **hợp nhất**: cấu trúc lấy
   của model, đáp án nào model bỏ trống mà bộ luật đọc được thì bù vào.

Kết quả hiện ra để duyệt (số part, dạng bài từng nhóm, tỉ lệ câu đã có đáp án, cảnh báo) rồi
mới bấm lưu. Ba chế độ: `hybrid` (mặc định), `rules` (không gọi API), `ai`.

Thư mục `samples/` có sẵn 5 đề thật để thử ngay.

**Nhà cung cấp AI** — đặt một key vào `.env`, hệ thống tự nhận:

```env
AI_PROVIDER="anthropic"          # anthropic | openai | google | none
ANTHROPIC_API_KEY="sk-ant-..."   # ANTHROPIC_MODEL="claude-sonnet-4-5"
OPENAI_API_KEY="sk-..."          # OPENAI_MODEL="gpt-4o"
GOOGLE_API_KEY="..."             # GOOGLE_MODEL="gemini-2.0-flash"
```

Không có key nào thì import vẫn chạy bằng bộ luật. Ba provider gọi thẳng qua `fetch`,
không kéo SDK — đổi provider là đổi một biến môi trường.

---

## Kỳ thi, chấm bài, báo cáo

**Kỳ thi (Sittings)** — chọn đề, đặt giờ mở/đóng, ghi đè thời lượng, sinh mã vào thi.
Màn hình theo dõi cho biết ai đang làm, còn bao lâu, và nhật ký giám thị của từng người.

**Chống gian lận** — chặn copy/paste, ghi lại mỗi lần thí sinh rời khỏi cửa sổ (kèm số giây),
khoá part đã rời, và tuỳ chọn giữ điểm cho tới khi chấm xong. Bật/tắt theo từng kỳ thi hoặc
theo mặc định của tổ chức.

**Chấm tay** — hàng đợi chỉ chứa bài có phần Viết. Màn hình chấm đặt bài viết cạnh rubric
(mỗi tiêu chí một thanh trượt), có ô nhận xét, và tự quy ra điểm theo trọng số của câu.
Chấm xong bài tự chuyển sang trạng thái `marked` và cộng vào tổng.

**Báo cáo** — phổ điểm, câu sai nhiều nhất, lọc theo lớp, xuất CSV.

---

## Chấm tự động

`src/lib/grading.ts` chuẩn hoá đáp án theo cách một giám khảo người thật vẫn chấp nhận: bỏ
qua hoa thường, dấu câu hai đầu, khoảng trắng thừa, mạo từ đứng đầu. Trong ô *đáp án chấp
nhận* có thể viết:

* mỗi dòng một đáp án đúng;
* `colour|color` — hai cách viết đều được;
* `(the) railway` — phần trong ngoặc là tuỳ chọn.

Câu nhiều ô (error correction) phải đúng **tất cả** các ô mới tính điểm. Câu viết lại câu
(sentence transformation) còn kiểm tra từ khoá bắt buộc có xuất hiện không và số từ có nằm
trong giới hạn không. Điểm thô quy sang band theo bảng ở `src/lib/bands.ts`; đề `mixed` chỉ
báo điểm, không quy band.

---

## Thanh toán

Đơn vị tính là **credit**. Credit vào tài khoản theo hai đường: mã truy cập do trường phát
(**Admin → Access codes**), hoặc một đơn hàng. `src/lib/payments.ts` định nghĩa interface
`PaymentProvider` với hai hàm `start` và `confirm`; hiện có sẵn provider `manual` (chuyển
khoản — admin xác nhận). Cắm VNPay / MoMo / Stripe chỉ là viết thêm một provider và trỏ
webhook vào `confirm`, không phải sửa chỗ nào khác.

---

## Cấu trúc thư mục

```
src/
  app/
    page.tsx  catalogue/  signup/  login/  join/     # B2C
    o/[slug]/                                        # trang riêng của trường (B2B)
    dashboard/  test/[id]/  results/[id]/            # luồng thí sinh
    admin/                                           # console của tổ chức
      tests/  import/  sessions/  marking/  reports/  people/  branding/  codes/
    platform/                                        # quản trị toàn nền tảng
    api/                                             # REST endpoints
  components/
    exam/          ExamShell, PassagePane, QuestionGroupView, BottomBar…
    admin/         TestEditor, ImportWizard, SessionManager, MarkingPanel, ReportsView…
  lib/
    db.ts          toàn bộ SQL nằm ở đây (đổi sang Postgres là sửa một file)
    auth.ts        session JWT trong cookie httpOnly + vai trò theo tổ chức
    grading.ts     chuẩn hoá đáp án + chấm
    brand.ts       token màu, áp bằng CSS variables
    highlight.ts   bôi vàng theo offset ký tự
    payments.ts    interface cổng thanh toán
    parse/         extract → rules → ai → normalize
  types/exam.ts    mô hình đề (ExamContent)
scripts/           seed.ts, seed-content.ts, seed-chuyen.ts
samples/           5 đề thật để thử import
```

Toàn bộ nội dung một bài thi là **một document JSON** trên bảng `tests`. Bộ import chỉ cần
sinh đúng cấu trúc đó, và trình soạn đề chỉ sửa đúng cấu trúc đó.

---

## Bảo mật cần làm trước khi chạy thật

* Đổi `SESSION_SECRET` thành chuỗi ngẫu nhiên ≥ 32 ký tự.
* Chạy sau HTTPS (cookie đã bật `secure` khi `NODE_ENV=production`).
* Mật khẩu băm bằng `scrypt` kèm salt riêng từng tài khoản.
* Đồng hồ thi lấy từ `endsAt` trong database — client chỉ hiển thị.
* Chấm bài chạy hoàn toàn ở server; đáp án không bao giờ gửi xuống trình duyệt khi đang thi.
* Mọi API quản trị đi qua `staffContext()`, và mọi bản ghi đều kiểm tra `orgId` — một tổ
  chức không đọc được dữ liệu của tổ chức khác kể cả khi đoán đúng id.

---

## Lệnh

```bash
npm run dev        # dev server
npm run build      # build production
npm run start      # chạy bản build
npm run typecheck  # kiểm tra TypeScript
npm run seed       # tạo lại dữ liệu mẫu
```
