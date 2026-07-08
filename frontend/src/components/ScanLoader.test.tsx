import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScanLoader } from "./ScanLoader";

describe("ScanLoader", () => {
  it("renders a polite status region with the first status phrase", () => {
    render(<ScanLoader />);
    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Reading the receipt…")).toBeInTheDocument();
  });
});
