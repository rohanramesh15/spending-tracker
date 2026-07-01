import { describe, it, expect } from "vitest";
import { formatCents } from "./utils";

describe("formatCents", () => {
  it("renders integer cents as USD, dividing only at the edge", () => {
    expect(formatCents(5412)).toBe("$54.12");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(99)).toBe("$0.99");
  });
});
