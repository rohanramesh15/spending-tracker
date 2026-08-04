/**
 * Time-of-day greetings for the Home screen.
 *
 * Pure and separately testable, because the interesting parts are boundaries (is 12:00 midday or
 * still morning?) and the night bucket, which wraps past midnight and is the one an `hour >= 21
 * && hour < 5` style check silently gets wrong — that condition can never be true.
 *
 * One line per slot, by request.
 *
 * Local hours throughout. `getHours()` is the device's wall clock, which is what "morning" means
 * to the person holding it; a UTC hour would greet a New Yorker with "Late one" over breakfast.
 */
export type TimeSlot = "earlyMorning" | "morning" | "afternoon" | "evening" | "night";

/**
 * Which slot a moment falls in. Boundaries are inclusive of the lower bound, so 12:00 is the
 * first minute of the afternoon rather than the last of the morning.
 */
export function timeSlot(date: Date = new Date()): TimeSlot {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return "earlyMorning";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  // Everything else — 21:00 to 04:59 — wraps midnight, so it is the fallthrough rather than a
  // range check. `hour >= 21 && hour < 5` is never true, and is the bug this shape avoids.
  return "night";
}

/**
 * One greeting per slot. Kept short: this sits directly above a large currency total and
 * shouldn't compete with it.
 */
export const GREETINGS: Record<TimeSlot, string> = {
  earlyMorning: "Up early",
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Still up",
};

/**
 * Slots whose greeting is a question. Stored WITHOUT the "?" so the punctuation can follow the
 * name rather than sit in the middle of the sentence — "Still up, Rohan?", not "Still up?, Rohan".
 */
const QUESTIONS = new Set<TimeSlot>(["night"]);

/**
 * The greeting for a given moment, optionally naming the person.
 *
 * The name is optional rather than required because it is genuinely absent sometimes — signed
 * out, or a Google account with no name on it. Appending an empty one would leave a trailing
 * comma, so the unnamed form is a real case, not a fallback.
 *
 * Deterministic — the same hour always yields the same line, so it can safely be computed
 * during render.
 */
export function greetingFor(date: Date = new Date(), name?: string): string {
  const slot = timeSlot(date);
  const body = name ? `${GREETINGS[slot]}, ${name}` : GREETINGS[slot];
  return QUESTIONS.has(slot) ? `${body}?` : body;
}
