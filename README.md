# Business Insights

SaaS platform for ecommerce operators to research their business online, scan storefront health, track action plans, and get AI-guided growth recommendations.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind |
| Backend | Node.js, Express (`backend/`) |
| Database | PostgreSQL via Supabase |
| Auth | Email/password with JWT sessions |

## Features

- **Auth & onboarding** - Sign up, capture business profile (name, type, product, audience, store URL, metrics).
- **Business research engine** - Web search + homepage scan from onboarding data; scores, signals, and sources saved to Postgres.
- **Business Scanner** - Rule-based URL scan with strengths, risks, and next actions.
- **Action plan** - Turn scan recommendations into trackable tasks.
- **AI Growth Coach** - Mock/custom AI chat using stored research, scans, actions, and user memory (no OpenAI required).
- **Tools** - Store health, social analyzer, competitor tracker, content generator (mock AI in v1).

Business Insights saves research and user memory to personalize future recommendations. **This is not model training yet.** Future model training will use exported consent-based datasets.

## Local development

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Set DB_HOST, DB_PASSWORD, JWT_SECRET in .env
npm run init-db
npm run migrate-v2
npm run migrate-v3
npm run migrate-v4
npm run migrate-v5
npm run migrate-v6
npm run dev
```

Health check: `GET http://localhost:3001/api/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`.

## Search setup

### Mock mode (default)

No API keys required. Search returns realistic fake results and research still runs end-to-end.

```env
SEARCH_PROVIDER=mock
```

### Google Custom Search

1. Create a [Google Cloud](https://console.cloud.google.com/) project and enable **Custom Search API**.
2. Create an API key → `GOOGLE_SEARCH_API_KEY`.
3. Create a [Programmable Search Engine](https://programmablesearchengine.google.com/) → copy the Search Engine ID → `GOOGLE_SEARCH_CX`.

```env
SEARCH_PROVIDER=google
GOOGLE_SEARCH_API_KEY=your_key
GOOGLE_SEARCH_CX=your_cx
DAILY_SEARCH_LIMIT=20
```

**Cost control:** Results are cached in `research_events` for 24 hours per user/business/query. Daily Google API calls per user are capped (default 20/day). When the limit is hit, cached or mock results are returned.

Only one search provider is active at a time (`google` or `mock`). The service is abstracted so additional providers can be added later.

## AI provider

v1 uses **mock AI only** — no OpenAI dependency.

```env
AI_PROVIDER=mock
CUSTOM_AI_BASE_URL=
CUSTOM_AI_API_KEY=
CUSTOM_AI_MODEL=business-insights-ai
```

`POST /api/ai/chat` loads business research, scans, action items, and `user_memory` before answering.

## Research engine flow

1. User completes onboarding (business name, type, product, audience, store URL, etc.).
2. Dashboard shows **Run business research** if no profile exists.
3. `POST /api/research/business/:id/run`:
   - Builds search queries from business data
   - Runs cached web search (mock or Google)
   - Scans store homepage (+ policy links when found)
   - Scores store, trust, content, offer, and market dimensions
   - Saves `business_research_profiles`, `research_events`, `website_scan_events`
   - Updates `user_memory` with key facts
4. Full report at `/app/research/:businessId`.

## Website scan (v1)

Server-side fetch of the submitted homepage URL only (no crawler). Extracts title, meta description, headings, text sample, links, HTTPS, policy pages, social links, and product/CTA keywords. Optionally fetches a few linked policy pages.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/businesses/onboarding` | Complete onboarding |
| POST | `/api/research/business/:id/run` | Run business research |
| GET | `/api/research/business/:id` | Latest research profile |
| POST | `/api/research/business/:id/rescan` | New research run |
| POST | `/api/ai/chat` | AI coach (mock) |
| POST | `/api/scans` | Run business scan |
| GET/POST/PATCH | `/api/actions` | Action plan items |
| GET/POST/DELETE | `/api/memory` | User memory |

## Environment variables (backend)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Sign JWTs |
| `DB_HOST`, `DB_PASSWORD`, ... | Supabase Postgres |
| `SEARCH_PROVIDER` | `mock` or `google` |
| `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` | Google Custom Search |
| `DAILY_SEARCH_LIMIT` | Per-user daily Google calls (default 20) |
| `AI_PROVIDER` | `mock` (v1) |
| `CUSTOM_AI_*` | Future custom model endpoint |

See `backend/.env.example`.

## Production checklist

1. Run all migrations (`init-db` through `migrate-v6`).
2. Set `JWT_SECRET`, database credentials, and `CORS_ORIGIN`.
3. Optionally configure Google Search for live research.
4. Build frontend: `cd frontend && npm run build`.
5. Do **not** commit `.env`, `node_modules/`, `dist/`, or local DB files.
