"""FastAPI application entrypoint.

Runs as plain ASGI under uvicorn locally; wrapped by Mangum only when executing in
Lambda behind the Function URL (plan §4). CORS is locked to the configured frontend
origin(s). The auto-generated OpenAPI schema drives the frontend's typed client.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.api import (
    categories,
    health,
    imports,
    ingest,
    insights,
    notifications,
    plaid,
    receipts,
    reviews,
    subscriptions,
    transactions,
)
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Spending Tracker API",
    version="0.1.0",
    summary="Source-agnostic ingest, charts, and reconciliation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(insights.router)
app.include_router(receipts.router)
app.include_router(reviews.router)
app.include_router(plaid.router)
app.include_router(imports.router)
app.include_router(subscriptions.router)
app.include_router(notifications.router)

# Lambda handler (imported by the SAM template's ApiFunction). No-op locally.
handler = Mangum(app)
