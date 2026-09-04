# Testora — nền tảng khảo thí trên máy

Phần mềm thi trên trình duyệt: giao diện thí sinh dựng theo chuẩn computer-delivered,
trang quản trị đầy đủ, hỗ trợ cả **B2C** (học sinh tự đăng ký, mua credit) và **B2B**
(trường / trung tâm có không gian riêng, logo riêng, lớp riêng, kỳ thi riêng).

Thương hiệu, màu sắc và logo đều cấu hình được — không gắn với bất kỳ tổ chức khảo thí nào.

---

## Chạy thử trong 2 phút

Cần một **PostgreSQL** (local, Neon, Supabase hay Vercel Postgres đều được) và **Node 20 trở lên**.

```bash
cp .env.example .env         # điền DATABASE_URL
npm install
npm run dev                  # http://localhost:3000 — bảng tự tạo ở request đầu tiên
npm run seed                 # tuỳ chọn: tổ chức mẫu + tài khoản + đề mẫu
```

Không seed thì lần đầu vào web sẽ là màn `/setup` để tạo tài khoản quản trị.

```env
DATABASE_URL="postgres://user:password@host:5432/testora"
SESSION_SECRET="ít nhất 32 ký tự ngẫu nhiên"
```

**Lần đầu vào web** mọi đường dẫn bị đưa về `/setup`, gồm hai bước bắt buộc:

1. **Storage** — khai báo nơi lưu chính: **Hugging Face dataset (private)** hoặc bucket
   R2/S3. Credential của nơi này lưu vào **file local** đã mã hoá (`data/root-storage.json`),
   không vào database. Máy chủ không ghi được đĩa (serverless) thì màn hình đưa luôn danh sách
   biến môi trường để dán.
2. **Administrator** — tài khoản quản trị nền tảng, đồng thời tạo tổ chức nền tảng và không gian
   cộng đồng.

`npm run seed` tạo sẵn admin nên chỉ còn bước 1.

Toàn bộ SQL nằm trong `src/lib/db.ts`; migrate chạy được nhiều lần, thêm cột mới cũng không
làm hỏng dữ liệu cũ.

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin@testora.test` | `admin1234` | Quản trị nền tảng (thấy mọi tổ chức) |
| `owner@chuyen.test` | `owner1234` | Chủ sở hữu trường |
| `teacher@chuyen.test` | `teach1234` | Giáo viên — chấm bài, tạo kỳ thi |
| `candidate@chuyen.test` | `test1234` | Thí sinh của trường |
| `learner@testora.test` | `test1234` | Học sinh tự đăng ký (B2C) |

Mã có sẵn sau khi seed:

| Mã | Loại | Tác dụng |
|---|---|---|
| `COMMON` | mã tham gia | vào **không gian cộng đồng** — kho đề chung, free access |
| `CHUYEN` | mã tham gia | vào trường mẫu, thấy ngân hàng đề của trường |
| `TESTORA` | mã tham gia | vào tổ chức nền tảng (kho đề riêng của admin) |
| `CHUYEN1` | mã vào phòng thi | mở thẳng kỳ thi đã lên lịch của lớp 10A1 |

Nhập ở ô **Join or access code** lúc `/signup`, hoặc bất cứ lúc nào ở `/join`.

---

## Lưu trữ: Hugging Face (chính) + R2 (dự phòng)

Mọi file và mọi cấu hình nhạy cảm nằm trên storage, **không dùng database**:

* **Nơi lưu chính** khai báo ở bước setup — thường là một **dataset private trên Hugging Face**.
  Credential của nó nằm trong file local đã mã hoá (hoặc biến `HF_TOKEN` + `HF_REPO`). Đây là thứ
  duy nhất không ở trên cloud, vì nó là chìa khoá của những thứ còn lại.
* **Mọi cấu hình khác** — danh sách nơi lưu phụ và token/key của chúng, API key AI, mật khẩu SMTP,
  quy tắc xoá file — nằm trong **một object mã hoá AES-256-GCM** (`testora/config/vault.enc`) ngay
  trong repo/bucket chính. Database rò rỉ cũng không lộ một credential nào.

### Gửi file binary lên Hub: Xet / git-lfs, không nhét vào commit

Hub **từ chối** nội dung binary gửi kèm trong commit:

```
400 Your push was rejected because it contains binary files.
    Please use https://huggingface.co/docs/hub/xet to store binary files.
```

Mà PDF, .docx, MP3 thì **đúng là binary** — không sửa được chỗ đó, và cũng không cần: chỉ cần gửi
đúng cửa. `src/lib/storage/hf.ts` giờ có ba tầng:

1. **Client chính chủ của Hub** (`@huggingface/hub`, `useXet: true`) — nói **Xet** (đúng thứ thông
   báo lỗi trỏ tới), tự lùi về git-lfs với repo chưa bật Xet. Đây là đường mặc định.
2. **git-lfs làm bằng tay** (chỉ `fetch`): `preupload` hỏi Hub muốn nhận kiểu nào → `objects/batch`
   xin chỗ đặt bytes → `PUT` lên đó → commit một con trỏ. Dùng khi client kia không chạy được
   (runtime không có WASM, server chặn) — một trường không nên cần WASM chunker để lưu file đáp án.
3. **Commit inline như cũ** cho file text nhỏ: một request thay vì bốn.

Cộng ba đường lùi tự động: server nói "regular" rồi từ chối commit → gửi lại kiểu lfs; không có
endpoint `preupload` → tự quyết theo nội dung (có byte NUL trong 8 KB đầu là binary, đúng phép thử
git dùng); và **đọc lại** file lfs thì `resolve` trả 302 sang CDN — hop đó phải đi **không kèm
token**, vì URL đã được ký cho một request không có `Authorization` (kèm vào là object store từ
chối). Trần kích thước lên **200 MB**, nên bài nghe 20 phút không còn bị chặn ở 9 MB nữa.

`npm run verify:storage` dựng ba Hub giả — một Hub hiện tại, một Hub không có `preupload`, một Hub
nói "regular" rồi từ chối bằng đúng câu trên — cộng một "object store" ở origin riêng để bắt lỗi gửi
token vào URL đã ký. 27 phép kiểm, không cần mạng, không cần token.

### Đọc PDF: đổi hẳn thư viện

Lỗi *"upload PDF nào cũng lỗi"* còn một nửa nữa, và nửa này tệ hơn: `pdf-parse` (mang theo pdf.js
bản 2018, đã bỏ maintain) **đọc quá đuôi buffer** nó được đưa. Node thì pool buffer nhỏ — một PDF
1,6 KB đọc từ đĩa thường là *view* vào một khối 8 KB dùng chung (`byteOffset` 2544, `length` 1667,
`buffer.byteLength` 8192) — nên nó parse luôn 8 KB bộ nhớ của người khác và văng
`bad XRef entry` / `Command token too long: 128`. Cùng một file, lúc được lúc không, tuỳ Node đặt nó
ở đâu: thêm một dòng `Buffer.allocUnsafe(1000)` vô nghĩa trước lời gọi là đủ để biến một lần đọc
thành công thành thất bại. Đó là lý do upload lại bao nhiêu lần cũng vậy.

Giờ đọc bằng **`unpdf`** (pdf.js hiện tại, đóng gói cho server, không cần worker/browser), bytes
được copy sang mảng sở hữu đúng vùng nhớ của nó, và nếu máy có **poppler** thì lấy thêm
`pdftotext -layout` — bản này giữ cột và bảng đáp án tách nhau — dùng khi nó cho nhiều nội dung hơn.
`npm run verify` có ba phép kiểm chạy đúng cái trò dịch pool ở trên.

### Đề công khai vào public, đề của trường vào private

| Đề của | Đi vào |
|---|---|
| Không gian cộng đồng và tổ chức nền tảng | **dataset public** trên Hugging Face — ai cũng đọc được, phục vụ kho đề chung |
| Trường / trung tâm (tenant) | **dataset private** của chính họ — không có token thì không đọc được |

Quy tắc này nằm trong code (`targetsFor`), không phụ thuộc người dùng chọn đúng: đề của tenant
**không bao giờ** được ghi vào repo public.

* **Admin thêm được nhiều nơi lưu** (Platform → Storage) và bật *Write every upload to all enabled
  buckets* để **ghi song song** — Hub đi trước, R2/S3 là bản sao dự phòng; hỏng một nơi thì báo
  riêng nơi đó chứ không làm hỏng cả lần import.
* **Mỗi org thêm nơi lưu riêng** (Admin → Storage) và vẫn dùng được kho chung của nền tảng.
* Nút **Test** tạo repo nếu chưa có, ghi thử một file rồi xoá — "kết nối được" nghĩa là ghi được thật.
* Hub nhận file tới 10 MB qua commit API; file lớn hơn thì để R2/S3 giữ.

### Liên kết Hugging Face bằng SSO (không cần dán token)

Tạo một OAuth app ở **huggingface.co → Settings → Connected Applications → New application**,
redirect URI đúng bằng `https://<tên-miền>/api/auth/hf/callback`, rồi điền Client ID ở
**Platform → Sign-in** (hoặc biến `HF_OAUTH_CLIENT_ID`). Sau đó:

* **Nối storage bằng SSO** — nút *Connect a private dataset* / *Connect a public dataset* ở màn
  Storage (và ngay ở bước 1 của `/setup`). Bấm → đăng nhập trên huggingface.co → quay về. Hệ thống
  xin scope `contribute-repos write-repos`, **tự tạo dataset** dưới namespace của tài khoản đó rồi
  lưu luôn thành nơi chứa đề. Không gõ token nào.
* **Đăng nhập bằng Hugging Face — chỉ dành cho admin và giáo viên.** Nút *Continue with Hugging
  Face* không hiện ở màn đăng nhập của thí sinh; nhân viên vào bằng `/login?staff=1`. Tài khoản
  được khớp theo Hub id, rồi theo email đã xác minh, cuối cùng mới tạo mới — nên người đã có tài
  khoản mật khẩu bấm nút này vẫn vào đúng tài khoản cũ. Thí sinh bấm vào (hoặc gọi thẳng API) sẽ
  bị từ chối: các em đăng nhập bằng tài khoản trường phát. Bật/tắt và chặn tạo tài khoản mới ở
  **Platform → Sign-in**.
* **Đăng nhập / nối bằng token** — chỗ nào redirect không về được (mạng nội bộ, kiosk) thì dán
  personal access token. Token dùng một lần để nhận diện tài khoản, không lưu lại.

Một điểm cần biết: **token OAuth của Hub có hạn** (khoảng 8 tiếng) và Hub không phát refresh token.
Nối bằng SSO là cách nhanh để bắt đầu; máy chủ chạy lâu dài không ai trông thì nên dán **write
token** (loại không hết hạn) trong phần *Add a place to store papers*. Console hiển thị rõ nguồn
credential của từng nơi lưu.

### Xoá file sau khi parse

Word/PDF chỉ tồn tại đúng bằng thời gian mình cho phép — xoá khỏi **mọi** nơi đã ghi, cả Hub lẫn
bucket:

| Cấu hình | Hành vi |
|---|---|
| *Delete as soon as parsing finishes* (mặc định) | parse xong là xoá khỏi mọi bucket ngay |
| 1 giờ / 24 giờ / 7 ngày / 30 ngày | giữ đúng ngần ấy rồi job dọn xoá |
| *Keep until deleted by hand* | giữ cho tới khi xoá tay |

Org đặt được quy tắc riêng, **chỉ chặt hơn** quy tắc nền tảng chứ không lỏng hơn. Parse lỗi thì file
bị xoá ngay lập tức. Job dọn chạy **một lần mỗi ngày, 03:00 UTC** (`crons` trong `vercel.json` gọi
`/api/maintenance/sweep`, cần đặt `CRON_SECRET`), và mỗi lần có người mở màn Import thì cũng dọn
thêm một lượt — nên không có cron vẫn sạch.

Cron chạy **một lần mỗi ngày (03:00 UTC)** — `vercel.json` → `crons`. Muốn dọn ngay thì platform admin
mở `/api/maintenance/sweep` bằng tay, và màn Import cũng tự dọn mỗi lần mở.

Một chi tiết nhỏ nhưng quan trọng: bản ghi chỉ được đánh dấu "đã xoá" khi **mọi** bản copy xoá thành
công. Bucket lỗi hay Hub không với tới thì bản ghi giữ nguyên khoá để lượt dọn sau xoá lại, chứ không
mất dấu file đang còn nằm trên storage.

---

## Email và xác minh (SMTP)

Cấu hình ở **Platform → Email**. Chỉ một quy tắc:

| Trạng thái SMTP | Đăng ký cần gì | Tài khoản cũ |
|---|---|---|
| **Chưa cấu hình / tắt** | username + mật khẩu (email để trống cũng được) | không ai bị hỏi gì |
| **Bật + "Require a confirmed address"** | email + mật khẩu, rồi nhập mã 6 số gửi về hộp thư | lần vào tiếp theo bị đưa tới `/verify` để **bổ sung email và xác minh** |

Chi tiết:

