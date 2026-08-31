# NovaFrame API

Express REST API + BullMQ worker for the NovaFrame AI video generation platform.
Node.js (>=20) + Express + MongoDB/Mongoose + Redis/BullMQ + Socket.IO. Plain
JavaScript (ES Modules) — no TypeScript.

## Local development

```bash
cp .env.example .env        # fill in / adjust as needed — defaults work with local Mongo+Redis
npm install
npm run dev                 # API on :5000 (auto-restarts via --watch)
npm run worker               # in a second terminal — consumes the generation queue
```

Requires a local MongoDB and Redis (not included in this repo — see
`docker-compose.yml` at the repo root if present, or run them yourself).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API with `--watch` |
| `npm run worker` | Generation worker with `--watch` |
| `npm start` | API, production mode (no watch) |
| `npm run lint` | ESLint over `src/` |
| `npm test` | Node's built-in test runner (`*.test.js` files) |
| `npm run seed:mock-model` | Seeds the dev mock AI model/version |
| `npm run seed:wan-model` | Seeds the Wan model/version (requires `WAN_ADAPTER_ENABLED=true` and a real GPU environment to actually generate) |

## Architecture

See `docs/CURRENT_ARCHITECTURE.md`, `docs/PRODUCTION_AUDIT.md`,
`docs/TECHNICAL_DEBT.md`, and `docs/PRODUCTION_GAP_ANALYSIS.md` for a full
breakdown. In short: `routes → validators → controllers → services → models`,
with pluggable provider interfaces for storage (`services/storage/`),
payments (`services/payments/`), and AI generation (`services/adapters/`) —
swap the `*_PROVIDER` env var to change backend without touching callers.

## Health

- `GET /api/v1/health` — deep check (Mongo + Redis), used for readiness / the
  Docker `HEALTHCHECK`
- `GET /api/v1/health/live` — liveness only, no dependency calls

## Environment

All configuration is centralized and validated in `src/config/env.js` —
see `.env.example` for the full list. In production, startup fails fast if
`JWT_SECRET`/`JWT_REFRESH_SECRET` are missing, too short, default, or equal
to each other.

## Deployment target

- API: Render (see `Dockerfile`)
- Database: MongoDB Atlas
- Redis: managed Redis-compatible service
- Frontend: separate repo, deployed to Vercel (different origin — set
  `FRONTEND_URL` here to the exact Vercel origin for CORS)
