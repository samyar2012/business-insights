# Business Insights

SaaS platform for ecommerce operators to scan storefront health, track competitive signals, and get actionable growth guidance.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind |
| Backend | Node.js, Express (`backend/`) |
| Database | PostgreSQL via Supabase |
| Auth | Email/password with JWT sessions |

## Features

- **Auth** - Sign up, log in, and secure API routes with bearer tokens.
- **Business onboarding** - Capture business profile, store URL, and baseline metrics on first login.
- **Business Scanner** - Rule-based scan of store, social, and competitor URLs with scores, strengths, risks, and next actions.
- **Dashboard & businesses** - Manage one or more businesses from the app shell.
- **Roadmap tools** - Store Health Report, Social Content Analyzer, Competitor Tracker, and AI Growth Coach (UI stubs; full automation coming next).

The legacy churn prediction stack under `services/` is kept for reference only. The main app uses root `backend/` and does not depend on it.

## Local development

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Set DB_HOST, DB_PASSWORD, and JWT_SECRET in .env
npm run init-db      # first time: users + profiles
npm run migrate-v2   # onboarding + businesses tables
npm run migrate-v3   # business_scans table
npm run dev
```

Health check: `GET http://localhost:3001/api/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`. Optional: set `VITE_API_BASE_URL` at build time for production.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Current user + businesses |
| GET/POST | `/api/businesses` | List / create businesses |
| POST | `/api/businesses/onboarding` | Complete onboarding |
| POST | `/api/scans` | Run a business scan |
| GET | `/api/scans` | List your scans |
| GET | `/api/scans/:id` | Get one scan |

Scans require `business_id` and `store_url`. Users can only scan and read scans for their own businesses.

## Environment variables (backend)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Sign JWTs (use 32+ random chars) |
| `JWT_EXPIRES_IN` | Token lifetime (default `1d`) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `DB_HOST`, `DB_PASSWORD`, ... | Supabase Postgres (recommended) |
| `SUPABASE_DB_URL` | Alternative single connection string |
| `PORT` | API port (default `3001`) |

See `backend/.env.example` for a template.

## Production checklist

1. Run all SQL migrations against your Supabase/Postgres instance.
2. Set `JWT_SECRET`, database credentials, and `CORS_ORIGIN` on the backend.
3. Build the frontend: `cd frontend && npm run build` and serve `frontend/dist`.
4. Do not commit `.env`, `node_modules/`, or local database files.