* mã 6 số, sống 20 phút, sai quá 6 lần thì phải xin mã mới; xin mã mới là mã cũ hết hiệu lực;
* mật khẩu SMTP mã hoá AES-256-GCM trước khi lưu, giao diện chỉ thấy bản che;
* nút **Send a test** kiểm tra kết nối, điền địa chỉ thì gửi thư thật;
* tắt "Require a confirmed address" thì vẫn gửi được thư nhưng không ai bị chặn;
* cấu hình bằng biến môi trường cũng được (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME`) — cài trong console thì thắng.

Hai cổng chặn này (`/setup` và `/verify`) nằm trong `src/lib/gate.ts`, gọi từ root layout, nên
không trang nào lọt.

---

## Deploy lên Vercel

**Không cần dán connection string, không cần chạy lệnh nào.**

1. Import repo vào Vercel và deploy (build không đụng tới database nên luôn chạy được).
2. Vào **Storage → Create Database → Postgres** (Neon/Supabase cũng được) rồi **Connect** vào
   project. Vercel tự đặt biến `POSTGRES_URL` / `DATABASE_URL`.
3. **Redeploy**. Request đầu tiên tự tạo toàn bộ bảng rồi đưa bạn tới `/setup` để tạo tài khoản
   quản trị.

Chưa gắn database thì web vẫn lên, chỉ hiện một trang hướng dẫn đúng ba bước trên thay vì lỗi.

Biến môi trường: đều **tuỳ chọn**.

| Biến | Khi nào cần |
|---|---|
| `DATABASE_URL` / `POSTGRES_URL` | Vercel Storage tự đặt. Tự host thì đặt tay. |
| `SESSION_SECRET` | Nên đặt (≥ 32 ký tự). Không đặt thì khoá ký cookie được dẫn xuất từ chính connection string — vẫn ổn định, nhưng đổi database là mọi người phải đăng nhập lại. |
| `HF_TOKEN`, `HF_REPO` | Chỉ khi máy chủ không ghi được file local (serverless). `HF_REPO` dạng `namespace/name`; tuỳ chọn `HF_REVISION`, `HF_ENDPOINT`. |
| `HF_OAUTH_CLIENT_ID`, `HF_OAUTH_CLIENT_SECRET` | Cho nút đăng nhập / nối storage bằng Hugging Face. Bỏ secret trống là public app, vẫn an toàn nhờ PKCE. |
| `R2_*` | Như trên, nếu chọn R2 làm nơi lưu chính: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, tuỳ chọn `R2_ENDPOINT`, `R2_REGION`, `R2_PUBLIC_BASE_URL`. |
| `TESTORA_ROOT_CONFIG` | Đổi đường dẫn file credential local (mặc định `data/root-storage.json`). |
| `CRON_SECRET` | Cho job dọn file hết hạn trên Vercel. |
| `SMTP_*` | Chỉ khi muốn cấu hình mail bằng biến môi trường thay vì giao diện. |
| `ANTHROPIC_API_KEY`, … | Chỉ khi muốn cấu hình AI bằng biến môi trường thay vì giao diện. |

Những thứ đã chỉnh sẵn cho môi trường serverless:

* **schema tự tạo lúc chạy**, không phải lúc build: request đầu tiên chạy migrate dưới một
  advisory lock nên nhiều instance khởi động cùng lúc cũng không giẫm chân nhau;
* pool mặc định **1 kết nối** mỗi instance khi `VERCEL=1` (đổi bằng `PGPOOL_MAX`), giữ trên
  `globalThis` để hot reload không mở thêm pool;
* `pg` để ngoài bundler (`serverComponentsExternalPackages`);
* mọi route API khai báo `runtime = 'nodejs'` và `dynamic = 'force-dynamic'`;
* import đề và nộp bài được nâng `maxDuration` lên 60 giây;
* SSL bật sẵn cho host từ xa, tắt khi `DATABASE_URL` trỏ về localhost.

---

## Giao diện

Hai bề mặt, cố ý khác nhau:

* **Màn hình thi và test report** bám theo bản gốc computer-delivered: nền trắng, thanh thời
  gian trên cùng, thanh điều hướng câu hỏi dưới cùng, các tuỳ chọn tương phản và cỡ chữ.
* **Phần còn lại của portal** (trang chủ, đăng nhập, chọn đề, console) theo đúng ngôn ngữ của
  portal thí sinh: nền trắng, dải xám bên trái ở màn đăng nhập, chữ đen, **một** màu hành động
  là xanh của tổ chức, đường kẻ mảnh, không đổ bóng, không gradient.

Token nằm ở `src/app/globals.css` (`--paper*`, `--line*`, `--brand*`); đổi màu tổ chức trong
**Admin → Branding** là đổi cả hai bề mặt.

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

### Trường xin không gian riêng: đơn đăng kí, admin duyệt

`/apply` là form công khai (không cần tài khoản): **tên tổ chức, người liên hệ, email, số điện
thoại, số lượng thí sinh, website, và lý do chi tiết** (bắt buộc ít nhất 60 ký tự — vài câu về
trung tâm, thi gì, bao giờ bắt đầu). Gửi xong đơn vào hàng chờ của platform admin, và nếu có SMTP
thì admin cũng nhận được email kèm link duyệt.

Ở **Platform → Applications** (tab có badge đỏ số đơn đang chờ), admin đọc đơn rồi:

* **Approve** — tạo tổ chức (slug tự sinh từ tên, tránh trùng), tạo tài khoản **owner** cho người
  liên hệ, gắn membership, rồi email username + mật khẩu cho họ. Không có SMTP thì mật khẩu hiện
  **một lần** trên màn admin để tự chuyển — sau đó không đọc lại được ở đâu.
* **Decline** — bắt buộc ghi lý do, và lý do đó được gửi cho người đăng kí.

Không ai tự tạo được tổ chức: form chỉ tạo *đơn*, tổ chức chỉ sinh ra khi có người duyệt. Chống spam:
một đơn đang chờ cho mỗi email, tối đa 3 đơn/ngày/email, mọi trường bị giới hạn độ dài.

### Mã tham gia và không gian cộng đồng

Mỗi tổ chức có một **mã tham gia** (Admin → People → Join code). Thí sinh gõ mã lúc đăng ký
là vào thẳng tổ chức đó; phát lại mã mới thì mã cũ hết hiệu lực ngay, người đã vào vẫn ở lại.

Ba loại tổ chức:

| `kind` | Là gì | Đề |
|---|---|---|
| `platform` | tổ chức mang thương hiệu trang chủ, là **kho đề riêng của admin** | riêng tư |
| `community` | **không gian cộng đồng**, ai có mã của admin cũng vào được | kho đề chung, free access |
| `tenant` | trường / trung tâm B2B | ngân hàng đề riêng |

Đề riêng tư luôn phải thuộc về một tổ chức: muốn thêm đề không công khai thì tạo (hoặc vào)
một org rồi upload ở đó. Ai không nhập mã nào vẫn đọc được kho đề chung.

Đổi thương hiệu ở **Admin → Branding**: tên, tagline, logo (**upload ảnh cỡ nào cũng được** — trình duyệt tự thu về 480×160, nén WebP xuống dưới 120 KB rồi mới lưu; SVG giữ nguyên), 6 màu, và có
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

## Bài thi IELTS chia theo kỹ năng

Riêng đề IELTS được gộp thành một **bài thi đầy đủ** (Admin → Full tests): mỗi kỹ năng là một
đề riêng, thời gian riêng, điểm riêng.

Thí sinh mở `/suite/<id>` và thấy đúng luồng của kỳ thi trên máy: từng kỹ năng ghi *Not
completed* (đỏ) hoặc *Completed* (xanh), thời lượng, và một khối **Test information. Not
confirmed.** mở ra là video hướng dẫn của phần đó cùng nút **I confirm**. Xác nhận xong mới
hiện nút bắt đầu. Nộp bài xong quay lại đúng màn hình này để làm kỹ năng kế tiếp.

Video mặc định (đổi được từng mục khi soạn bài thi):

```
https://static.gelnet.org/cdielts/listening.mp4
https://static.gelnet.org/cdielts/reading.mp4
https://static.gelnet.org/cdielts/writing.mp4
```

Làm xong **tất cả** các kỹ năng mới hiện **test report**: mỗi kỹ năng một dòng band, một
band tổng (trung bình cộng làm tròn về nửa band gần nhất), kèm giải thích band đó nghĩa là
gì. Band tổng chỉ hiện khi mọi kỹ năng đã có điểm — bài Viết còn chờ chấm thì ghi *Pending*.

Kỹ năng thi ngoài hệ thống (ví dụ Speaking) đặt `mode: 'offline'`, giáo viên nhập band tay ở
**Admin → Full tests → roster**.

Đề không phải IELTS thì không chia kỹ năng: nộp xong ra thẳng màn hình xem lại đáp án.

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

4. **Sửa để thi được** — một đề parse ra mà thí sinh không bấm được thì vô dụng, nên trước khi lưu
   hệ thống tự vá: câu trắc nghiệm bị dính đáp án vào đề bài (`...usage?A. ...B. ...` — lỗi Word
   thường gặp nhất) được tách lại thành A/B/C/D; nhóm matching mất danh sách lựa chọn thì đổi thành
   câu tự điền; câu không có gap trong đoạn text thì được hỏi ngay bên dưới đoạn đó; gap thừa không
   có câu nào thì thành dấu gạch; dòng error-correction thiếu cột thì được cấp một ô. Mọi thay đổi
   đều ghi lại thành cảnh báo để giáo viên biết chỗ nào cần sửa tay.
5. **Viết đáp án nếu đề không có** — bật *Write the answer key where the paper has none*: model đọc
   đoạn text rồi điền đáp án cho những câu chưa có, mỗi đáp án bị đánh dấu **"written by AI — check
   it"** trong editor và dấu này tự mất khi có người sửa. Đáp án đã in trong đề **không bao giờ** bị
   ghi đè.

### Upload ảnh chụp / PDF scan — AI vision

Đề chỉ có **ảnh chụp** (PNG/JPG) hoặc **PDF scan không có text layer** vẫn import được: hệ thống nhận
ra (PDF dưới ~220 ký tự/trang là scan), render từng trang thành ảnh bằng `pdftoppm` rồi gửi cho
provider **Reading photographs and scans**, kèm prompt riêng bắt giữ nguyên gạch chân và layout đáp
án. Tối đa 12 trang/lần upload, file tới 40 MB. Không có `pdftoppm` trên máy chủ thì endpoint dạng
Anthropic vẫn nhận thẳng PDF; còn lại hệ thống nói rõ là hãy upload ảnh từng trang.

### Định dạng trong đề: gạch chân, in đậm, đáp án nằm ngang

Đề thật rất đa dạng nên hai thứ này được giữ nguyên:

* **Gạch chân và in đậm/in nghiêng** — `<u> <b> <i> <sup> <sub>` được giữ từ Word (mammoth style map),
  từ AI, và từ vision; render trong phòng thi, trong editor và trong bank/rubric. Từ bị gạch chân
  thường chính là từ đang được hỏi nên đây là *nội dung*, không phải trang trí. Mọi HTML khác bị lọc
  bằng whitelist (`src/lib/sanitize.ts`) — thẻ `<script>` trong đề bị bỏ, không chạy.
* **Đáp án A B C D nằm ngang** — mỗi nhóm có `optionLayout`: `row` (một dòng, như đề in),
  `stack` (mỗi đáp án một dòng), hoặc `auto` (đáp án ngắn thì nằm ngang). Bộ luật tự đặt `row` khi
  đáp án in liền một dòng và `stack` khi mỗi đáp án một dòng; giáo viên đổi được ngay trên editor.

### Đề có phần nghe: tự tách thành 2 bài

Không ai làm phần nghe và phần viết trong cùng một lượt được — băng chạy một lần. Nên đề upload có cả
**listening** và phần khác sẽ **tự tách**: bài nghe một paper, phần còn lại một paper (IELTS thì tách
theo cả ba kỹ năng), rồi **gộp thành một full test** đúng thứ tự nghe → đọc → viết. Đề IELTS được
nhận ra qua tên và cấu trúc (Task 1 + Task 2, band score, Academic/General) và luôn xếp thành full
test.

Paper nghe sinh ra ở trạng thái **draft** và **không publish được khi chưa có file nghe** (API trả
409 kèm tên part còn thiếu).

**Một file nghe chạy cả bài, hay mỗi part một file — tuỳ đề.** Đề nghe thật hầu hết là **một băng
duy nhất** chạy suốt từ Part 1 đến Part 4 không dừng, nên file nghe thuộc về **cả paper** chứ không
thuộc một part. Editor của paper có hai ô:

* **Recording for the whole paper** — một file cho cả bài, có ghi rõ nó chạy qua những part nào.
  Thí sinh bấm play **một lần**, và băng **không dừng khi chuyển part**: player được mount ở ngoài
  vùng part nên đổi part không huỷ nó (đây là điểm dễ sai nhất — để player trong vùng part thì React
  dựng lại và băng đứt).
* **Recording for Part n** — chỉ dùng cho đề mà mỗi part thật sự là một file riêng. Part nào có file
  riêng thì phát file của nó, còn lại phát băng của cả paper (`audioFor()` trong `src/types/exam.ts`
  là quy tắc duy nhất, dùng chung cho dao diện thi và cho mọi chỗ kiểm "đã có băng chưa").

Thông báo trước khi nghe cũng đổi theo: một băng cho cả bài thì thông báo **một lần**, ghi rõ *"One
recording covers all 3 parts (Part 1, Part 2, Part 3)"* và tổng số câu của cả paper.

**Reload không làm băng chạy lại từ đầu.** Lúc bấm play, hệ thống ghi một sự kiện `audio-start` vào
sổ giám thị của lượt thi. Vào lại trang (F5, mất mạng, đổi tab) thì băng **tiếp tục đúng chỗ nó
đáng ra đang ở** (`resumeFrom` = thời gian đã trôi), và nếu băng đã hết thì hiện *"The recording has
finished"* chứ không phát lại — trước đây reload là một cách nghe lại băng.

Hoặc dán link nếu trường đã host sẵn. File nhỏ vào Hugging Face (≤ 9 MB/commit), file lớn vào R2/S3, và
`/api/media` phát cho thí sinh đã đăng nhập đúng org (hỗ trợ Range để phát ngay, nhưng dao diện thi
không có thanh tua).

**Trong phòng thi**: trước phần nghe có **thông báo** — băng chạy một lần từ đầu đến cuối, không
pause, không tua lại, chạy trong khi làm bài — và một nút **Play the recording and begin**. Bấm rồi
thì băng chạy nền; mọi thao tác tua/pause (media key, tai nghe, devtools) đều bị đưa về đúng vị trí
đang phát. Riêng **câu hỏi thì xem lại thoải mái**: khoá part (`lockPartOnLeave`) mặc định **tắt**,
chỉ bật khi trường muốn.

### Đáp án là file riêng — và rubric chấm nằm trong đáp án

Rất nhiều đề phát hành **hai file**: đề cho học sinh, đáp án cho giáo viên. Màn **Import a paper** vì
thế có ô thứ hai: **"Answer key, if it came as a separate file"**. Ba trường hợp, ba cách xử lý:

| Đề | Cách làm |
|---|---|
| Đáp án in trong đề | upload một file, bộ luật đọc key ngay trong đó |
| Đáp án là file riêng | upload cả hai; key được đọc rồi khớp vào đúng số câu |
| Không có đáp án | upload một file, AI viết đáp án (đánh dấu *supplied by AI*) |

Cách đọc file đáp án, theo đúng thứ tự rẻ trước:

1. **Bộ luật đọc trước, không tốn tiền.** Với file đáp án thì *cả file là đáp án*, nên không cần đi
   tìm dòng tiêu đề "ANSWER KEY" nữa (`parseAnswerKey(text, { whole: true })`) — đúng cái làm cho
   một danh sách `1. A / 2. B / 3. C` trước đây bị đọc thành rỗng.
2. **Còn câu nào trống thì mới gọi AI** (`readAnswerKey`), kèm danh sách số câu phải trả lời và lệnh
   *"copy, never solve"* — model **chép** đáp án in trên giấy, không tự làm bài; câu nào key không
   có thì để trống.
3. **Rubric chấm trong đáp án được giữ lại.** Key của đề Việt Nam gần như luôn kèm hướng dẫn chấm —
   *"Nội dung 1,0đ · Ngôn ngữ 0,75đ · Hình thức 0,25đ · Trừ 0,25đ cho mỗi 3 lỗi chính tả"*. Phần đó
   vào `content.markingNotes` (bộ luật nhận ra qua dòng *HƯỚNG DẪN CHẤM / THANG ĐIỂM / MARKING
   SCHEME*, hoặc AI trích ra), rồi:
   * hiện ngay trên màn chấm tay, khối **"How this paper says to mark it"**;
   * gửi cho AI chấm **đứng trước** mọi tiêu chí chung, kèm câu "rubric của đề này thắng tiêu chí
     mặc định ở đâu hai bên khác nhau";
   * sửa được bằng tay trong trình soạn đề.

**Sách thì key khớp theo từng đề.** Upload cả quyển kèm một file đáp án cho cả quyển: file key được
cắt theo đúng `TEST n` / `ĐỀ SỐ n` rồi trả về đúng đề của nó. Nếu file key **không** có tiêu đề để
cắt mà quyển sách có nhiều đề, hệ thống **không áp** và nói rõ lý do — câu 3 của Test 7 không phải
câu 3 của Test 1.

### Không giới hạn thời gian

`durationMinutes = 0` nghĩa là **không tính thời gian**: không đồng hồ, không tự submit, làm hôm nay
mai vào làm tiếp (đáp án tự lưu). Đề không ghi thời gian thì import ra 0 thay vì bị gán bừa 60 phút.
Header hiện "No time limit" thay cho đồng hồ.

### Đề dài không còn làm hỏng lượt parse

Đề dài (60–80 câu) sinh ra JSON dài hơn cả đề, và model hết hạn mức output là JSON bị cắt giữa
mảng — trước đây cả lượt AI bị bỏ, rơi về bộ luật, kèm lỗi kiểu
`Expected ',' or ']' after array element in JSON at position 72354`. Ba lớp xử lý:

1. **Đọc lại được JSON bị cắt** (`src/lib/ai/json.ts`) — cắt về phần tử cuối cùng còn nguyên, đóng
   lại mọi ngoặc/chuỗi đang mở, bỏ mẩu dở. Test cắt ở **mọi vị trí** của 3 dạng JSON: 761 điểm cắt,
   0 điểm không đọc được, 615 điểm vẫn còn nguyên `parts`.
2. **Không còn hạn mức output cứng** — mặc định request *không gửi* `max_tokens`, model trả bao
   nhiêu lấy bấy nhiêu (Platform → AI → **Longest reply, tokens**, để `0` = không giới hạn; chỉ đặt
   số khi gateway của bạn bắt buộc). Hệ thống vẫn đọc `finish_reason`/`stop_reason` để biết là
   "bị cắt" chứ không phải "đề sai". Với wire Anthropic — vốn bắt buộc có `max_tokens` — hệ thống
   xin 64k, và nếu model trả lời "tối đa của tôi là N" thì gọi lại đúng N thay vì báo lỗi.
3. **Đề quá dài thì đọc theo từng phần** — cắt theo đúng mốc in trên đề (`SECTION`, `PART`,
   `Questions 12–18`), gửi từng phần kèm ghi chú "đây là phần k/n, giữ nguyên số câu", rồi ghép lại.
   Số câu không bị đánh lại, và cảnh báo ghi rõ đã đọc mấy phần.

Kết quả trên đề 39k ký tự: trước là *AI pass failed* + rơi về bộ luật (mất hết options), giờ là
"đọc theo 4 phần" → 20 câu, câu nào cũng có options và đáp án.

**Parse chạy nền, xong vào thẳng kho đề** — upload xong API trả về trong ~1,5 giây; việc đọc đề diễn
ra ở nền và đề hoàn chỉnh vào **Papers** dưới dạng draft (tích một ô là publish luôn). Đóng tab hay
sang trang khác đều được; màn Import có bảng trạng thái tự cập nhật (*Waiting to start → Reading the
paper → In your papers*) kèm các cảnh báo của lần parse đó. Nếu worker chết giữa đường (redeploy,
crash), lượt dọn mỗi ngày và cả lần mở màn Import sau đó sẽ đọc lại file đã lưu và parse tiếp; file
không còn thì báo rõ là phải upload lại. Ba chế độ vẫn là `hybrid` (mặc định), `rules` (không gọi
API), `ai`.

Thư mục `samples/` có sẵn 5 đề thật để thử ngay.

**Hai AI riêng: một để đọc đề, một để chấm** — Platform admin → **AI settings** có công tắc
*One AI does both jobs* / *A separate AI for each*:

* **Reading papers** — parse đề upload, đặt gap, và viết đáp án khi đề không có.
* **Marking** — chấm bài viết theo rubric, và xử câu viết lại.
* **Reading photographs and scans** — AI vision, đọc đề chỉ có ảnh chụp hoặc scan (xem mục dưới).

Mỗi bên có **endpoint, API key, model, đơn giá và hạn mức riêng**, nên chạy được kiểu "model rẻ và
nhanh cho parse, model kỹ cho chấm, model nhìn được ảnh cho scan", hay self-host một bên còn bên kia
dùng dịch vụ. Tách ra thì cả ba bên được copy từ cấu hình đang chạy nên không có gì đứt giữa lúc
sửa; gộp lại thì giữ bên *Reading papers* làm provider chung. Mỗi bên có nút **Test the connection** riêng, in ra đúng
endpoint + model đã gọi, và `ai_usage` ghi rõ việc nào chạy trên model nào.

API key mã hoá AES-256-GCM trước khi lưu, không bao giờ gửi ngược về trình duyệt. Lời dặn gửi kèm
rubric nằm ở bên Marking.

**Đo lượng AI đã dùng** — mỗi lần gọi model đều ghi một dòng `ai_usage`: tổ chức nào gây ra,
việc gì, model nào, số token vào/ra, thành tiền, thành công hay không. Trường B2B tự upload
và parse đề thì dòng đó mang `orgId` của trường, nên **Platform → AI usage** cộng ra được
từng tổ chức tiêu bao nhiêu; chính trường cũng xem được phần của mình ở **Admin → AI usage**.

### Endpoint riêng: URL, key và model của bạn

Ngoài ba provider có sẵn, chọn **Custom endpoint** ở *Platform → AI settings* là dùng được bất kỳ
endpoint nào:

| Ô | Nghĩa |
|---|---|
| **Endpoint URL** | URL gốc, **không** kèm `/chat/completions` — hệ thống tự thêm. Bỏ dấu `/` cuối cũng được. |
| **Model name** | Gõ tự do, đúng như endpoint yêu cầu (`deepseek-chat`, `qwen2.5:14b-instruct`, tên deployment của Azure…). Không bị giới hạn theo danh sách. |
| **API format** | `openai` (đa số gateway và server tự chạy), `anthropic`, hoặc `google` — cùng ba dạng request/response mà bản gốc dùng. |
| **Send the key as** | `Authorization: Bearer`, `x-api-key`, `api-key` (Azure OpenAI), `?key=` trong URL, hoặc **không cần key** cho server chạy nội bộ. |
| **Extra headers** | Mỗi dòng một `Name: value`, cho gateway đòi thêm header (`HTTP-Referer`, `X-Title`…). `Authorization` và `content-type` do hệ thống đặt, không ghi đè được. |
| **Đơn giá** | Endpoint riêng không có bảng giá, nên tự điền giá vào/ra để báo cáo chi phí đúng. |

Có sẵn nút điền nhanh cho **OpenRouter, Groq, Together, DeepSeek, Ollama, vLLM / LM Studio, Azure
OpenAI**. Nút **Test the connection** gọi thử một câu và in ra đúng endpoint + model đã gọi. Cấu
hình này áp cho từng bên: parse và chấm có thể là hai endpoint khác nhau hoàn toàn.

Endpoint tự host (`http://127.0.0.1:11434/v1` — Ollama, hoặc vLLM trong mạng nội bộ) thì **không có
gì rời khỏi hạ tầng của trường**, và không cần key. Ba provider có sẵn cũng có ô *Endpoint override*
để đi qua proxy hay gateway của công ty mà vẫn giữ đúng định dạng của provider đó.

Mọi lời gọi — parse đề, chấm viết, xử câu viết lại — đều đi qua một hàm `callModel` duy nhất, nên
endpoint riêng được đo và ghi `ai_usage` y như provider có sẵn (`provider: 'custom'`).

**Bằng biến môi trường** — hoặc đặt vào `.env`, hệ thống tự nhận (cấu hình trong console được ưu tiên):

```env
AI_PROVIDER="anthropic"          # anthropic | openai | google | custom | none
ANTHROPIC_API_KEY="sk-ant-..."   # ANTHROPIC_MODEL="claude-sonnet-4-5"
OPENAI_API_KEY="sk-..."          # OPENAI_MODEL="gpt-4o"
GOOGLE_API_KEY="..."             # GOOGLE_MODEL="gemini-2.0-flash"

# endpoint riêng
AI_BASE_URL="https://openrouter.ai/api/v1"
AI_MODEL="anthropic/claude-sonnet-4.5"
AI_API_KEY="sk-or-..."           # bỏ trống nếu endpoint không cần key
AI_WIRE="openai"                 # openai | anthropic | google
AI_AUTH_STYLE="bearer"           # bearer | x-api-key | api-key | query | none
```

Không có key nào thì import vẫn chạy bằng bộ luật. Tất cả gọi thẳng qua `fetch`, không kéo SDK —
đổi provider là đổi một biến môi trường hoặc một ô trong console.

---

## Upload nguyên một quyển sách → kho đề (bank)

Không ai upload từng đề một: người ta upload **cả quyển**. Trang **Admin → Import a paper** nhận
luôn quyển sách và tự cắt ra từng đề trước khi gọi AI:

1. **Cắt theo tiêu đề in trong sách** (`src/lib/parse/book.ts`) — `TEST 4`, `PRACTICE TEST 2`,
   `ĐỀ SỐ 12`, `ĐỀ THI THỬ SỐ 3`, `Exam 5`. Trang mục lục bị loại (một loạt tiêu đề sát nhau ở đầu
   sách không phải là đề), mẩu quá ngắn được gộp vào đề trước. **Sách không in `TEST n` thì xem
   mục dưới** — đó là đa số sách luyện.
2. **Đáp án ở cuối sách được trả về đúng đề của nó** — khối `ANSWER KEY` / `ĐÁP ÁN` cũng cắt theo
   `TEST n` rồi nối vào đề tương ứng, nên đề nào có key của đề đó.
3. **Mỗi đề gọi AI riêng một lượt.** Không bao giờ gửi cả quyển trong một request — đó chính là
   thứ làm chết lượt parse. Đề nào đọc hỏng thì chỉ mất đề đó, 19 đề còn lại vẫn vào kho.
4. **Chạy nền, và chạy tiếp được.** Vercel cắt hàm giữa chừng thì job dừng đúng lúc còn kịp ghi lại
   `{done, total}`, quay về hàng đợi, và lượt sau chạy tiếp từ đề dở (`IMPORT_BUDGET_MS`, mặc định
   210s trên Vercel, không giới hạn khi tự host). Màn hình import hiện *"Reading TEST 7 (6 of 20
   papers)"*.

