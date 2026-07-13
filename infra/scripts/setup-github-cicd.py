"""One-time: push CI/CD config into GitHub Actions Secrets + Variables.

Run once after setup-aws-oidc.sh, from the repo root:

    uv run --with pynacl python infra/scripts/setup-github-cicd.py

Reads values from your local (gitignored) env files — .cf-secrets, frontend/.env,
backend/.env — and never prints them. Secrets are libsodium sealed-box encrypted before
upload (GitHub requirement). Idempotent. Uses the token from `git credential fill`, so no
token is stored here.

  Secrets   : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, VITE_SUPABASE_PUBLISHABLE_KEY,
              VITE_GOOGLE_MAPS_API_KEY, SUPABASE_DB_URL
  Variables : VITE_API_BASE_URL, VITE_SUPABASE_URL, AWS_DEPLOY_ROLE_ARN
"""
import base64
import json
import os
import subprocess
import urllib.error
import urllib.request

from nacl import encoding, public

REPO = "rohanramesh15/spending-tracker"
AWS_DEPLOY_ROLE_ARN = "arn:aws:iam::029944900530:role/github-actions-spending-tracker-deploy"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

cred = subprocess.run(
    ["git", "credential", "fill"],
    input="protocol=https\nhost=github.com\n\n",
    capture_output=True, text=True, cwd=ROOT,
)
TOKEN = next(l.split("=", 1)[1] for l in cred.stdout.splitlines() if l.startswith("password="))
H = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json", "User-Agent": "cc"}


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method, headers=H,
    )
    try:
        r = urllib.request.urlopen(req)
        raw = r.read()
        return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def readenv(rel):
    d = {}
    path = os.path.join(ROOT, rel)
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip().strip('"').strip("'")
    return d


cf = readenv(".cf-secrets")
fe = readenv("frontend/.env")
be = readenv("backend/.env")

# frontend/.env leaves VITE_API_BASE_URL blank on purpose (local dev proxies /api). The
# prod URL lives in the gitignored .env.production.local — prefer it, and never push a
# blank (an empty API URL ships a dead app + fails the deploy's bundle guard).
fe_prod = readenv("frontend/.env.production.local") if os.path.exists(
    os.path.join(ROOT, "frontend/.env.production.local")
) else {}
api_base = fe_prod.get("VITE_API_BASE_URL") or fe.get("VITE_API_BASE_URL")
if not api_base:
    raise SystemExit("VITE_API_BASE_URL is blank in both .env.production.local and .env")

secrets = {
    "CLOUDFLARE_API_TOKEN": cf["CLOUDFLARE_API_TOKEN"],
    "CLOUDFLARE_ACCOUNT_ID": cf["CLOUDFLARE_ACCOUNT_ID"],
    "VITE_SUPABASE_PUBLISHABLE_KEY": fe["VITE_SUPABASE_PUBLISHABLE_KEY"],
    "VITE_GOOGLE_MAPS_API_KEY": fe["VITE_GOOGLE_MAPS_API_KEY"],
    "SUPABASE_DB_URL": be["SUPABASE_DB_URL"],
}
variables = {
    "VITE_API_BASE_URL": fe["VITE_API_BASE_URL"],
    "VITE_SUPABASE_URL": fe["VITE_SUPABASE_URL"],
    "AWS_DEPLOY_ROLE_ARN": AWS_DEPLOY_ROLE_ARN,
}

st, pk = api("GET", "/actions/secrets/public-key")
if st != 200:
    raise SystemExit(f"could not fetch repo public key: {st} {pk}")
sealed = public.SealedBox(public.PublicKey(pk["key"].encode(), encoding.Base64Encoder()))

for name, val in secrets.items():
    enc = base64.b64encode(sealed.encrypt(val.encode())).decode()
    st, _ = api("PUT", f"/actions/secrets/{name}", {"encrypted_value": enc, "key_id": pk["key_id"]})
    print(f"  secret   upload: {'ok' if st in (201, 204) else st}")

for name, val in variables.items():
    st, _ = api("POST", "/actions/variables", {"name": name, "value": val})
    if st == 409:
        st, _ = api("PATCH", f"/actions/variables/{name}", {"name": name, "value": val})
    print(f"  variable {name}: {'ok' if st in (201, 204) else st}")

print("\nDone. Verify at: https://github.com/rohanramesh15/spending-tracker/settings/secrets/actions")
