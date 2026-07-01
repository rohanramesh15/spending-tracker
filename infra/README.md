# Infrastructure (AWS SAM)

One SAM template ([template.yaml](template.yaml)) defines the whole backend:

- **ApiFunction** — FastAPI (via Mangum) behind a **Lambda Function URL** (no API
  Gateway — its ~29s cap can't hold a slow Gemini call).
- **WorkerFunction** — SQS-driven background worker (idle in Phase 1).
- **JobsQueue** + **JobsDLQ** — job queue with a dead-letter queue.
- **PriceRefreshSchedule** — EventBridge schedule, present but `DISABLED` until Phase 5.

All on AWS always-free allowances. **Never** add a NAT Gateway or Elastic IP.

## Prerequisites (human — see CLAUDE.md "Things only the human can do")

- AWS account on the **Paid Plan**, with a **$1 budget alert** set day one.
- The **AWS SAM CLI** installed (`brew install aws-sam-cli`) — not yet on this machine.
- SecureString parameters created in SSM under `/spending-tracker`:
  - `/spending-tracker/supabase-db-url` — the Supavisor pooler URL (port 6543)
  - `/spending-tracker/supabase-jwt-secret` **or** `/spending-tracker/supabase-jwks-url`

## Build & deploy

SAM builds Python functions from a `requirements.txt` in the CodeUri. This project uses
uv, so export one first:

```bash
cd backend
uv export --no-dev --no-emit-project --format requirements-txt > requirements.txt
cd ../infra
sam build --use-container      # container build matches the Lambda runtime (native libs)
sam deploy --guided            # first time; writes samconfig.toml
```

After deploy, take the `ApiFunctionUrl` output → set it as the frontend's
`VITE_API_BASE_URL`, and tighten the Function URL CORS `AllowOrigins` from `*` to the
real frontend origin.
