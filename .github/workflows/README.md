# CI/CD

Workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| **ci.yml** | every PR + push to `main` | Path-filtered: **backend** (Postgres service → roles → `alembic upgrade` → ruff/black → `pytest`, incl. integration + RLS smoke + the route-inventory guard), **frontend** (`pnpm lint`/`test`/`build`), **infra** (`sam validate --lint`). Gate merges on these. Node 22 + pnpm 11.9 pinned. |
| **codeql.yml** | PR + push to `main` + weekly | **SAST** (static security analysis) for `javascript-typescript` and `python`, `security-extended` queries. Findings land in **Security → Code scanning**. Free on public repos. |
| **deploy.yml** | push to `main` | Path-filtered. **backend**: OIDC → `sam build --use-container` → `sam deploy`. **frontend**: `pnpm build` (VITE_* injected) → **bundle-URL guard** → `wrangler pages deploy`. **smoke**: `/healthz` 200, protected route 401, exactly one CORS header. Gated by the `production` environment (required reviewer). |
| **migrate.yml** | manual (`workflow_dispatch`) | Typed `migrate prod` confirmation + separate approver → `alembic upgrade head`. **DB migrations are never automatic.** |

Plus **`dependabot.yml`** (not a workflow): weekly dependency-update PRs for the frontend (pnpm), backend (pip/uv), and the pinned GitHub Actions. **`dependabot-auto-merge.yml`** auto-merges the minor/patch ones once `ci-success` passes (majors stay manual). **Secret scanning + push protection** are enabled on the repo.

## Observability — knowing when prod breaks

Defined as infrastructure in `infra/template.yaml` (CloudWatch alarms → SNS → email), all within always-free:

| Alarm | Fires when |
|---|---|
| `spending-tracker-api-errors` | the API Lambda logs ≥1 error in 5 min |
| `spending-tracker-worker-errors` | the worker Lambda (Plaid sync / jobs) errors |
| `spending-tracker-dlq-not-empty` | a background job failed 5× and hit the dead-letter queue |

The email goes to the `AlertEmail` template parameter. **After the first deploy, click the one-time "Confirm subscription" link AWS emails** — otherwise alarms can't reach you.

## Rollback

- **Backend:** a failed `sam deploy`/CloudFormation update rolls the stack back automatically. To undo a *successful-but-bad* deploy, re-run `deploy.yml` on the previous good commit (or `git revert` → merge).
- **Frontend:** Cloudflare Pages keeps every deployment — roll back instantly from the Pages dashboard (Deployments → previous → "Rollback"), or redeploy the previous commit.
- **DB:** migrations are reversible (`alembic downgrade -1`) via a manual `migrate.yml`-style run; never auto-rolled.

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
