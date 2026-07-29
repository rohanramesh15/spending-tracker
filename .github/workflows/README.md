# CI/CD

Workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| **ci.yml** | every PR + push to `main` | Path-filtered: **backend** (Postgres service → roles → `alembic upgrade` → ruff/black → `pytest`, incl. integration + RLS smoke + the route-inventory guard), **frontend** (`pnpm lint`/`test`/`build`), **infra** (`sam validate --lint`). Gate merges on these. Node 22 + pnpm 11.9 pinned. |
| **codeql.yml** | PR + push to `main` + weekly | **SAST** (static security analysis) for `javascript-typescript` and `python`, `security-extended` queries. Findings land in **Security → Code scanning**. Free on public repos. |
| **deploy.yml** | push to `main` | Path-filtered. **backend**: OIDC → `sam build --use-container` → `sam deploy`. **frontend**: `pnpm build` (VITE_* injected) → **bundle-URL guard** → `wrangler pages deploy`. **smoke**: `/healthz` 200, protected route 401, exactly one CORS header. Runs on the `production` environment for secret scoping — **no required reviewer**, deploys are automatic (see "Why deploys aren't reviewer-gated"). |
| **migrate.yml** | manual (`workflow_dispatch`) | Typed `migrate prod` confirmation + separate approver → `alembic upgrade head`. **DB migrations are never automatic.** |

Plus **`dependabot.yml`** (not a workflow): weekly dependency-update PRs for the frontend (pnpm), backend (pip/uv), and the pinned GitHub Actions. **`dependabot-auto-merge.yml`** auto-merges the minor/patch ones once `ci-success` passes (majors stay manual). **Secret scanning + push protection** are enabled on the repo.

The frontend updater carries a **7-day `cooldown`**. pnpm 11 enforces a supply-chain `minimumReleaseAge` (~24h) during `pnpm install --frozen-lockfile`; without the cooldown Dependabot proposes versions published hours earlier and every frontend PR dies on `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, which also silently stalls auto-merge. Don't fix that by relaxing the pnpm policy — the delay is the protection.

## Why deploys aren't reviewer-gated

`deploy.yml` serializes on `concurrency: deploy-main` with `cancel-in-progress: false` so a deploy is never severed mid-`sam deploy`. A required reviewer on `production` interacts badly with that: an unapproved run holds the lock indefinitely and every later push to `main` starves behind it with zero jobs. That happened — `main` sat 3 commits undeployed for a day while a run waited on an approval nobody clicked.

So `production` has no protection rules, and pushes to `main` deploy automatically. What backstops it: `ci-success` must be green to merge at all, the bundle-URL guard refuses to ship a blank app, and the `smoke` job verifies health/auth/CORS after the fact. If you ever want a manual gate back, pair it with `cancel-in-progress: true` or the deadlock returns.

`production-db` **keeps** its required reviewer — `migrate.yml` is still manual, typed-confirmation, and separately approved.

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

3. **Environments** (Settings → Environments): create `production` (**no** protection rules — see above) and `production-db` with a **required reviewer** (you) so migrations pause for approval.

4. **Branch protection** on `main`: require the CI checks (backend/frontend/infra) to pass and the branch to be up to date; disallow direct pushes.

Runtime secrets (Gemini/Plaid/Kroger/Places/DB) stay in **AWS SSM** and are read by the Lambda at boot — CI/CD never handles them.
