# CI/CD

Three workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| **ci.yml** | every PR + push to `main` | Path-filtered: **backend** (Postgres service → roles → `alembic upgrade` → ruff/black → `pytest`, incl. integration + RLS smoke + the route-inventory guard), **frontend** (`pnpm lint`/`test`/`build`), **infra** (`sam validate --lint`). Gate merges on these. |
| **deploy.yml** | push to `main` | Path-filtered. **backend**: OIDC → `sam build --use-container` → `sam deploy`. **frontend**: `pnpm build` (VITE_* injected) → **bundle-URL guard** → `wrangler pages deploy`. **smoke**: `/healthz` 200, protected route 401, exactly one CORS header. |
| **migrate.yml** | manual (`workflow_dispatch`) | Typed `migrate prod` confirmation + separate approver → `alembic upgrade head`. **DB migrations are never automatic.** |

## One-time setup (only the repo owner can do these)

1. **AWS OIDC + deploy role**
   - IAM → Identity providers → add `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`).
   - Create an IAM role trusting `repo:rohanramesh15/spending-tracker:*`, with permissions for CloudFormation, Lambda, IAM (PassRole for the function roles), SQS, Scheduler, SSM read, and the SAM S3 bucket.
   - Put its ARN in a repo **Variable** `AWS_DEPLOY_ROLE_ARN`.

2. **GitHub → Settings → Secrets and variables → Actions**
   - **Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, and `SUPABASE_DB_URL` (the pooler URL — used only by `migrate.yml`).
   - **Variables:** `AWS_DEPLOY_ROLE_ARN`, `VITE_API_BASE_URL` (`https://ke62nkioegebpwwgwzqmse2y740byqic.lambda-url.ca-central-1.on.aws`), `VITE_SUPABASE_URL` (`https://ppoqoknfpylhfjqdebew.supabase.co`).

3. **Environments** (Settings → Environments): create `production` and `production-db`, each with a **required reviewer** (you) so deploys/migrations pause for approval.

4. **Branch protection** on `main`: require the CI checks (backend/frontend/infra) to pass and the branch to be up to date; disallow direct pushes.

Runtime secrets (Gemini/Plaid/Kroger/Places/DB) stay in **AWS SSM** and are read by the Lambda at boot — CI/CD never handles them.
