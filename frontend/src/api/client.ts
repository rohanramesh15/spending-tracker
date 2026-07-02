/**
 * Thin fetch wrapper for the FastAPI backend.
 *
 * In local dev, Vite proxies `/api/*` to the uvicorn server (see vite.config.ts).
 * In production the SPA and the Lambda Function URL are different origins, so
 * VITE_API_BASE_URL points at the Function URL and CORS is configured server-side.
 *
 * Auth: the Supabase access token (JWT) is attached as a Bearer header; the backend
 * verifies it and sets its claims on the DB session so RLS applies (see backend db.py).
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let getAccessToken: () => string | null = () => null;

/** Wire up how the client retrieves the current Supabase JWT (set once at app init). */
export function configureAuth(getter: () => string | null) {
  getAccessToken = getter;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Upload multipart form data (e.g. a receipt photo). Lets the browser set the
 * multipart Content-Type/boundary — never set it manually. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  return (await res.json()) as T;
}
