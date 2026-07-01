# Spending Tracker

A single-user personal spending tracker: scan receipts, categorize line items, sync bank
transactions via Plaid, and chart spending over time. See [CLAUDE.md](CLAUDE.md) for the
operating summary and [docs/](docs/) for the authoritative plan and user flow.

## Repository layout

```
spending-tracker/
├── CLAUDE.md                  # operating summary + non-negotiable conventions
├── docs/
│   ├── implementation-plan.md # architecture, data model, phased roadmap (authoritative)
│   └── user-flow.md           # every screen & state (authoritative)
├── frontend/                  # React + Vite SPA (TypeScript strict, Tailwind, shadcn/ui)
├── backend/                   # FastAPI on AWS Lambda (uv, SQLModel + Alembic)
└── infra/                     # AWS SAM template (API Lambda, worker Lambda, SQS+DLQ, EventBridge)
```

## Quick start (local dev)

### Backend
```bash
cd backend
uv sync                        # install deps into .venv (pins Python 3.12)
cp .env.example .env           # fill in SUPABASE_DB_URL etc. (local only; prod uses SSM)
uv run uvicorn app.main:app --reload   # plain uvicorn locally; Mangum only wraps in Lambda
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
```

## Deploy

- **Frontend** → Cloudflare Pages (`pnpm build` → `frontend/dist`).
- **Backend + infra** → AWS SAM: `sam build --use-container && sam deploy` from `infra/`.

Requires the AWS SAM CLI (not yet installed on this machine) and an AWS account on the
Paid Plan with a $1 budget alert. See CLAUDE.md → "Things only the human can do."

## Money & dates (read before touching the schema)

- **All money is integer cents** (`*_cents BIGINT`). Never `float`.
- `purchased_on` is a **local calendar DATE**, never a UTC timestamp.
- **RLS is enforced for real** — every request sets the verified Supabase JWT's claims on the
  DB session so Postgres Row-Level Security applies to Lambda queries. See
  [backend/app/db.py](backend/app/db.py).
