export type WaitlistResult =
  | { ok: true; alreadyJoined: boolean }
  | { ok: false; error: string };

/**
 * Posts to the Cloudflare Pages Function at /api/waitlist, which owns the
 * Supabase credentials. Nothing secret reaches the browser.
 *
 * `company` is the honeypot value — always empty for a real person.
 *
 * A duplicate email is a success, not an error — re-submitting the same address
 * should feel identical to the first time.
 */
export async function joinWaitlist(email: string, company = ""): Promise<WaitlistResult> {
  try {
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, company }),
    });

    if (response.status === 409) {
      return { ok: true, alreadyJoined: true };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        error: body?.error ?? "Something went wrong. Try again in a moment.",
      };
    }

    return { ok: true, alreadyJoined: false };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }
}
