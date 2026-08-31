# Scrolic - Social Trading Platform Indonesia

## Original Problem Statement
Deploy `scrolic.zip` as-is ke Emergent tanpa mengubah kode fitur, alur bisnis, UI, atau logika integrasi. Hanya konfigurasi environment yang disesuaikan agar berjalan di Emergent.

## Deploy Summary (2026-02-29)
- Extracted `scrolic.zip` → backend Python files ke `/app/backend/`, frontend Vite+React ke `/app/frontend/`
- Backend: FastAPI single-runtime (`server.py` 151KB) + Socket.IO + MongoDB
- Frontend: Vite 6 + React 19 + TypeScript + Tailwind 4 (bukan CRA)
- Kode aplikasi TIDAK diubah. Hanya menyesuaikan:
  - `/app/backend/.env`: `MONGO_URL`, `DB_NAME=scrolic`, `EMERGENT_LLM_KEY`, `CORS_ORIGINS=*`, placeholder untuk CTrader/Mayar/Google/SMTP/VAPID/EODHD
  - `/app/frontend/package.json` scripts: `start` → `vite --host 0.0.0.0 --port 3000` (agar cocok supervisor `yarn start`)
  - `/app/frontend/vite.config.ts`: `allowedHosts: true`, proxy `/api` & `/socket.io` ke `localhost:8001` untuk dev lokal
  - Tambah `react-is` (peer dep recharts)

## Architecture
- Backend: `/app/backend/server.py` (uvicorn 8001) + `database.py`, `auth_service.py`, `ctrader_client.py`, `ctrader_oauth.py`, `ctrader_config.py`, `ticker.py`, `mongo_writer.py`, `event_contract.py`, `shard_manager.py`, `rate_limiter.py`, `db_seed.py`, `services/email_service.py`
- Frontend: `/app/frontend/src/{App.tsx, main.tsx, views/, components/, services/, data/, utils/}` + `index.html`, `vite.config.ts`
- Frontend memakai relative `/api/*` — routed ingress ke backend 8001
- MongoDB via `MONGO_URL` + `DB_NAME=scrolic` (fresh DB, data lama tidak ikut)

## Boot Verification (Phase 2)
- Supervisor: backend + frontend + mongodb RUNNING
- `/api/health` → 200 `{"ok":true,"database":"connected"}`
- `/api/feed`, `/api/users`, `/api/strategies`, `/api/notifications/vapid-public-key`, `/api/config/energy-packages` → 200
- Frontend memuat UI Scrolic penuh (Untuk Anda / Mengikuti, DNA filter, bottom nav Feed/Explore/Dashboard/News/Profil)

## Pending — Phase 3 (setelah user isi credentials di `/app/backend/.env`)
- `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET` (env=live) — daftarkan `CTRADER_REDIRECT_URI` ke cTrader console
- `MAYAR_API_KEY`, `MAYAR_WEBHOOK_SECRET` — daftarkan `MAYAR_WEBHOOK_URL` ke Mayar dashboard
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — daftarkan redirect URI baru di Google Cloud Console (manual)
- `SMTP_PASSWORD` (Hostinger `team@scrolic.id`) — disarankan rotasi setelah deploy
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- `EODHD_API_KEY`
- Setelah semua diisi, `sudo supervisorctl restart backend` lalu jalankan Phase 4 verification

## Peringatan
- **CTRADER_ENV=live**: order flow real — jangan test order sampai QA manual
- **SMTP password** clear text — rotasi setelah deploy

## Preview URL
`https://scrolic-preview-1.preview.emergentagent.com`
