import { useEffect, useState } from "react";

// Status copy that cycles while the vision model reads the receipt — mirrors the real
// steps (read → items → prices → tax/tip → categorize) so the wait feels like progress.
const PHRASES = [
  "Reading the receipt…",
  "Finding the line items…",
  "Making out the prices…",
  "Adding up tax and tip…",
  "Sorting items into categories…",
  "Tidying up the details…",
  "Almost there…",
];

// Faux receipt lines (varied widths) behind the scanning beam.
const LINES = ["82%", "64%", "90%", "48%", "72%", "58%", "86%", "40%"];

/** A calm, on-brand wait state for receipt extraction: a scanning beam sweeps a stylized
 *  receipt while status phrases fade through the actual steps. */
export function ScanLoader() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 1900);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="flex flex-col items-center gap-6 py-10"
      role="status"
      aria-live="polite"
    >
      <div className="relative h-44 w-36 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2.5 p-4">
          {LINES.map((w, idx) => (
            <div
              key={idx}
              className="h-2 rounded-full bg-muted"
              style={{ width: w }}
            />
          ))}
        </div>
        <div className="scan-beam" aria-hidden="true" />
      </div>

      {/* key={i} remounts the node so the fade-up replays on each phrase */}
      <p key={i} className="scan-phrase text-sm font-medium text-foreground">
        {PHRASES[i]}
      </p>
      <span className="sr-only">Reading your receipt</span>
    </div>
  );
}
