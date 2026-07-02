"""Load secrets from SSM Parameter Store at Lambda init (CLAUDE.md #11).

Nothing secret is ever a plaintext Lambda env var or in source. The SAM template
sets ``SSM_PARAM_PREFIX`` (e.g. ``/spending-tracker``) and grants the function
``ssm:GetParametersByPath`` + ``kms:Decrypt``; this module fetches the SecureString
parameters under that prefix and maps each into the process env under the name the
Settings model expects. ``boto3`` is preinstalled in the Lambda runtime, so it is
imported lazily and never needed for local dev.

Mapping: ``/spending-tracker/supabase-db-url`` → ``SUPABASE_DB_URL`` (last path
segment, dashes → underscores, uppercased).
"""

from __future__ import annotations

import os


def hydrate_env_from_ssm() -> None:
    prefix = os.environ.get("SSM_PARAM_PREFIX")
    if not prefix:
        return  # local dev / not configured — settings come from .env or env vars

    import boto3  # lazy: only present/needed in Lambda

    ssm = boto3.client("ssm")
    paginator = ssm.get_paginator("get_parameters_by_path")
    for page in paginator.paginate(Path=prefix, Recursive=True, WithDecryption=True):
        for param in page["Parameters"]:
            key = param["Name"].rsplit("/", 1)[-1].replace("-", "_").upper()
            # Don't clobber an explicitly-set env var (useful for overrides/tests).
            os.environ.setdefault(key, param["Value"])
