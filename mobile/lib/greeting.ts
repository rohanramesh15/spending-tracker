/**
 * Time-of-day greetings for the Home screen.
 *
 * Pure and separately testable, because the interesting parts are boundaries (is 12:00 midday or
 * still morning?) and the night bucket, which wraps past midnight and is the one an `hour >= 21
 * && hour < 5` style check silently gets wrong — that condition can never be true.
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
 * A few per slot so the app doesn't say the identical thing every morning. Kept short: this sits
 * directly above a large currency total and shouldn't compete with it.
 */
export const GREETINGS: Record<TimeSlot, readonly string[]> = {
  earlyMorning: ["Up early", "Morning, early bird", "Beat the sunrise"],
  morning: ["Good morning", "Morning", "Rise and shine"],
  afternoon: ["Good afternoon", "Afternoon", "Hope it's going well"],
  evening: ["Good evening", "Evening", "Winding down"],
  night: ["Still up?", "Late one", "Burning the midnight oil"],
};

/**
 * One greeting for the given moment.
 *
 * `random` is injected so tests can pin the choice — asserting on a value chosen by Math.random
 * either flakes or forces the test to accept anything, and "anything" would pass a greeting
 * picked from the wrong slot.
 *
 * Callers should choose ONCE per screen mount (see app/(tabs)/index.tsx). Calling this during
 * render would re-roll on every state change and make the greeting flicker as the user taps.
 */
export function greetingFor(date: Date = new Date(), random: () => number = Math.random): string {
  const options = GREETINGS[timeSlot(date)];
  const index = Math.min(options.length - 1, Math.max(0, Math.floor(random() * options.length)));
  return options[index];
}
