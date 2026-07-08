import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";

/**
 * Login (user-flow §1): Google OAuth via Supabase Auth (`signInWithOAuth`). The browser
 * bounces to Google and back; the session is picked up by detectSessionInUrl (see
 * lib/supabase.ts). The result is a Supabase JWT, so the backend's JWT verification + RLS
 * are unchanged.
 */
export default function LoginPage() {
  const { session, loading } = useAuth();
  const [status, setStatus] = useState<"idle" | "google" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function signInWithGoogle() {
    setStatus("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // On success the browser redirects to Google, so this component unmounts. We only
    // reach here on an error (e.g. the Google provider isn't enabled in Supabase).
    if (error) {
      setError(error.message);
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Spending Tracker</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to continue.</p>

      <div className="mt-8 space-y-4">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={signInWithGoogle}
          disabled={status === "google"}
        >
          <GoogleIcon />
          {status === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

/** The Google "G" mark (inline — no external asset). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.19a5.29 5.29 0 0 1-2.3 3.47v2.88h3.72c2.18-2 3.45-4.96 3.45-8.36z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.12 0 5.74-1.03 7.66-2.79l-3.72-2.88c-1.03.69-2.35 1.1-3.94 1.1-3.03 0-5.6-2.05-6.51-4.8H1.64v2.97A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.49 14.63a7.2 7.2 0 0 1 0-4.6V7.06H1.64a12 12 0 0 0 0 10.54l3.85-2.97z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.7 0 3.23.59 4.43 1.74l3.3-3.3C17.73 1.2 15.11 0 12 0A12 12 0 0 0 1.64 7.06l3.85 2.97C6.4 6.8 8.97 4.75 12 4.75z"
      />
    </svg>
  );
}
