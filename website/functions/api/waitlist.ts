/**
 * POST /api/waitlist — Cloudflare Pages Function.
 *
 * Runs on the Pages free tier (100k requests/day) and holds the only copy of the
 * Supabase credentials, so the browser never sees a key. Writes to `waitlist_signups`
 * in the existing Supabase project via PostgREST — no new service, no new bill.
 *
 * Required Pages environment variables (set as encrypted, Production + Preview):
 *   SUPABASE_URL              e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY the service-role key
 *
 * Note this is the one place a service-role connection is used, and it touches a
 * marketing table only — never user data (CLAUDE.md §3).
 */

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type PagesContext = {
  request: Request;
  env: Env;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("waitlist: Supabase env vars are not configured");
    return json({ error: "The waitlist isn't available right now." }, 503);
  }

  let payload: { email?: unknown; company?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  // Honeypot: a field hidden from humans. Bots fill it; we accept and drop.
  if (typeof payload.company === "string" && payload.company.length > 0) {
    return json({ ok: true }, 201);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/waitlist_signups`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email,
      referrer: request.headers.get("referer")?.slice(0, 500) ?? null,
      country: request.headers.get("cf-ipcountry") ?? null,
    }),
  });

  // 23505 = unique_violation. Re-signing up is a success, not a failure.
  if (response.status === 409) {
    return json({ ok: true, alreadyJoined: true }, 409);
  }

  if (!response.ok) {
    console.error("waitlist: supabase insert failed", response.status, await response.text());
    return json({ error: "Couldn't save that. Try again in a moment." }, 502);
  }

  return json({ ok: true }, 201);
};

/** Anything other than POST gets a clean 405 rather than the SPA's index.html. */
export const onRequest = async (context: PagesContext): Promise<Response> => {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
};