Đề ra từ sách vào **kho đề**: `bank = 1`, và `visibility = 'suite'` — nghĩa là **ẩn khỏi danh sách
đề của thí sinh**, chỉ mở qua một bài thi đầy đủ. Muốn một đề lẻ cũng vào kho thì tick *"Put it in
the bank"* khi import, hoặc mở đề ra và tick *"Keep this paper in the bank"*.

### Tick *"đây là cả quyển sách"* — cho sách không in "Test 1"

Đa số sách luyện không in `TEST 1` ở đâu cả. Nó in **`PART 5` bốn mươi lần**, hoặc `Exercise 12`,
hoặc `Bài 3`, hoặc chẳng in gì và chỉ đánh số câu lại từ 1 mỗi bài. Bản cũ chỉ biết tìm `TEST n`,
nên gặp một quyển như vậy nó trả về **đúng một đề chứa cả quyển** — vô dụng, và không thấy sai ngay.

Giờ ở màn Import có tick **"This upload is a whole book — split it into separate papers"**. Không
tick thì cắt vẫn dè dặt như cũ (cắt nhầm một đề lẻ thành nhiều mảnh còn tệ hơn để nguyên). Tick vào
thì **một đề là thất bại**, và bốn cách cắt được thử lần lượt:

| Cách | Nhận ra gì | Ví dụ |
|---|---|---|
| `test` | tiêu đề đề | `TEST 4` · `ĐỀ SỐ 12` |
| `exercise` | tiêu đề bài tập | `PART 5` (lặp lại) · `Exercise 12` · `Bài 3` · `Unit 7` |
| `restart` | **số câu quay về 1** | không có tiêu đề nào, chỉ 1→20 rồi 1→20 |
| `chunk` | độ dài | sách không có gì để bám, cắt ở chỗ xuống dòng |

