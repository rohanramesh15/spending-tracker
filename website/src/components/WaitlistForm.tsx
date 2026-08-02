import { useId, useState } from "react";

import { joinWaitlist } from "../lib/waitlist";

type Status = "idle" | "submitting" | "joined" | "error";

/**
 * The one interactive thing on the page. Validation is deliberately loose — a
 * shape check, not an RFC 5322 parser — because the only cost of a bad address
 * is one dead row, and a false rejection costs a signup.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function WaitlistForm() {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — see the hidden field below
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_SHAPE.test(trimmed)) {
      setStatus("error");
      setMessage("That doesn't look like an email address.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    const result = await joinWaitlist(trimmed, company);
    if (result.ok) {
      setStatus("joined");
      setMessage(result.alreadyJoined ? "You're already on the list." : "");
    } else {
      setStatus("error");
      setMessage(result.error);
    }
  }

  if (status === "joined") {
    return (
      <div
        role="status"
        className="animate-rise-in flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-4"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] text-surface"
        >
          ✓
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">You're on the list.</p>
          <p className="text-sm text-ink-2">
            {message || "We'll email you when TrackIt opens up. No other mail, ever."}
          </p>
        </div>
      </div>
    );
  }

  const invalid = status === "error";

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>

      {/* Honeypot. Off-screen and untabbable, so only a bot fills it in; the
          Pages Function accepts and silently drops anything that does. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>

      <div
        className={`flex flex-col gap-2 rounded-xl border bg-surface p-1.5 sm:flex-row sm:items-center ${
          invalid ? "border-[#e34948]" : "border-line"
        }`}
      >
        <input
          id={inputId}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          aria-invalid={invalid}
          aria-describedby={message ? `${inputId}-msg` : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status === "error") {
              setStatus("idle");
              setMessage("");
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="shrink-0 rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-surface transition-colors hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>

      <p
        id={`${inputId}-msg`}
        role={invalid ? "alert" : undefined}
        className={`mt-2 px-1 text-[13px] ${invalid ? "text-[#c0392b]" : "text-ink-3"}`}
      >
        {message || "Free at launch. One email when it's ready — nothing else."}
      </p>
    </form>
  );
}
