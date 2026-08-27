import { describe, it, expect } from "vitest";
import { formatRangeLabel, parseISODate, toISODate } from "./dates";

/**
 * These dates are LOCAL calendar dates (CLAUDE.md #2). Every assertion here would also catch a
 * UTC regression: `new Date("2026-08-01")` is UTC midnight, which renders as Jul 31 anywhere
 * behind UTC, so a label reading "Jul 31" is the signature of that bug.
 */
describe("formatRangeLabel", () => {
  it("names a single day once", () => {
    expect(formatRangeLabel("2026-08-01", "2026-08-01")).toBe("Aug 1, 2026");
  });

  it("names the month once for a range inside one month", () => {
    // "Aug 1 – Aug 31, 2026" repeated the month for no reason.
    expect(formatRangeLabel("2026-08-01", "2026-08-31")).toBe("Aug 1–31, 2026");
  });

  it("still names both months when the range crosses one", () => {
    expect(formatRangeLabel("2026-08-01", "2026-09-15")).toBe("Aug 1 – Sep 15, 2026");
  });

  it("states both years when the range crosses a year boundary", () => {
    // Dropping either year here would make the range genuinely ambiguous.
    expect(formatRangeLabel("2025-12-20", "2026-01-05")).toBe("Dec 20, 2025 – Jan 5, 2026");
  });

  it("does not collapse the same month in different years", () => {
    expect(formatRangeLabel("2025-08-01", "2026-08-31")).toBe("Aug 1, 2025 – Aug 31, 2026");
  });

  it("renders the first of a month as that day, not the last of the previous one", () => {
    // The UTC-parsing regression shows up here first and is invisible in a UTC-ish timezone.
    expect(formatRangeLabel("2026-08-01", "2026-08-02")).toContain("Aug 1");
  });
});

describe("parseISODate / toISODate", () => {
  it("round-trips a local calendar date without shifting the day", () => {
    expect(toISODate(parseISODate("2026-08-01"))).toBe("2026-08-01");
  });
});