Chỗ tinh nhất là phân biệt **`PART 1…PART 4` của một đề nghe IELTS** với **`PART 5` in bốn mươi
lần**. Cùng là chữ "part" và một con số, nên đếm không đủ. Từ khoá được chia hai loại:

* **Phần của một đề** — part, section, passage, task, phần: chỉ tách khi **số lặp lại** (cùng một
  dạng bài làm lại) hoặc nhiều hơn số phần một đề có (≥ 8).
* **Bài độc lập** — exercise, unit, lesson, drill, bài, bài đọc, bài tập: ≥ 3 cái là tách.

Nên một đề TOEIC `Part 1…Part 7` vẫn là **một đề**; `Part 5` ×12 là **12 đề**; `Bài 1…Bài 8` là
**8 đề**. Sách trộn nhiều loại tiêu đề thì **dùng tất cả các loại hợp lệ cùng lúc** — bản đầu chỉ
lấy loại nhiều nhất và ba bài đọc bị dính vào bài ngữ pháp cuối cùng, tức là vẫn lỗi cũ, chỉ khó
thấy hơn. Ngưỡng độ dài một mảnh cũng hạ từ 1.500 xuống **320 ký tự**: ba mươi câu chia động từ chỉ
dài hơn một trang, đo bằng thước của một đề đầy đủ thì mảnh nào cũng bị gộp ngược lại.

### Tự chia dạng vào thư mục

Tick **"File each paper under what it turns out to be"** (mặc định bật khi là sách): mỗi đề được
xếp vào `<tên sách> / <dạng>` — *Reading — Multiple choice*, *Reading — True / False / Not Given*,
*Listening — Note completion*, *Writing*. Dạng lấy từ **câu hỏi sau khi parse**, không lấy từ tiêu
đề in trên đầu: tiêu đề nói dối ("PART 5" chẳng nói gì cả), ba mươi câu trắc nghiệm thì không. Đề
không có dạng nào chiếm quá 2/3 thì ghi là *— Mixed*, vì xếp nó vào một dạng là xếp sai chỗ.

### Đáp án cuối sách — giờ đề nào cũng nhận được phần của nó

Trước đây key ở cuối sách chỉ ghép được khi sách cắt theo `TEST n`, vì chỗ cắt key cũng chỉ biết
`TEST n`. Sách bài tập có key đàng hoàng ở bốn trang cuối thì **không đề nào nhận được key**, và
model bị bắt tự nghĩ ra đáp án — đó chính là "có đáp án cuối sách rồi nó vẫn quyết không lấy".

Giờ cắt kiểu nào cũng ghép, theo ba cách, thử lần lượt:

1. **Key in lại đúng tiêu đề của thân sách** → cắt y hệt, ghép theo thứ tự.
2. **Số khớp nhau** → mỗi đề nhận đúng những số nó hỏi. Chỉ dùng khi **không số nào bị hỏi hai
   lần** trong cả quyển — sách đánh số lại từ 1 mỗi bài thì có bốn mươi câu tên là "1", ghép theo
   số nghĩa là bốn mươi đáp án sai.
3. **Theo vị trí** → bài thứ k lấy đúng k lượt đáp án tiếp theo rồi **đánh số lại** theo số của nó.
   Đây là trường hợp thật hay gặp nhất: thân sách đánh 1…13 mỗi bài, key ở cuối chạy 1…546.
   Chỉ làm khi **tổng số khớp trong khoảng 12%**, vì lệch một nhịp là toàn bộ key về sai câu.

Không khớp được cách nào thì **không ghép**, và nói rõ — ghép nhầm key sang đề khác còn tệ hơn
không có key.

Và tìm chỗ bắt đầu của key cũng rộng hơn: `ANSWER KEY` · `ANSWERS` · `KEYS` · `SOLUTIONS` ·
`ĐÁP ÁN` · `BẢNG ĐÁP ÁN` · `HƯỚNG DẪN GIẢI`, ở bất kỳ đâu sau 1/5 đầu sách — **và cả khi không in
tiêu đề nào cả**: bốn trang cuối toàn dòng ngắn kiểu `1. C  2. B  3. D`, không có dãy `A. … B. …`
của đề thật, thì đó là key (cần ≥ 15 đáp án mới nhận).

Và một điểm đảo ngược quan trọng: **key in trong sách thắng**. Trước đây key chỉ điền vào chỗ *chưa
có* đáp án — nghe thì cẩn thận, thực ra là ngược: model đọc đề bài tập thì câu nào nó cũng trả lời,
nên tới lúc key về thì "câu nào cũng có đáp án rồi" và đáp án **in trong sách bị vứt đi**. Giờ chỗ
nào lệch thì key ghi đè, kèm dòng báo *"N answer(s) already on the paper disagreed with the printed
key and were replaced"*.

### Upload sách nặng mà không sập web

Node chạy một luồng. Bản cũ đọc cả quyển rồi mới lưu, nên một cuốn nặng nghĩa là: cả quyển nằm
trong RAM, hàng trăm lượt parse chạy liền không nhả CPU, và mọi request khác — đăng nhập, autosave
của thí sinh đang thi — **xếp hàng sau nó**. Đúng như bạn gặp. Bốn thay đổi:

* **Lưu từng đề ngay khi đọc xong** (`onParsed`), không giữ cả quyển. Bộ nhớ chỉ giữ một đề, và đề
  nào đọc xong là đã nằm trong kho — job chết giữa chừng cũng không mất.
* **Nhả event loop giữa mỗi đề** (`breathe()`). Parse bằng rules không `await` gì cả, nên 120 đề là
  một cục block dài; một lần nhả mỗi đề tốn 0 đồng.
* **Mỗi tiến trình chỉ đọc một cuốn một lúc** (`inLane`). Ba người upload cùng lúc trước đây là ba
  cuốn sách cùng trong RAM trên cùng một luồng.
* **Có time budget ở mọi môi trường** (90s, không chỉ Vercel), và **tự xin lượt tiếp theo** sau
  1,5s. Đọc dở thì ghi lại chỗ đang đứng rồi chạy tiếp, thay vì một job chạy liền tù tì cho tới lúc
  chết.

Cộng hai cái chặn: quá **4 triệu ký tự** thì cắt và báo (một cuốn thật không tới), và danh sách
warning giới hạn 200 dòng — vì warning được ghi lại **mỗi lần lưu một đề**, để nó phình vô hạn là
tự bắn vào chân.

Và chỗ *"parse còn không hết"*: khi tạm dừng, lượt sau cần đọc lại file gốc — mà file gốc có thể đã
bị retention xoá, hoặc chưa từng lưu được (storage lỗi). Trước đây gặp vậy là **fail** và mất luôn
phần chưa đọc. Giờ **text đã trích được ghi lên dòng import ngay từ đầu** (tối đa 1,5 triệu ký tự),
lượt sau chạy tiếp từ text đó, không cần file. Nếu cả text cũng không còn thì kết thúc ở trạng thái
*committed* kèm câu "đọc được N đề, những đề đó đã ở trong kho, upload lại để đọc nốt" — chứ không
báo fail lên trên đầu N đề vừa lưu được.

### Tick ngược lại: *"giữ nguyên một đề"*

Có đề nhiều phần nhiều kỹ năng nhưng **cố ý** là một đề, thi một lượt. Mặc định một đề có phần nghe
+ phần đọc + phần viết sẽ tách thành ba (vì bài thi đầy đủ được thi như vậy). Tick **"Keep this as
one paper — don't split it at all"** thì không cắt gì hết: không tìm đề con, không tách kỹ năng,
và không vào kho. Hai tick loại trừ nhau — tick cái này thì tick "cả quyển sách" tự bỏ.

### *"Đáp án bắt đầu từ trang 50"* — và AI đọc key trước khi parse

Hai ô mới ở màn Import:

* **"Answers start on page ___"** (chỉ PDF). Nhập số trang là **cắt đúng chỗ đó**: từ trang đó trở
  đi là answer key, phía trước là đề. Không cần tiêu đề, không cần nhận dạng bảng — số trang là thứ
  duy nhất về một file PDF mà giáo viên luôn biết và không parser nào đoán chắc được. Dùng khi key
  cuối sách không được nhặt lên, hoặc đề tiêu đề kiểu *"GHI CHÚ CUỐI SÁCH"* mà không luật nào ngờ
  tới. (PDF được đọc **theo từng trang** rồi mới ghép — `Extracted.pageTexts` — nên cắt theo trang
  là cắt chính xác, không phải ước lượng theo ký tự.)
* **"Read the answer key first, then the paper"** (mặc định bật). Có key ở đâu — file riêng, trang
  vừa nhập, hay cuối sách — thì key được đọc **trước**: rule parser lấy những gì bố cục rõ ràng cho
  phép, phần còn lại giao cho model (`readAnswerKey`), rồi danh sách *số câu → đáp án* đó đi kèm
  prompt parse đề với chỉ thị **copy, không được tự giải, không được "sửa" key**. Model có đáp án in
  trước mắt thì thôi bịa; và key vẫn được áp lại **lần nữa** sau khi parse, vì model được đưa key
  vẫn có thể không dùng.

Chạy thật với một PDF 3 trang (2 trang đề, trang 3 là đáp án dưới tiêu đề *"GHI CHU CUOI SACH"*):
không nhập số trang → **0/20 câu có đáp án**; nhập `3` → *"The answers were taken from page 3
onwards, as told: 1 page(s) of key, 2 of paper"* và **10 đáp án vào đúng chỗ**. Và với một sách 13
trang (12 bài × 8 câu, trang 13 là key): **12/12 bài nhận key, 8/8 câu mỗi bài**, và dòng báo hiện
ra **sau 5 giây** — không phải sau khi đọc xong cả quyển.

Ghép key theo **từng khối** là cách chính bây giờ: key sách bài tập in một khối cho mỗi bài, mỗi
khối đếm lại từ 1, nên ghép **theo hình dạng** (khối nào có đúng số câu của bài đó) — nhìn trước
tối đa 3 khối để một khối lạ không làm lệch mọi bài sau nó. Ghép theo số chỉ dùng khi không số nào
bị hỏi hai lần trong cả quyển; ghép tuần tự theo vị trí là bước cuối, và **chỉ khi tổng khớp** —
lệch ≤ 12%, hoặc ≤ 35% nếu chính người dùng đã chỉ trang key (đã nói "key ở đây" thì không còn
chuyện "đây có phải key không").

Và một điều đáng ghi riêng: **ghi chú về cả file giờ hiện ngay**. Trước đây mọi dòng nói về *quyển
sách* (cắt kiểu gì, có tìm được key không, chia được cho bao nhiêu đề) chỉ được ghi khi **chạy xong
cả quyển** — nên một quyển 84 đề mất hai mươi phút hiện đúng câu *"No printed answer key was found"*
của đề đầu tiên, trong khi dòng nói key đã cắt từ trang 178 và chia xong nằm trong một biến không ai
thấy được. Giờ `onNote` đẩy từng dòng lên ngay khi nó được viết ra.

## Bank: xem cả kho, theo kệ

`/admin/bank` — mục **Bank** trong console. Màn **Papers** cũng dùng chung cây thư mục đó
(`src/lib/folders.ts` + `FolderTree`), nên danh sách đề không còn là một đống phẳng: kệ bên trái,
đề bên phải, số đề trên từng nhánh. Danh sách đề trả lời câu "đề hôm thứ Ba đâu rồi"; kho đề
trả lời câu khác hẳn: **"rốt cuộc mình đang có gì"**, và sau một lần upload sách thì đó là bốn trăm
đề trong ba mươi thư mục. Nên màn này để **kệ lên trước**: cây thư mục nhiều cấp (cắt theo ` / `)
kèm số đề từng nhánh, bấm vào là lọc; trên cùng là tổng số đề, số thư mục, số đề mỗi kỹ năng, và số
bài thi đầy đủ đã dựng từ kho. Chọn nhiều đề thì chuyển thư mục · bỏ khỏi kho · xoá — đi qua đúng
API bulk đã có, tức là vẫn kiểm `orgId` trong câu SQL.

Truy vấn: **một** câu `bankMeta` — metadata cộng số lượt thi từng đề, không kéo nội dung đề nào.

## Kho đề dùng chung của Testora

