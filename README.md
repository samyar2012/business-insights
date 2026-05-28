# RetainIQ (Customer Churn SaaS)

Production-oriented stack for a first release:

- **Frontend:** `frontend/` — Vite, React, TypeScript, Tailwind
- **Backend:** `backend/` — Node (Express), SQLite (`backend/data/app.db`), JWT auth, credits ledger
- **Model:** Python artifact `Chum_Predic/churn_model_artifact.joblib` invoked via `backend/python/predict_churn_cli.py`

**v1 (live in-app):** churn prediction, bulk CSV/PDF analysis (heuristics by default; optional OpenAI for PDF field merge), retention assistant (guided text). Additional capabilities are listed as **roadmap** on `/roadmap`, not as fake products.

**Legal:** `Privacy` and `Terms` pages are starter stubs — replace with counsel-reviewed text before handling regulated data or paid customers at scale.

## Local development

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set JWT_SECRET (use 32+ random chars if you simulate production)
npm run dev
```

Health check: `GET http://localhost:3001/api/health` returns `ok`, `version`, and `env`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional: `frontend/.env` with `VITE_API_BASE_URL=http://localhost:3001` (defaults to that URL in dev).

### Production checklist

1. **Backend:** `NODE_ENV=production`, `JWT_SECRET` ≥ 32 random characters (the API exits on startup if missing or too short).
2. **CORS:** set `CORS_ORIGIN` to your deployed frontend origin(s), comma-separated.
3. **Proxy:** if the app sits behind nginx, Cloudflare, or similar, set `TRUST_PROXY=1` so rate limiting and IP handling stay correct.
4. **Frontend build:** `cd frontend && npm run build` — serve `frontend/dist` as static files; point `VITE_API_BASE_URL` at your API URL at build time.
5. **Python:** ensure `PYTHON_BIN` and paths resolve on the server; the joblib path is resolved relative to the repo layout.
6. **Uploads:** tune `UPLOAD_MAX_BYTES` if needed (default ~12 MB).

## Environment variables (backend)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Sign JWTs; **required** in production (min 32 chars) |
| `ADMIN_SECRET` | Grant premium / admin operations |
| `CORS_ORIGIN` | Allowed browser origins (comma-separated); omit for permissive dev |
| `TRUST_PROXY` | Set `1` when behind a trusted reverse proxy |
| `AUTH_RATE_LIMIT_MAX` | Max auth attempts per IP per 15 minutes (default 40) |
| `API_RATE_LIMIT_MAX` | Max API requests per IP per minute (default 200) |
| `UPLOAD_MAX_BYTES` | Multer file size cap |
| `OPENAI_API_KEY` | Optional PDF field merge only |
| `PYTHON_BIN`, `PYTHON_PREDICT_CLI` | Python invocation |

## Credits (first release)

- New users start with **200** credits; referral adds **+30** to the **referrer** only.
- **Premium** users skip per-use credit deduction (billing integration is future work).
- Tool costs are defined in `backend/src/server.js` (`PRICE_CONFIG`).
