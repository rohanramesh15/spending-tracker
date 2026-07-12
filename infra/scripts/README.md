# CI/CD one-time setup

Two scripts wire up the deploy half of the pipeline (CI already runs with no setup).
Run once, in order, from the repo root:

```bash
# 1) Create the GitHub OIDC provider + least-privilege deploy role in AWS.
#    Needs your AWS admin creds locally. Prints the role ARN. Idempotent.
bash infra/scripts/setup-aws-oidc.sh

# 2) Push secrets + variables (incl. the role ARN) into GitHub Actions.
#    Reads your local gitignored env files; encrypts secrets before upload.
uv run --with pynacl python infra/scripts/setup-github-cicd.py
```

That's everything the automated part can't do for itself: IAM role creation and
secret-store writes both require a human (the CI/CD agent is intentionally denied both).

Already done (by the setup, via the API): the `production` / `production-db`
environments with a required reviewer, and branch protection on `main`.

After both scripts run, deploy-on-merge is live: merge a PR → `deploy.yml` waits for your
approval on the `production` environment → deploys → post-deploy smoke tests.