Trường không phải bắt đầu từ con số không. **Admin → Testora library** là kho đề Testora mở cho mọi
tổ chức trên nền tảng: xem theo thư mục, tick từng đề hoặc **Copy the whole folder**, và đề vào ngay
kho của trường.

Điểm quan trọng: đây là **copy thật**, không phải link. Nếu trường dùng chung một hàng dữ liệu với
Testora thì kết quả thi của trường sẽ phụ thuộc vào một đề mà người khác sửa hay xoá được — xoá đề
là xoá luôn attempt (`ON DELETE CASCADE`). Copy xong thì bản đó **là của trường**: sửa được, publish
được, giữ bao lâu cũng được, và Testora rút đề khỏi kho cũng không ảnh hưởng. Đề đã copy hiện nhãn
*"In your bank"* nên không copy trùng.

Đề copy về vào kho (`bank = 1`) và ẩn khỏi danh sách của thí sinh (`visibility = 'suite'`) — tức là
**bốc ngẫu nhiên ra full test được ngay**, nằm cùng pool với đề của trường.

Chỉ **platform** đưa đề vào kho chung được (ô *"Share it in the Testora library"* trong trình soạn
đề, chỉ hiện với tenant platform). Trường tự tick thì API trả 403 — và có lý do kỹ thuật chứ không
chỉ là chính sách: `/api/media` chỉ phát file nghe của org đang đăng nhập hoặc của org platform/
community, nên đề của trường A chia sẻ sang trường B sẽ đến nơi mà **không có tiếng**.

## Thư mục: đề của ai, thuộc bộ nào

Đề bây giờ có **thư mục** (`tests.folder`, `suites.folder`) và mọi danh sách đều hiện theo thư mục —
console và dao diện thí sinh như nhau:

* **Import** có ô *Folder*; upload cả quyển thì thư mục **tự lấy tên quyển sách**, đề AI viết vào
  *"Written by the AI"*, đề copy từ kho chung giữ đúng thư mục của kho.
* **Admin → Papers** nhóm theo thư mục, kèm số đề mỗi thư mục, và ghi rõ đề nào *"Inside a full
  test"* (ẩn), *"Sitting code only"*, hay đang ở **Bank**.
* **Admin → Full tests** hiện thư mục dưới tên bài thi; đợt bốc từ kho vào chung một thư mục
  (mặc định *"Mocks"*).
* **Dao diện thí sinh** (`/dashboard`) nhóm theo **nguồn · thư mục** — *"Trường THPT Chuyên Demo ·
  Cambridge IELTS 15"*, *"Public catalogue · Đề HSG 2024"* — có icon thư mục và số lượng, vì đề đến
  từ nhiều nơi cùng lúc (mỗi trường đang học, catalogue công khai).
* **Catalogue** công khai cũng chia mục theo thư mục.

## Bốc ngẫu nhiên từ kho ra bài thi đầy đủ

**Admin → Full tests → Build tests from the bank**: chọn số lượng, đặt tên, chọn công khai hay
riêng, bấm **Draw from the bank**. Mỗi bài thi lấy một đề cho mỗi kỹ năng, bốc ngẫu nhiên
(Fisher–Yates), **không dùng lại đề trong cùng một đợt** cho tới khi hết kho rồi mới xáo lại. Đề
nghe chưa có file MP3 không bao giờ được bốc — bốc ra thì thí sinh ngồi nhìn màn hình trắng.

Bảng còn cho biết kho đủ dựng được bao nhiêu bài: *"12 papers — 4 listening, 4 reading, 4 writing.
Enough for 4 full tests with no paper used twice."*

Bài thi dựng xong xuất hiện ngay trong danh sách khi tạo **sitting**, nên đợt thi thử chỉ mất một
cú bấm.

### Thí sinh tự bốc, hoặc nhờ AI ra đề

Trên `/dashboard`, dưới danh sách, có khối **Nothing you fancy?**:

* **"Can't decide? Pick one for me"** — bốc một bài thi đầy đủ từ kho của trường (hoặc kho cộng
  đồng) **riêng cho người đó**: `settings.assembledFor` ghi đúng userId, người khác không nhìn
  thấy. Tối đa 5 lượt/ngày.
* **"No paper at all? Have one written"** — ô nhập yêu cầu (chủ đề, trình độ, dạng bài, số câu, số
  phút) kèm ô dán một đề mẫu để AI bắt chước *cấu trúc* (không chép nội dung). Bấm xong chạy nền,
  xong thì đề nằm sẵn trên dashboard dưới dạng một bài thi của riêng người đó.

Cả hai đều do trường bật/tắt ở **Admin → Branding & rules → What a candidate may ask for**: bốc đề
mặc định **bật** (không tốn tiền), nhờ AI ra đề mặc định **tắt** (tốn tiền API) và có hạn mức
mỗi thí sinh mỗi ngày.

Giáo viên/quản trị có bản đầy đủ hơn ở **Admin → Import a paper → No paper? Have one written**:
đặt tên, chọn module, số câu, thời gian, đề mẫu, và chọn có cho vào kho hay không. AI viết cả
**đáp án** cho mọi câu, rồi đề đi qua đúng đường chuẩn hoá/sửa lỗi như đề import.

## Practice và Simulation

Một bài thi đầy đủ giờ mở được **hai kiểu**, chọn ngay ở đầu `/suite/<id>`:

| | Simulation | Practice |
|---|---|---|
| Phạm vi | cả bài, đúng thứ tự | một kỹ năng lẻ, tuỳ chọn |
| Thời gian | đúng giờ chính thức | thí sinh tự đặt, kể cả **không giới hạn** |
| Số lần | mỗi kỹ năng một lần | làm lại bao nhiêu lần cũng được |
| Vào báo cáo | có | **không** |

Practice ghi `attempts.mode = 'practice'` và bị loại khỏi `suiteProgress`, nên một buổi luyện
không "khoá" mất lượt thi thật, không hiện thành *Completed*, và không lọt vào test report.

Nộp xong một lượt practice, thí sinh vào thẳng **trang kết quả của lượt đó** (`/results/<id>`) —
có điểm, có đáp án đúng, có giải thích nếu đề có — gắn nhãn *Practice run* và một đường về bài thi.
Điểm practice **không bị giữ lại** theo cài đặt "chưa công bố kết quả" của trường: không có buổi thi
nào để công bố, và giữ lại thì thí sinh luyện xong chẳng còn gì. Hub cũng nhớ lượt gần nhất:
*"Your last practice run … See it again"*.

Có mã sitting thì **luôn là thi thật**: `?code=…` tắt hẳn practice, dù bài thi có bật.

Trường điều khiển ở form tạo bài thi (hoặc PUT `/api/admin/suites/<id>`): `allowSimulation`,
`allowPractice`, `practiceMaxMinutes` (0 = không chặn). Tắt cả hai thì API từ chối — "A test nobody
may sit is not a test".

### Công khai bài thi, giấu đề sau nó

* **Bài thi đầy đủ lên `/catalogue` như đề lẻ** — `visibility = 'catalog'` + `status = 'published'`
  (nút **To catalogue** ngay trên bảng Full tests). Trang catalogue có mục *Full tests* riêng, ghi
  rõ giá bằng credit; một bài thi chỉ trừ credit **một lần**, ở kỹ năng đầu tiên.
* **Đề ẩn khỏi giao diện nhưng vẫn thi được qua bài thi** — `visibility = 'suite'`
  (*"Hidden — opens only inside a full test"* trong trình soạn đề). Gọi thẳng `/api/attempts` với
  `testId` của nó thì bị từ chối: *"This paper is part of a full test. Open the full test and start
  it from there."*
* Trước khi publish, hệ thống kiểm mọi phần của bài thi: đề còn draft hoặc đề nghe chưa có MP3 thì
  chặn kèm lý do, thay vì để thí sinh mắc kẹt ở phần đầu tiên.

## Kỳ thi, chấm bài, báo cáo

**Kỳ thi (Sittings)** — chọn **một paper hoặc cả full test**, đặt giờ mở/đóng, ghi đè thời lượng, sinh
mã vào thi. Mã của full test đưa thí sinh vào hub của test rồi làm từng kỹ năng, và mọi lượt thi vẫn
được ghi vào đúng kỳ thi đó.
Màn hình theo dõi cho biết ai đang làm, còn bao lâu, và nhật ký giám thị của từng người.

**Không có scroll ẩn** — khung thi (`h-screen`) dùng `overflow: clip` chứ không phải `overflow:
hidden`: một hộp `overflow: hidden` vẫn là scroll container, chỉ là không có thanh cuộn, nên trước
đây khi tích một đáp án ở gần cuối, focus nhảy vào ô radio ẩn (`sr-only`) và trình duyệt cuộn *cả
khung thi* đi mất — thí sinh nhìn thấy màn trắng tinh. Nay mỗi `<label>` là `relative` (ô ẩn định vị
đúng trong lựa chọn của nó), khung thi không cuộn được, và còn một listener đưa scroll về 0 cho
trình duyệt cũ không hỗ trợ `overflow: clip`.

**Đồng hồ trong phòng thi** — góc phải màn thi luôn có đồng hồ đếm ngược, chuyển vàng rồi đỏ khi
gần hết. Hết giờ bài **tự nộp**. Giờ là giờ của máy chủ: mỗi giây trình duyệt đọc lại `endsAt`, nên
sửa giờ máy hay đóng nắp laptop không kéo dài được kỳ thi. Nộp muộn cũng vô nghĩa — sau 10 giây gia
hạn, máy chủ chấm đúng những gì đã lưu, không nhận đáp án gửi kèm.

**Chống gian lận** — chặn copy/paste, chặn menu chuột phải, ghi lại mỗi lần thí sinh rời khỏi cửa sổ
(kèm số giây), yêu cầu toàn màn hình và ghi mỗi lần thoát, khoá part đã rời, giới hạn một lượt thi,
và tự nộp bài sau N lần rời cửa sổ. Part đã khoá là khoá thật: mũi tên trái/phải, thanh số câu, danh
sách part và màn hình review đều đi qua cùng một cửa.

**Điểm và đáp án sau khi thi** — hai công tắc riêng cho từng kỳ thi (hoặc mặc định của tổ chức):
*hiện điểm ngay* và *hiện đáp án đúng*. Giữ điểm lại thì thí sinh chỉ thấy "đã nộp bài" — kể cả bài
máy chấm xong ngay — cho tới khi giáo viên bấm **Release results to candidates** ở màn theo dõi kỳ
thi. Với bài thi nhiều kỹ năng, release kết quả tổng cũng mở luôn điểm từng phần.

**Thời gian mở đề** — mỗi kỳ thi có giờ mở và giờ đóng; ngoài khung đó máy chủ từ chối vào thi.
Đề đặt ở chế độ *chỉ qua kỳ thi* không hiện trong kho đề và không mở được bằng link trực tiếp,
chỉ vào được bằng mã kỳ thi.

**Chấm bằng AI** — bật *Mark extended writing* thì bài luận, thư và báo cáo được chấm ngay
lúc nộp: model chấm theo đúng rubric của tổ chức, trả điểm từng tiêu chí kèm nhận xét, điểm
mạnh và chỗ cần sửa; bản ghi mang `source: 'ai'` và giáo viên vẫn ghi đè được. Câu **viết lại
câu** thì giới hạn số từ và từ khoá bắt buộc kiểm tra **bằng code**, chỉ hỏi model đúng một
việc: hai câu có cùng nghĩa không. Mọi dạng còn lại do thuật toán chấm, không gọi model.

**Chấm tay** — hàng đợi chỉ chứa bài có phần Viết chưa ai chấm. Màn hình chấm đặt bài viết cạnh rubric
(mỗi tiêu chí một thanh trượt), có ô nhận xét, và tự quy ra điểm theo trọng số của câu.
Chấm xong bài tự chuyển sang trạng thái `marked` và cộng vào tổng.

**Báo cáo** — phổ điểm, câu sai nhiều nhất, lọc theo lớp, xuất CSV.

**Xoá** — xoá được đề, full test, kỳ thi và bản ghi import. Xoá đề sẽ **xoá luôn các lượt thi và kết
quả của đề đó** (không có đề thì không đọc lại được kết quả), nên lần bấm đầu bị từ chối kèm con số
"bao nhiêu lượt thi sẽ mất", phải xác nhận lần hai mới xoá; muốn giữ kết quả thì unpublish thay vì
xoá. Xoá kỳ thi thì kết quả vẫn còn, chỉ mất kỳ thi và mã vào thi. Xoá full test thì các đề con và
kết quả vẫn còn, chỉ mất phần gộp. Quyền: giáo viên import và sửa đề được, nhưng **xoá đề chỉ owner
và admin**.

**Ai làm được gì** — giáo viên: import đề, tạo và sửa đề, tạo kỳ thi, chấm bài, xem báo cáo. Owner và
admin: thêm cả xoá đề, quản lý người dùng, branding, storage, mã tham gia, cấu hình tổ chức.

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
trong giới hạn không.

### Không phải đề nào cũng có band — đề HSG/chuyên tính điểm

Mỗi đề có một **thang báo điểm** (`scoring`):

* **`band`** — chỉ dành cho đề IELTS thật (tên có IELTS, hoặc rõ ràng là Academic/General Training
  một kỹ năng). Quy từ điểm thô theo bảng ở `src/lib/bands.ts`; Writing lấy band từ trung bình các
  tiêu chí đã chấm.
* **`points`** — **mặc định cho mọi đề còn lại**: đề học sinh giỏi, đề chuyên, đề tuyển sinh, đề thi
  thử của trường. Báo điểm **trên tổng in trên đề** (thường 20, có đề 10 hoặc 100), kèm điểm từng
  phần — báo "Band 6.5" cho đề HSG tỉnh thì nhà trường không dùng được.

