import type { Session } from "@supabase/supabase-js";

/**
 * The signed-in person's name, as Google reports it.
 *
 * Google populates `user_metadata` inconsistently — some accounts carry `full_name`, others only
 * `name` — so both are tried before falling back to the email's local part. Shared between the
 * Settings profile block and Home's greeting; deriving it twice is how two screens end up
 * calling the same person different things.
 */
export function displayNameFrom(session: Session | null): string | undefined {
  const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  // Blank strings are treated as absent, not as a name: a whitespace-only full_name would
  // otherwise win over a perfectly good email fallback and render as nothing at all.
  return (
    text(metadata.full_name) ?? text(metadata.name) ?? text(session?.user.email?.split("@")[0])
  );
}

/** A non-blank string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Just the first name, for greeting someone.
 *
 * "Good morning, Rohan Ramesh" reads like a form letter. Returns undefined rather than an empty
 * string when there is no name, so callers can greet without one instead of trailing a comma.
 */
export function firstNameFrom(session: Session | null): string | undefined {
  const first = displayNameFrom(session)?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : undefined;
}

/** Avatar URL from the Google identity, if it supplied one. */
export function avatarUrlFrom(session: Session | null): string | undefined {
  const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  if (typeof metadata.avatar_url === "string") return metadata.avatar_url;
  if (typeof metadata.picture === "string") return metadata.picture;
  return undefined;
}
