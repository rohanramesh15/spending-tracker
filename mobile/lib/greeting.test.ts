import { GREETINGS, greetingFor, timeSlot } from "@/lib/greeting";

/** Local time, deliberately — the greeting follows the device's wall clock. */
function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 4, hour, minute);
}

describe("timeSlot", () => {
  it.each([
    [5, "earlyMorning"],
    [7, "earlyMorning"],
    [8, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [20, "evening"],
    [21, "night"],
    [23, "night"],
    [0, "night"],
    [4, "night"],
  ] as const)("puts %i:00 in %s", (hour, slot) => {
    expect(timeSlot(at(hour))).toBe(slot);
  });

  it("treats a boundary hour as the start of the new slot, not the end of the old", () => {
    // 12:00 is the first minute of the afternoon.
    expect(timeSlot(at(11, 59))).toBe("morning");
    expect(timeSlot(at(12, 0))).toBe("afternoon");
  });

  it("covers the whole night, which wraps past midnight", () => {
    // `hour >= 21 && hour < 5` can never be true; a range check here silently leaves the small
    // hours ungreeted.
    for (const hour of [21, 22, 23, 0, 1, 2, 3, 4]) {
      expect(timeSlot(at(hour))).toBe("night");
    }
  });

  it("assigns every hour of the day to a slot that has a greeting", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(GREETINGS[timeSlot(at(hour))]).toBeTruthy();
    }
  });
});

describe("greetingFor", () => {
  it.each([
    [6, "Up early"],
    [9, "Good morning"],
    [14, "Good afternoon"],
    [19, "Good evening"],
    [23, "Still up?"],
    [2, "Still up?"],
  ] as const)("greets %i:00 with %s", (hour, expected) => {
    expect(greetingFor(at(hour))).toBe(expected);
  });

  it("is deterministic, so it can be computed during render without flickering", () => {
    expect(greetingFor(at(9))).toBe(greetingFor(at(9)));
  });

  it("never returns an empty string, at any hour", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(greetingFor(at(hour)).length).toBeGreaterThan(0);
    }
  });
});

describe("naming the person", () => {
  it("appends the name", () => {
    expect(greetingFor(at(9), "Rohan")).toBe("Good morning, Rohan");
  });

  it("puts the question mark after the name, not in the middle of the sentence", () => {
    expect(greetingFor(at(23), "Rohan")).toBe("Still up, Rohan?");
  });

  it("still asks the question when there is no name", () => {
    expect(greetingFor(at(23))).toBe("Still up?");
  });

  it("omits the comma entirely when there is no name", () => {
    // Signed out, or a Google account with no name — a trailing comma would be the giveaway.
    expect(greetingFor(at(9))).toBe("Good morning");
    expect(greetingFor(at(9), undefined)).toBe("Good morning");
  });
});