**AI parser được dặn cụ thể về việc chia điểm**: đọc `Tổng điểm: 20`, `(20,0 điểm)`,
`Total: 100 marks` để đặt `totalPoints`; câu nào in điểm riêng thì giữ nguyên; phần nào chỉ in tổng
(`PHẦN II (4,0 điểm)`) thì **chia đều cho các câu trong phần đó** — 4,0 điểm/8 câu = 0,5 điểm/câu,
bài viết in 4,0 điểm thì được đúng 4,0 điểm chứ không bằng một câu điền từ. Phần chia không hết thì
số dư dồn vào các câu đầu, nên **tổng luôn khớp** với tổng in trên đề (test 6 tỉ lệ chia: 4/8, 6/7,
2/3, 20/40, 0,5/3, 10/3 — đều khớp tuyệt đối). Đề không in điểm gì thì mỗi câu 1 điểm.

Trên phiếu kết quả: đề band hiện **test report form IELTS** như cũ; đề điểm hiện **Phiếu điểm ·
Mark sheet** — tổng `16 / 20`, phần trăm, và bảng điểm từng phần (`PHẦN I 8/8`, `PHẦN II 4/8`,
`PHẦN III 4/4`), câu nào chờ giáo viên chấm thì ghi rõ. Full test gồm các đề tính điểm cũng cộng ra
tổng điểm chứ không ra band. Giáo viên đổi được thang và tổng điểm ngay trên editor.

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
    suite/[id]/                                      # bài thi IELTS chia kỹ năng + report
    admin/                                           # console của tổ chức
      tests/  suites/  import/  library/  sessions/  marking/  reports/  people/
      branding/  codes/  ai-usage/
    platform/                                        # quản trị toàn nền tảng
      ai/  usage/
    api/                                             # REST endpoints
  components/
    exam/          ExamShell, PassagePane, QuestionGroupView, BottomBar…
    admin/         TestEditor, ImportWizard, SessionManager, MarkingPanel, ReportsView…
  lib/
    db.ts          toàn bộ SQL + pool Postgres + migrate
    auth.ts        session JWT trong cookie httpOnly + vai trò theo tổ chức
    grading.ts     chuẩn hoá đáp án + chấm
    brand.ts       token màu, áp bằng CSS variables
    highlight.ts   bôi vàng theo offset ký tự
    payments.ts    interface cổng thanh toán
    gate.ts        chặn lần đầu chạy (/setup) và chặn chưa xác minh email (/verify)
    auth-hf/       OAuth với Hugging Face: đăng nhập, và nối storage bằng SSO
    mail/          cấu hình SMTP (mã hoá), gửi thư, sinh mã xác minh
    storage/       root.ts (file local) · vault.ts (config mã hoá trong repo/bucket)
                   hf.ts (Hugging Face Hub API) · client.ts (ghi/xoá song song)
                   retention.ts (hết hạn thì xoá)
    preflight.ts   soi đề trước khi publish (blocking / advisory)
    rate-limit.ts  giới hạn số lần thử cho login và redeem
    suite.ts       tiến độ từng kỹ năng + band tổng (bỏ qua lượt practice)
    assemble.ts    bốc ngẫu nhiên từ kho đề ra bài thi đầy đủ
    import-runner.ts  chạy nền: đọc sách theo từng đề, chạy tiếp được sau khi bị cắt
    bands.ts       bảng quy đổi điểm thô → band
    ai/            models, config (key mã hoá), provider (đo token + streaming), marking,
                   compose (AI ra đề), explain (giải thích đáp án)
    parse/         extract (unpdf + poppler) → book (cắt sách, chia đáp án cuối sách) → rules → ai →
                   normalize → shelve (đề này thuộc dạng gì, xếp thư mục nào)
  types/exam.ts    mô hình đề (ExamContent)
scripts/           seed.ts, seed-content.ts, seed-chuyen.ts, migrate.ts
  verify/          harness.ts · checks.ts (logic) · data.ts (SQL) · wires.ts (provider +
                   streaming) · browser.ts (trang + guard)
samples/           5 đề thật để thử import
```

Toàn bộ nội dung một bài thi là **một document JSON** trên bảng `tests`. Bộ import chỉ cần
sinh đúng cấu trúc đó, và trình soạn đề chỉ sửa đúng cấu trúc đó.

---

## Giải thích từng đáp án

Màn xem lại chỉ ghi *"Incorrect"* thì không dạy được gì — thí sinh muốn biết **vì sao**, và giáo viên
không thể viết tay bốn mươi lần. Nên tick **"Explain every answer"** lúc import là model viết luôn
2–3 câu cho **mỗi câu hỏi**: dòng nào trong bài cho biết đáp án, quy tắc ngữ pháp nào, tại sao lựa
chọn nghe-có-lý kia lại sai.

Hai quy tắc trong prompt (`src/lib/ai/explain.ts`) đáng ghi lại:

* **Giải thích từ chính đề đó** — trỏ vào câu trong đoạn văn, không giảng lý thuyết chung, không bịa
  ra dòng mà đoạn văn không có.
* **Viết bằng ngôn ngữ của đề.** Đề HSG tiếng Việt được giải thích bằng **tiếng Việt** — giải thích
  bằng tiếng Anh thì cả phòng đó không dùng được. Prompt nói rõ: bám theo *đề*, không bám theo lệnh.

Lưu ở `Question.explanation`. Ba điều quan trọng về chỗ nó xuất hiện:

* **Không bao giờ** vào trang đang thi: `forCandidate()` bóc `explanation` cùng với `answers` (có
  phép kiểm cố định trong `npm run verify` — giải thích lọt vào trang thi là *cho đáp án*).
* Hiện ở **màn xem lại sau khi nộp**, ngay dưới câu trả lời của thí sinh, kèm gạch dọc bên trái. Chỉ
  hiện khi trường cho xem đáp án (`showAnswers`).
* Sửa được bằng tay trong trình soạn đề.

Đề import trước khi có tính năng này thì không cần import lại: trình soạn đề có dòng *"12 of 40
answers explain themselves"* và nút **Write the missing explanations** (`POST
/api/admin/tests/<id>/explain`, thêm `{"redo": true}` để viết lại toàn bộ). Chạy nền, mỗi 10 câu một
lượt gọi model.

## Xem AI làm việc: streaming và phần trăm

Đọc một đề mất một tới hai phút của máy người khác, và một cái spinner chạy hai phút thì **không
phân biệt được với một cái spinner chạy mãi mãi**. Nên màn Import bây giờ cho xem trực tiếp:

* **Thanh phần trăm** và **tên công đoạn**: *Reading the file → Finding the papers in it → The model
  is reading the paper → Writing the answer key → Writing the answer explanations → Saving*, kèm
  *"paper 3 of 12"* khi đang đọc sách.
* **Ô hiện đúng những gì model đang viết ra**, cuộn theo — JSON dở dang, đúng như nó đang là — cộng
  số ký tự đã nhận.

Cách chạy, và vì sao chọn như vậy:

1. **Streaming thật ở tầng provider** (`src/lib/ai/provider.ts`): truyền `onDelta` thì request bật
   `stream: true` và đọc `text/event-stream`. Cài cho **cả ba wire** — OpenAI (`choices[].delta`),
   Anthropic (`content_block_delta`), Google (`streamGenerateContent?alt=sse`) — dùng chung một hàm
   đọc SSE. Server nào phớt lờ `stream` mà trả JSON thường thì **vẫn chạy**: kiểm `content-type` chứ
   không tin request được tôn trọng.
2. **Tiến độ ghi vào dòng import**, không giữ trong RAM. Việc đọc đề chạy ở process khác (trên
   serverless thì có thể là **máy khác**), nên trạng thái phải đi qua database — đó cũng là lý do
   mất kết nối rồi mở lại không mất gì.
3. **Ghi có tiết chế**: một reply stream về hàng trăm mảnh mỗi giây. `Reporter` giữ trạng thái trong
   bộ nhớ và ghi mỗi 400ms — **trừ** mảnh đầu tiên và mỗi lần đổi công đoạn, hai thứ được ghi ngay,
   vì đó chính là lúc người đang xem cần thấy có chuyện gì đang xảy ra. (Bản đầu chỉ tiết chế theo
   thời gian và với model nhanh thì ô live **không hiện gì cả** — model trả xong trước cửa sổ ghi
   đầu tiên.)
4. **`GET /api/admin/import/<id>/stream`** là SSE: đọc dòng import mỗi 600ms, chỉ gửi khi *có thay
   đổi*, đóng khi job xong. Sau 4 phút nó gửi `reconnect` và client mở kết nối mới — một quyển sách
   lâu hơn thời gian nên giữ một kết nối.
5. Phần trăm tính theo **công đoạn × paper thứ mấy trên tổng**, không giả vờ đo bên trong một lượt
   gọi model: reply dài bao nhiêu là chuyện của model, đo được thì cũng là đoán.

### Wire `custom` có streaming không?

Có, và không cần cài riêng: **`custom` không phải wire thứ tư**. Provider `custom` là "server nào,
model nào" — còn *giọng nói* thì vẫn phải chọn một trong ba (`wireOf()` trả `config.wire`), nên khi
`callModel` gọi tới, nó vào đúng ba hàm wire đã có streaming. Một vLLM, một Ollama, một LM Studio,
một gateway nội bộ nói tiếng OpenAI thì stream y như OpenAI.

Cái phải cài là **chịu được server nói tiếng OpenAI không đầy đủ**, vì đó là đa số server tự dựng.
Ba đường lùi, tất cả tự động, không cần người tắt gì:

| Server làm gì | Driver làm gì |
|---|---|
| trả 400 vì không hiểu `stream` / `stream_options` | gọi lại **không** streaming, lần này lấy được reply |
| nhận `stream: true` rồi trả JSON thường | thấy `content-type` không phải `text/event-stream` → đọc như JSON, **một** request |
| mở event stream rồi không gửi gì | text rỗng → gọi lại không streaming |

Và một **công tắc tay** cho trường hợp còn lại: checkbox *Stream the reply* ở mỗi provider
(`AiConfig.streaming`, mặc định bật). Tắt thì `callModel` bỏ `onDelta` ngay từ đầu — ô live không
hiện chữ nữa nhưng thanh phần trăm và tên công đoạn vẫn chạy, vì tiến độ đi theo *công đoạn*, không
theo ký tự.

`npm run verify:wires` dựng **năm** endpoint giả (port 14570–14574) đúng năm kiểu trên rồi cho
driver thật gọi vào, kiểm cả *số lần request*: chỗ nào phải "hỏi hai lần" thì đúng hai lần, chỗ nào
chỉ cần một thì đúng một — 15 phép kiểm, không cần database, không cần mạng.

Nhãn lúc xong nói **số paper thật sự lưu được**, không phải số paper đã đọc: upload lại cùng quyển
sách thì nó ghi *"Read — nothing new to save"* thay vì "12 papers in your bank".

## Khi model không trả JSON

Trước đây một lượt AI thất bại hiện ra đúng năm chữ — *"The model did not return JSON."* — rồi âm
thầm lùi về rule parser. Người upload không có gì để lần: key sai? model sai? server sai? đề dài
quá? Giờ mọi lời gọi JSON đi qua `src/lib/ai/ask-json.ts`, và có hai thứ trước đây không có:

1. **Hỏi lại một lần**, bỏ JSON-mode của wire (`response_format` / `responseMimeType`) và đưa yêu
   cầu vào chính câu lệnh. Kha khá server tự dựng nói tiếng OpenAI hoặc từ chối field đó, hoặc
   nhận rồi **trả về chuỗi rỗng** — lần hỏi thứ hai là cách lấy được câu trả lời từ những server đó.
2. **Báo lỗi nói rõ chuyện gì đã xảy ra**, bằng chính lời model: *"the model refused: …"* ·
   *"the model returned an empty reply"* · *"it spent 4,182 characters on reasoning and stopped"* ·
   *"it stopped because it ran out of output budget — raise Longest reply in AI settings"* · hoặc
   20 chữ đầu của đoạn văn nó trả về thay vì JSON.

Đọc reply cũng rộng hơn: **model reasoning** để thinking ở `reasoning_content` / `reasoning` /
block `thinking` / part `thought` — cả ba wire giờ đều **đếm** phần đó (không nối vào JSON) nên
"rỗng" giải thích được thay vì thành "không có JSON"; và `refusal` được đọc riêng.

Thêm một đường lùi hay gặp với model mới: server trả **400 vì tham số**. `temperature` khác 1,
`max_tokens` (phải là `max_completion_tokens`), `response_format` không hỗ trợ — server nói rõ field
nào, nên field đó bị **bỏ ra và gọi lại**, thay vì để cả lượt import chết vì một tham số không ai
yêu cầu.

## Provider chỉ cho 1 request một lúc

Log thật từ một lượt upload 84 đề:

```
429 {"code":"concurrency_limit_exceeded","message":"Too many concurrent requests (limit: 1)",
     "limit":1,"role":"free"}
