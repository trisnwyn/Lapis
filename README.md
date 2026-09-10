# Lapis

Trợ lý học tập cho sinh viên — một **workspace** cho mỗi khóa học: nhiệm vụ,
thư mục tài liệu local, và AI panel. Chạy hoàn toàn phía client, không server,
dùng OpenRouter API key của riêng bạn (lưu trong IndexedDB của trình duyệt).

## Cấu trúc

```
apps/
  web/          # Webapp chính (Vite + React + TS + Tailwind)
  extension/    # Chrome extension đồng bộ LMS (bước M5)
packages/
  core/         # Schema Dexie, repo CRUD, client OpenRouter
  lms-vcbi/     # Bộ bắt lịch học từ LMS của trường (bước M5)
```

## Chạy

```bash
pnpm install
pnpm dev        # webapp tại http://localhost:5173
pnpm typecheck  # kiểm tra type toàn monorepo
pnpm build      # build tất cả package
```

## Lộ trình

- [x] M1 — Scaffold, schema Dexie, cài đặt (OpenRouter key), CRUD khóa học, dashboard
- [x] M2 — Folder workspace (File System Access API) + tab Nhiệm vụ (CRUD, việc con)
- [x] M3 — Chat với AI: streaming OpenRouter, trích xuất PDF/txt (pdf.js), retrieval + citation
- [x] M4 — Vòng tool-use: create_task/list_tasks/update_task/search_materials/read_excerpt + PDF bài tập → nhiệm vụ
- [x] M5 — Extension Chrome: bắt lịch học từ API LMS (fetch-patch) → cầu nối webapp
- [x] M6 — Backup JSON (Settings → Dữ liệu), deploy config Vercel (`vercel.json`)
- [x] M7 — Xuất lịch Google Calendar: file .ics (toàn bộ / theo tuần) + link thêm-sự-kiện từng buổi
- [x] M8 — Đồng bộ thẳng Google Calendar (API + OAuth GIS): nút "Đồng bộ" → events pushed, id cố định nên re-sync không trùng

## Google Calendar (tự động bộ)

**Admin (bạn) làm 1 lần:**

1. [console.cloud.google.com](https://console.cloud.google.com) → tạo project → bật **Google Calendar API**
2. **Credentials → OAuth client ID (Web)** → Authorized JavaScript origins:
   `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5199`, domain Vercel của Lapis
3. Consent screen → **In production, external** (không verify là option B — user lần đầu bấm
   *Advanced → Go to Lapis* rồi Allow; token lâu dài, không lặp lại mỗi tuần)
4. Đặt **Client ID** vào env build / Vercel env: `VITE_GOOGLE_CLIENT_ID=<id>` (xem `.env.example`) → redeploy

**Người dùng (không cần console):** bấm "Đồng bộ tuần này"/"Đồng bộ toàn bộ lịch" → popup
Google xin quyền lần đầu → done. Re-sync không trùng vì event id cố định.

## Deploy (M6)

Webapp là SPA tĩnh — deploy lên **Vercel**:

1. Push repo lên GitHub
2. [vercel.com/new](https://vercel.com/new) → import repo (Vercel tự đọc `vercel.json`:
   build `pnpm --filter @lapis/web build`, output `apps/web/dist`)
3. Xong — domain tự cấp (`*.vercel.app`)

Hoặc bằng CLI: `npx vercel` từ thư mục gốc.

Không cần biến môi trường: OpenRouter key người dùng tự nhập trong app,
mọi data ở IndexedDB trình duyệt của từng người.

## Cài extension (M5)

1. `pnpm --filter @lapis/extension build` (nếu chưa có dist)
2. Mở `chrome://extensions` → bật **Developer mode** → **Load unpacked**
3. Chọn thư mục `apps/extension/dist`
4. Mở LMS, vào trang **Schedule** (trang có lưới "Lesson schedule") — extension tự bắt API lịch
5. Bấm icon Lapis trên thanh công cụ để xem trạng thái
6. Về webapp → ô **Tuần này** → **Nhập lịch từ LMS**
