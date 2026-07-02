/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_AUTH_DEV_BYPASS?: string; // local dev only — skip AuthGate
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
