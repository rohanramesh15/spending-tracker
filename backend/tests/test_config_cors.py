"""CORS origin parsing.

Regression guard for the deploy outage where SAM's shlex-parsed parameter_overrides
stripped a JSON array's quotes, leaving the Lambda with CORS_ALLOW_ORIGINS="[" — which
pydantic-settings then failed to JSON-decode, 502ing every request at app init. The app
must accept a plain comma/space list (what SAM can pass safely) and still accept a JSON
array (local .env back-compat).
"""

import pytest

from app.core.config import Settings, _parse_origins


@pytest.mark.parametrize(
    "raw,expected",
    [
        # plain comma-separated — the format SAM now passes (no quotes to be eaten)
        (
            "https://spending-tracker-1o6.pages.dev,http://localhost:5173,http://localhost:5174",
            [
                "https://spending-tracker-1o6.pages.dev",
                "http://localhost:5173",
                "http://localhost:5174",
            ],
        ),
        ("http://localhost:5173", ["http://localhost:5173"]),
        # whitespace / mixed separators are tolerated
        ("https://a  http://b", ["https://a", "http://b"]),
        ("https://a, http://b ,http://c", ["https://a", "http://b", "http://c"]),
        # JSON array — local .env back-compat
        ('["http://localhost:5173"]', ["http://localhost:5173"]),
        ('["https://a","http://b"]', ["https://a", "http://b"]),
        # empty → no origins (never a crash)
        ("", []),
        ("   ", []),
        # the exact mangled value that caused the outage — must NOT raise
        ("[", ["["]),
    ],
)
def test_parse_origins(raw, expected):
    assert _parse_origins(raw) == expected


def test_settings_reads_cors_env_var(monkeypatch):
    """The CORS_ALLOW_ORIGINS env var populates the parsed list via the alias."""
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "https://spending-tracker-1o6.pages.dev,http://localhost:5173",
    )
    s = Settings(_env_file=None)
    assert s.cors_allow_origins == [
        "https://spending-tracker-1o6.pages.dev",
        "http://localhost:5173",
    ]


def test_settings_default_cors():
    s = Settings(_env_file=None)
    assert s.cors_allow_origins == ["http://localhost:5173"]
