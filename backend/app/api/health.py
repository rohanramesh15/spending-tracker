"""Liveness and the RLS smoke check surface.

The real RLS smoke test lives in tests/ (CI must run it — plan §10): a query as user A
sees A's rows and zero of synthetic user B's. This endpoint is only a cheap liveness
probe for the Function URL / warm-ping.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
