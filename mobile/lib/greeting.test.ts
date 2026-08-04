import { GREETINGS, greetingFor, timeSlot, type TimeSlot } from "@/lib/greeting";

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

  it("assigns every hour of the day to some slot", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(GREETINGS[timeSlot(at(hour))].length).toBeGreaterThan(0);
    }
  });
});

describe("greetingFor", () => {
  it("returns a greeting from the slot the time falls in", () => {
    expect(GREETINGS.morning).toContain(greetingFor(at(9), () => 0));
    expect(GREETINGS.night).toContain(greetingFor(at(23), () => 0));
  });

  it("varies with the random source, so it isn't the same line every day", () => {
    const first = greetingFor(at(9), () => 0);
    const last = greetingFor(at(9), () => 0.99);
    expect(first).not.toBe(last);
  });

  it("stays in range at both ends of the random source", () => {
    // Math.random() can return 0, and floating point can push the index to the array length.
    for (const r of [0, 0.999999, 1]) {
      expect(GREETINGS.afternoon).toContain(greetingFor(at(14), () => r));
    }
  });

  it("never returns an empty string", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(greetingFor(at(hour), () => 0.5).length).toBeGreaterThan(0);
    }
  });

  it("offers more than one option in every slot, or the variety is a fiction", () => {
    const slots: TimeSlot[] = ["earlyMorning", "morning", "afternoon", "evening", "night"];
    for (const slot of slots) {
      expect(GREETINGS[slot].length).toBeGreaterThan(1);
    }
  });
});