```

Và kết quả: từ đề thứ 50 trở đi **AI không chạy nữa**, tất cả rơi về rule parser — không phải vì
model dở mà vì driver coi 429 là lỗi chết. Hai thứ được thêm:

* **Xếp hàng gọi model trong tiến trình** — mặc định **1 request một lúc** (`AI_CONCURRENCY` đổi
  được). Chờ không tốn gì cả vì đây là việc chạy nền, và một hàng đợi rẻ hơn là bắt mọi chỗ gọi phải
  tự biết giới hạn của provider.
* **Gặp 429/5xx thì thử lại** — 1s, 3s, 7s, 15s (`AI_RETRIES`, mặc định 4 lượt), tôn trọng
  `Retry-After` khi server gửi. Key sai hay request sai thì **không** thử lại: hỏi lại cũng thế
  thôi, chỉ tốn thêm thời gian chờ của người dùng.

`npm run verify:wires` có hai endpoint giả cho đúng chuyện này: một cái 429 lần đầu rồi trả lời
bình thường (kiểm đúng **hai** lượt hỏi), và một cái **đếm số request đang chạy** — nếu thấy 2 cái
cùng lúc thì nó 429 vĩnh viễn và phép kiểm gãy. Ba lời gọi song song, endpoint không bao giờ thấy
quá một.

## Console không tải cả quyển sách về nữa

*"Refresh web nó đơ, khó vào"* — đúng, và lỗi do tui: cột `extractedText` (tối đa 1,5 MB text của
quyển sách, giữ để chạy tiếp khi bị cắt giữa chừng) nằm trong `SELECT *`. Màn Import poll mỗi 2,5
giây, mỗi lần kéo cả cột đó × 40 dòng import. Đo lại một lượt import 120 đề:

| | Trước | Sau |
|---|---|---|
| Một lần poll danh sách | ~340 KB (và tăng theo kích thước sách) | **6 KB**, 14ms |
| Số ghi chú trong một import | 201 dòng, phần lớn là một câu lặp lại | **7 dòng** |
| Stream tiến độ (mỗi 600ms) | đọc lại cả dòng import, kèm 1,5 MB text | chỉ metadata |
| Sweep tìm job dở | **mỗi lần poll** (2,5s), kèm fetch file từ storage | tối đa 15s một lần |

Ba thay đổi: `IMPORT_META` (mọi cột trừ `extractedText` và `draft`) cho danh sách · stream và
`DELETE` cũng dùng bản metadata · `GET /api/admin/import/<id>` trả `extractedChars` thay vì cả text.
Cộng ghi chú: câu giống nhau chỉ khác tên đề giờ **gộp lại ngay tại chỗ sinh ra nó** (đó là chỗ duy
nhất tên đề và câu ghi chú còn tách rời — đề tên *"PART 5: INCOMPLETE SENTENCES (2)"* có dấu hai
chấm trong chính tên nó, nên cắt tiền tố sau đó là không đáng tin), và giao diện chỉ vẽ 25 dòng đầu.

## Upload hai lần cùng một quyển

Nhìn thấy trong log của bạn: hai dòng import cùng một file, cách nhau 7 phút — quyển đầu tưởng treo
nên upload lại. Kết quả: hai lượt đọc, hai lần tiền AI, và một loạt *"asks exactly the same
questions as …"* ở cuối (36 dòng, mà tên đề trùng nhau nên đọc như thể đề trùng với chính nó).

Giờ upload trùng bị **chặn ở cửa**: cùng org, cùng tên file, cùng kích thước, và lượt trước còn
đang chạy → trả 409 kèm *"đang đọc — <đang ở bước nào>"*. Kiểm hai lần: một lần trước khi tạo dòng
import, và một lần **sau** khi tạo (bỏ qua chính nó) để hai upload cách nhau một milli-giây cũng chỉ
một cái sống — cái thua tự xoá dòng của mình. Thử 3 upload song song: **1 job, 1 dòng import, 120
đề lưu một lần**. Và các đề trùng giờ gộp thành *một* dòng ghi chú kèm số lượng.

## Kiểm tra lỗi: `npm run verify`

Bộ kiểm tra nằm **trong repo**, không phải script rời, và chia làm năm lớp chạy được độc lập:

| Lệnh | Cần gì | Kiểm cái gì |
|---|---|---|
| `npm run verify` | không cần gì | typecheck + 154 phép kiểm logic thuần |
| `npm run verify:data` | `DATABASE_URL` | 50 phép kiểm tầng dữ liệu: mọi câu SQL ghi/đọc thật, kể cả các projection |
| `npm run verify:wires` | không cần gì (tự dựng server giả) | 28 phép kiểm ba wire, streaming, và khi model trả prose / chỉ reasoning / từ chối tham số / giới hạn 1 request |
| `npm run verify:storage` | không cần gì (tự dựng Hub giả) | 27 phép kiểm: PDF/MP3 lên Hub qua Xet/lfs, ba kiểu Hub, đọc lại qua CDN |
| `npm run verify:browser` | server đang chạy + Playwright | 63 phép kiểm: mọi trang render, guard chặn đúng người, đề gửi cho thí sinh không có đáp án, practice nộp xong có kết quả |
| `npm run verify:all` | cả năm | tất cả |

Vì sao chia lớp, và vì sao lớp dữ liệu quan trọng nhất: **SQL là string**. Một câu `INSERT` liệt kê 19 cột
mà chỉ truyền 18 tham số vẫn typecheck sạch và chỉ chết lúc chạy — đúng lỗi đã xảy ra một lần trong
lúc làm phần tối ưu này. `verify:data` tạo thật một org, một đề, một bài thi đầy đủ, một lượt thi,
một lượt chấm, rồi xoá sạch; cột nào lệch tham số là gãy ngay.

Đáng chú ý trong `verify:data` là ba phép kiểm **đua nhau** (race):

```
✓ only one worker can claim it        (3 worker cùng nhận một job import → đúng 1 thắng)
✓ a one-use code is claimed once      (2 lượt redeem cùng lúc → đúng 1 được credit)
✓ a spend beyond the balance is refused
```

`scripts/verify/harness.ts` là "test runner" ~60 dòng, cố ý không thêm dependency: bộ kiểm phải chạy
được sau một lệnh `npm install` trên server của trường.

## Pre-flight: bắt lỗi đề trước khi thí sinh gặp

Một đề hỏng đến tay thí sinh thì không lấy lại được — phòng thi đang diễn ra. `src/lib/preflight.ts`
soi đề và chia làm hai loại: **blocking** (không publish được) và **advisory** (nên xem lại).

Blocking: số câu trùng nhau · câu không có đáp án để chấm · câu trắc nghiệm có dưới 2 lựa chọn ·
`[[n]]` không có câu tương ứng (thí sinh thấy ô trống không trả lời được) · đáp án trỏ tới nhãn
không in trên đề (chấm là *cả lớp* sai) · phần nghe không có file · đề rỗng.
Advisory: điểm các câu không cộng đúng tổng in trên đề · bài viết không ghi số từ tối thiểu · phần
không có câu nào · đề không ghi thời gian · số câu quá nhiều so với thời gian.

Chỗ nào dùng:
* **Trình soạn đề** hiện danh sách và **tự cập nhật** khi đang sửa (debounce 900ms), kèm nút *"go to
  question n"* nhảy đúng part.
* **Publish** một đề trả 409 kèm danh sách nếu còn blocking.
* **Publish một full test** chạy pre-flight trên *mọi* paper của nó.
* **Publish hàng loạt** (chọn 40 đề bấm Publish) vẫn kiểm từng đề — người bấm publish 40 đề một lúc
  chính là người chưa mở từng đề ra xem.

## Công cụ cho kho đề lớn

* **Tìm + lọc** ở `/admin/tests`: ô search (tên, thư mục, module) và bộ lọc *Published / Drafts / In
  the bank / Hidden from lists / With a recording*. Lọc ngay trong browser vì danh sách đã tải sẵn
  dạng metadata — round-trip mỗi lần gõ còn chậm hơn.
* **Sửa hàng loạt**: chọn nhiều đề → chuyển thư mục · vào/ra kho · publish · unpublish · ẩn sau full
  test · xoá. Mọi hành động đều có `orgId` **trong điều kiện SQL**, nên một id lạ từ tenant khác
  không đổi được gì (`changed: 0`) thay vì được tin.
* **Không import trùng**: mỗi đề có `fingerprint` — hash sha256 của *nội dung câu hỏi* đã chuẩn hoá
  (không tính id, không tính điểm, vì hai lần parse cùng một file cho id khác nhau). Upload lại cùng
  quyển sách: `0 new papers`, kèm ghi rõ *"asks exactly the same questions as X"*. Đề quá ngắn
  (<40 ký tự nội dung) không lấy fingerprint — không đủ để chắc.

## Tối ưu: từ hàng trăm truy vấn xuống một

Trường upload cả quyển sách thì một org có hàng trăm đề. Những chỗ vỡ ở quy mô đó, và cách sửa:

| Chỗ | Trước | Sau |
|---|---|---|
| Autosave (1,2s/lần/thí sinh) | `attempts.byId` kéo **cả đề** kèm 4 join | `attempts.guard` — 9 cột, không join |
| Màn giám thị đang thi | mỗi thí sinh 2 truy vấn events + cả đề | `attempts.roster` + `events.countsForSession` (1 truy vấn) |
| `/admin/tests` | 300 đề = **301** truy vấn + ~25MB JSON | 1 truy vấn `listOrgWithCounts`, không có `content` |
| `/admin/reports` | 1000 lượt thi **+ mọi đề** rồi lọc trong JS | `attempts.finished` — 1 truy vấn, gom trong 1 vòng lặp |
| Roster full test | 400 thí sinh ≈ 3.200 truy vấn | đọc 1 lần rồi nhóm; tiêu đề paper lấy 1 truy vấn |
| Dashboard/catalogue | parse JSON mỗi đề chỉ để in "40 câu" | cột `questionCount`, `hasAudio`, `summary` tính lúc ghi |
| Testora library | parse 500 đề để hiện danh sách | metadata + `copiedSources` |
| `/api/attempts` | `listForSuite` gọi **4 lần**/request | đọc 1 lần dùng lại |
| "Đã nộp chưa?" | tải **cả phòng** kèm đề rồi lọc | `finishedInSession` — 1 dòng |
| AI usage của trường | `GROUP BY` toàn platform rồi lọc JS | `orgId` vào `WHERE` |
| `settings LIKE '%assembledFor%'` | quét bảng + JSON | cột `assembledFor` + index |

Và **22 index** được thêm (`LATER_INDEXES`), gồm `attempts(testId)`, `attempts(suiteId, userId)`,
`imports(orgId, createdAt)` — bảng `imports` trước đó không có index nào ngoài khoá chính. Chi tiết
đáng ghi lại: index mới **đặt tên theo cột** (`attempts_user_started` thay vì `attempts_user`), vì
`CREATE INDEX IF NOT EXISTS attempts_user` trên database cũ sẽ *âm thầm bỏ qua* và index gộp không
bao giờ được tạo; index cũ hẹp hơn thì `DROP` để ghi không phải trả giá hai lần.

## Những lỗi đã sửa trong lượt soát này

Hai agent đọc toàn bộ code (một về đúng/bảo mật, một về hiệu năng/toàn vẹn dữ liệu), cộng những gì
lòi ra khi dùng thật. Hai mươi hai lỗi **thật** đã sửa, xếp theo mức nghiêm trọng:

1. **Đáp án nằm trong trang thi.** `/test/[id]` truyền cả `ExamContent` — gồm `answers` từng câu —
   vào `ExamShell`, mà đây là client component: toàn bộ đáp án nằm trong RSC payload, xem được bằng
   View Source **trong lúc đang thi**. Sửa: `forCandidate()` (`src/types/exam.ts`) bóc `answers`,
   `markingNote`, `fields[].answers` và `markingNotes` trước khi gửi; chấm vẫn chạy server-side từ
   đề trong database. Có phép kiểm cố định trong cả `verify` và `verify:browser`.
2. **`POST /api/setup` mở lại sau mỗi redeploy.** Điều kiện là `setupNeeded()`, mà cái đó *cũng* true
   khi **storage** chưa cấu hình — và storage nằm trong file trên đĩa máy, thứ mà serverless xoá mỗi
   lần deploy. Ai vào site sau redeploy cũng tạo được platform admin. Sửa: điều kiện là
   `users.platformAdminCount() > 0`, tức **database** quyết định, không phải file. Cùng lỗ đó ở
   `/api/setup/storage` (trỏ vault sang bucket của người khác) và `/api/auth/hf/start?intent=storage`.
3. **`users.addCredits` không chạy được trên Postgres.** Dùng `MAX(0, credits + ?)` — đó là cú pháp
   SQLite; Postgres không có `max` hai tham số nên **mọi** lượt trừ credit đều throw. Trong
   `/api/attempts` lệnh trừ nằm *sau* khi tạo attempt, nên retry là resume miễn phí: đề bán bằng
   credit sat không mất gì. Sửa: `GREATEST`, cộng thêm `spendCredits` trừ tiền **và** kiểm số dư
   trong một câu lệnh, gọi **trước** khi tạo attempt, và hoàn lại nếu tạo attempt lỗi.
4. **`sameOrg` nhận bất kỳ membership.** Giáo viên trường A đồng thời là *thí sinh* trường B được
   quyền staff ở trường B — tới mức `DELETE /api/admin/tests/<id>?force=1`, cascade mất luôn kết quả
   thi của trường B. Sửa: phải là **staff** ở org đó (`isStaff(elsewhere.role)`).
5. **`PUT /api/admin/suites/[id]` không kiểm chủ sở hữu của `items`.** Route POST kiểm, route PUT
   thì không — trỏ được một section vào đề của tenant khác. Sửa: kiểm từng `testId` bằng `sameOrg`.
6. **Hai worker đọc cùng một job import.** Ba chỗ gọi `resumeStalled`: upload, **mỗi 2,5 giây** khi
   màn Import poll, và cron. `status='parsing'` chỉ được set *sau* khi việc đã bắt đầu → không có
   compare-and-swap. Sách 20 đề thành 40 đề, tiền AI trả hai lần, `testIds` của worker này bị worker
   kia ghi đè. Sửa: `imports.claim()` — `UPDATE ... WHERE claimedAt IS NULL OR claimedAt <= stale
   RETURNING *`, chỉ worker nhận được dòng mới chạy; nhả claim khi dừng theo time budget.
7. **Đua nhau khi redeem code và khi chấm.** Code `maxUses = 1` redeem hai lần cùng lúc thì cả hai
   qua vòng kiểm; hai người chấm (hoặc AI + người) lưu cùng một câu thì thành **hai dòng** markings
   và điểm là tổng của cả hai. Sửa: `accessCodes.claim()` tăng đếm trong chính điều kiện; markings
   có **unique index** `(attemptId, questionId)` + upsert (update trước, insert sau, thua race thì
   update lại), kèm bước migration dọn dòng trùng cũ.

8. **Storage sập thì màn Storage sập theo — mà đó là chỗ duy nhất sửa được.** Cả bộ cấu hình
   (kể cả key) nằm *trong* store chính, nên key hết hạn hoặc Hugging Face down một tiếng là
   `/platform/storage` và `/admin/storage` trả **500**: đúng cái trang cần vào để sửa nguyên nhân
   lại là trang không mở được. Sửa: đường đọc dành cho console đi qua `readVaultSoft()` /
   `bucketsSoft()` — lỗi trả về thành **một câu**, trang vẫn render, hiện banner *"the list below
   may be incomplete"* kèm lý do (không answer · key bị thu hồi · lý do khác), và **vẫn hiện target
   chính** để sửa key ngay tại đó. Đường **ghi** vẫn throw như cũ, và `retentionHoursFor` bản cứng
   vẫn giữ nguyên cho tác vụ **xoá file**: một lượt quét không đọc được luật giữ file thì phải
   *dừng*, không được đoán "giữ 0 giờ" rồi xoá đề của trường.

9. **Practice nộp bài xong không thấy kết quả đâu.** Nộp xong, thí sinh bị đưa **về hub** — mà hub
   thì cố tình lọc practice ra khỏi báo cáo, nên nó hiện lại đúng màn chọn Simulation/Practice và
   **không có một chữ nào** về bài vừa làm. Bài thi thật về hub là đúng (còn kỹ năng sau để làm, và
   điểm là của cả bài); practice thì ngược lại — làm lẻ một kỹ năng, cố ý không vào báo cáo, nên hub
   không có gì để hiện. Sửa: `/submit` trả `practice: true` và `suiteId: null`, thí sinh đi thẳng
   tới `/results/<id>`; trang kết quả **không giữ điểm** của practice (không có sitting nào để
   "release" nó cả), gắn nhãn *Practice run* kèm đường về bài thi; và hub hiện *"Your last practice
   run … See it again"*. Có phép kiểm chạy thật trong `verify:browser`: nộp một lượt practice rồi
   kiểm đúng ba thứ — nộp được, được đánh dấu là practice, và **không** bị đẩy về hub.
10. **Trắc nghiệm in đáp án ở dòng dưới bị đọc thành một lựa chọn.** `A. review   B. reviews   C.
   reviewed   D. reviewing` nằm riêng một dòng dưới câu hỏi — layout phổ biến nhất ngoài IELTS —
   khớp luật "một dòng một lựa chọn" trước (vì dòng đó *bắt đầu* bằng `A.`), nên B, C, D chui vào
   phần chữ của A. Kết quả: cả trang trắc nghiệm thành câu có **một** lựa chọn, rồi lựa chọn lẻ bị
   bỏ và đề thành *short answer*. Sửa: `optionRun()` — dòng nào chỉ gồm một dãy nhãn thì cắt thành
   từng lựa chọn, kiểm trước luật cũ. (`splitInlineOptions` không dùng lại được: nó cố tình bỏ qua
   dòng không có phần thân câu hỏi.)

11. **Upload sách nặng làm treo cả site.** Cả quyển được đọc xong mới lưu, trên một luồng, không
   nhả CPU giữa các đề — nên mọi request khác xếp hàng sau nó, kể cả autosave của thí sinh **đang
   thi**. Sửa: lưu từng đề ngay khi đọc (`onParsed`), nhả event loop mỗi đề, mỗi tiến trình đọc một
   cuốn một lúc, time budget ở mọi môi trường + tự xin lượt tiếp. Đo lại với một cuốn 120 đề:
   `/api/health` giữ **5–80ms** suốt lúc import, số đề trong kho tăng dần thay vì nhảy một phát.
12. **Đáp án cuối sách bị bỏ, rồi model tự nghĩ ra đáp án.** Hai lỗi chồng nhau: key chỉ cắt được
   theo `TEST n` (sách bài tập thành không có key), và key **chỉ điền vào câu chưa có đáp án** —
   mà model thì câu nào cũng trả lời, nên đáp án in trong sách bị vứt. Sửa: ghép key theo tiêu đề ·
   theo từng đợt số · theo dải số; và **key in trong sách thắng**, lệch thì ghi đè kèm báo.
13. **Tạm dừng giữa chừng = mất phần chưa đọc.** Lượt sau cần file gốc, mà file có thể đã bị xoá
   theo retention hoặc chưa từng lưu được. Sửa: text trích được ghi lên dòng import ngay từ đầu và
   lượt sau chạy tiếp từ đó; không còn text thì kết thúc *committed* kèm "đọc được N đề" thay vì
   báo fail đè lên N đề đã lưu.

14. **Upload PDF nào cũng lỗi Hugging Face.** Store gửi file trong commit, mà Hub từ chối binary
   gửi kiểu đó — nên **mọi** PDF, .docx, MP3 đều không lưu được. Sửa: đi qua client chính chủ của
   Hub (Xet), lùi về git-lfs tự làm, inline chỉ dành cho text; cộng xử lý 302 sang CDN khi đọc lại
   (hop đó phải bỏ token). Trần 9 MB cho file nghe cũng bỏ luôn — giờ 200 MB.
15. **Và PDF đọc được hay không là chuyện may rủi.** `pdf-parse` đọc quá đuôi buffer; Node pool
   buffer nhỏ nên cùng một PDF lúc parse được lúc `bad XRef entry`. Sửa: chuyển sang `unpdf`, copy
   bytes sang vùng nhớ riêng, thêm `pdftotext -layout` khi máy có poppler. Có phép kiểm chạy đúng
   trò dịch pool để nó không quay lại.

16. **"Có đáp án cuối sách mà nó bảo không có đáp án".** Ba lỗi trong một: chỉ tìm được vài kiểu
   tiêu đề key (`ANSWERS`, `KEYS`, sách không in tiêu đề → không thấy gì); ghép **theo số**, mà sách
   đánh số lại từ 1 mỗi bài thì mọi bài đều nhận đáp án của bài đầu (hoặc không nhận gì); và ghép
   **theo vị trí** chỉ chạy khi số đợt key trùng khít số đề. Sửa: nhận diện key kể cả không có tiêu
   đề, chặn hẳn cách ghép theo số khi số bị lặp giữa các bài, và ghép theo vị trí có đánh số lại
   kèm kiểm tổng lệch ≤ 12%. Chạy thật với sách 42 bài × 13 câu, key chạy thẳng 1…546:
   **42/42 đề nhận đúng phần của nó**, đúng nhịp (bài 3 bắt đầu từ đáp án 27, không phải 1).
17. **Và hai dòng ghi chú tự phủ định nhau.** *"No printed answer key was found"* (đúng với riêng
   tờ đề) đứng ngay cạnh *"13 answer(s) were read straight out of the printed key"*. Sửa: khi key
   ngoài được áp vào thì dòng cũ được **lấy ra**. Cộng: ghi chú giống nhau lặp lại theo từng đề
   (42 lần một câu) giờ gộp còn một dòng kèm *"2 of the notes above applied to more than one
   paper"* — một lượt import 42 đề còn **7 dòng** ghi chú thay vì 90.

18. **Provider giới hạn 1 request/lúc → 2/3 quyển sách không có AI.** 429
   `concurrency_limit_exceeded` bị coi là lỗi chết, nên từ đề 50 trở đi rơi hết về rule parser. Sửa:
   xếp hàng gọi model (mặc định 1 cùng lúc, `AI_CONCURRENCY`) + thử lại 429/5xx theo bậc thang có
   tôn trọng `Retry-After`.
19. **Console đơ khi đang đọc sách — do chính tui.** `extractedText` (tới 1,5 MB) nằm trong
   `SELECT *` của danh sách import, mà màn đó poll mỗi 2,5 giây; stream tiến độ đọc lại cả dòng mỗi
   600ms; và mỗi lần poll còn chạy một lượt sweep có fetch file từ storage. Sửa: projection
   `IMPORT_META`, stream đọc metadata, sweep tối đa 15 giây một lần. Đo lại: **340 KB → 6 KB** một
   lần poll.
20. **Ghi chú lặp 201 dòng và upload trùng không bị chặn.** Gộp ghi chú ngay tại chỗ sinh ra (201 →
   7 dòng), và chặn upload trùng bằng hai lượt kiểm (trước và sau khi tạo dòng import) nên 3 upload
   song song chỉ còn 1 job.

21. **Bank rỗng trong khi Papers bảo đề đang ở trong bank.** Next giữ trang đã prefetch trong
   client router cache, nên bấm *Bank* trong lúc đang import (hoặc chỉ hover vào nó) là lấy đúng bản
   fetch **trước khi** đề tồn tại — một cái kho rỗng, cạnh danh sách Papers nói đề nằm trong kho.
   Sửa: nav console tắt prefetch, màn Bank tự `router.refresh()` khi vào và có nút **Refresh**, kèm
   tên tổ chức ngay cạnh chữ "Bank" (để một vụ nhầm org nhìn thấy được chứ không hiện ra thành kho
   rỗng), và khi kho rỗng mà tổ chức có đề ngoài kho thì nói thẳng: *"Nothing in the bank of X —
   though this organisation has 126 paper(s) outside it"* kèm đường tới Papers.

22. **Nhập trang key rồi vẫn thấy "no printed answer key".** Hai chuyện: (a) ghi chú về cả quyển
   chỉ được ghi khi chạy xong — nên trong lúc đọc, cái duy nhất hiện ra là câu "không có key" của
   từng tờ đề, còn câu "đã cắt key từ trang 178" thì không ai thấy; (b) ghép key cho sách đánh số
   lại từ 1 mỗi bài chỉ có ghép-theo-số (vô nghĩa ở đây) và ghép-tuần-tự-có-kiểm-tổng (dễ bị chặn).
   Sửa: `onNote` đẩy ghi chú lên ngay, cộng cách ghép **theo từng khối key** (khối nào khớp số câu
   của bài đó, nhìn trước 3 khối), và nới ngưỡng lệch tổng cho trường hợp người dùng đã tự chỉ trang.

Ngoài ra: `/api/health` cho uptime check (chỉ báo database/storage, không hé version hay hostname);
**giới hạn số lần đăng nhập** (10 lần/phút theo IP *và* theo tên đăng nhập — chặn cả botnet rải một
mật khẩu và một máy dò nhiều tài khoản; đăng nhập đúng thì xoá đếm); giới hạn redeem code
(20 lần/phút); và một trường không còn ghi đè được số báo danh mà trường khác đã đặt cho thí sinh.

## Xuất kết quả ra CSV

`/api/admin/reports/export` (thêm `?sitting=<id>` hoặc `?suite=<id>`). Hai chi tiết mà một file tải
từ browser hay thiếu, và trường sẽ phát hiện ngay: **byte-order mark** để Excel đọc đúng tên tiếng
Việt thay vì mojibake, và **chặn công thức** — ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm dấu nháy,
vì đó là tên do người khác nhập và Excel sẽ *chạy* nó.

## Bảo mật cần làm trước khi chạy thật

* Đổi `SESSION_SECRET` thành chuỗi ngẫu nhiên ≥ 32 ký tự.
* Chạy sau HTTPS (cookie đã bật `secure` khi `NODE_ENV=production`).
* Mật khẩu băm bằng `scrypt` kèm salt riêng từng tài khoản.
* Đồng hồ thi lấy từ `endsAt` trong database — client chỉ hiển thị.
* Chấm bài chạy hoàn toàn ở server; đáp án không bao giờ gửi xuống trình duyệt khi đang thi.
* API key của AI mã hoá AES-256-GCM bằng khoá dẫn xuất từ `SESSION_SECRET`; giao diện chỉ
  nhận về bản che (`sk-…abcd`).
* Mọi API quản trị đi qua `staffContext()`, và mọi bản ghi đều kiểm tra `orgId` — một tổ
  chức không đọc được dữ liệu của tổ chức khác kể cả khi đoán đúng id.

---

## Lệnh

```bash
npm run dev           # dev server
npm run migrate       # tạo / cập nhật schema (tuỳ chọn — app tự làm khi chạy)
npm run seed          # dữ liệu mẫu (chạy lại được)
npm run build         # build production
npm run start         # chạy bản build
npm run typecheck     # kiểm tra TypeScript

npm run verify        # typecheck + 154 phép kiểm logic (không cần gì)
npm run verify:data   # 50 phép kiểm tầng SQL (cần DATABASE_URL)
npm run verify:wires  # 28 phép kiểm provider + streaming (tự dựng server giả)
npm run verify:storage # 27 phép kiểm lưu file lên Hub (tự dựng Hub giả)
npm run verify:browser  # 63 phép kiểm qua browser (cần server đang chạy + Playwright)
npm run verify:all    # cả năm
```

`verify:browser` dùng `BASE_URL` (mặc định `http://localhost:3000`), `CHROMIUM_PATH` nếu Chromium
nằm ngoài chỗ Playwright hay tìm, và `VERIFY_ADMIN` / `VERIFY_OWNER` / `VERIFY_TEACHER` /
`VERIFY_CANDIDATE` (kèm `*_PW`) nếu tài khoản seed đã đổi.
