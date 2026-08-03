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
// Injected by each app at startup rather than read from import.meta.env: Metro (React
// Native) has no import.meta, so the base URL must come in from the platform. Web passes
// import.meta.env.VITE_API_BASE_URL; Expo passes its own env value.
let API_BASE = "";

/** Set the backend origin. Call once at app init, before any request. */
export function configureApi(options: { baseUrl: string }) {
  API_BASE = options.baseUrl;
}

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

/**
 * A file to upload, in whichever form the current platform produces.
 *
 * The web gives us a `File` (a Blob) from an <input type="file">. React Native has no File or
 * Blob for on-device media — its FormData accepts a `{ uri, name, type }` descriptor instead and
 * streams the file from disk. Both are valid multipart parts; only the runtime differs.
 */
export type UploadFilePart = Blob | { uri: string; name: string; type: string };

/**
 * Append a file part to a FormData in a way that works on both platforms.
 *
 * The cast is unavoidable: TypeScript's DOM lib types `FormData.append` as accepting only
 * `Blob | string`, but React Native's implementation specifically requires the URI descriptor.
 * Confining the cast here keeps it out of every call site.
 */
export function appendUploadFile(form: FormData, field: string, file: UploadFilePart): void {
  form.append(field, file as Blob);
}

/** Upload multipart form data (e.g. a receipt photo). Lets the platform set the
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
