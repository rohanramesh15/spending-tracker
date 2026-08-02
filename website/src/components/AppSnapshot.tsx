import { categoryColor, categoryLabel, HATCHED, isHatched } from "../lib/categories";

/**
 * The app's Home screen, reproduced: the same spending pie the app draws, with the
 * app's category palette, its 55/95 inner/outer radii, its 2px white slice gaps,
 * and its hatched Tip/Not-itemized fills.
 *
 * Hand-drawn SVG rather than Recharts — the site ships no chart library — but the
 * geometry is taken from `frontend/src/components/SpendingPie.tsx` so what a
 * visitor sees here is what they get.
 */

const SLICES = [
  { category: "Food and Drinks", cents: 41280 },
  { category: "Shopping", cents: 28640 },
  { category: "Travel/Transportation", cents: 19815 },
  { category: "Services", cents: 16400 },
  { category: "Uncategorized", cents: 10960 },
  { category: "Health", cents: 9650 },
  { category: "Entertainment", cents: 7825 },
  { category: "Tax", cents: 3890 },
];

const TOTAL = SLICES.reduce((sum, slice) => sum + slice.cents, 0);

const SIZE = 240;
const CENTER = SIZE / 2;
const INNER = 55;
const OUTER = 95;

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Angle 0 is 12 o'clock, sweeping clockwise. */
function polar(radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(radians), CENTER + radius * Math.sin(radians)];
}

function donutSegment(startAngle: number, endAngle: number): string {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const [ox1, oy1] = polar(OUTER, startAngle);
  const [ox2, oy2] = polar(OUTER, endAngle);
  const [ix2, iy2] = polar(INNER, endAngle);
  const [ix1, iy1] = polar(INNER, startAngle);

  return [
    `M ${ox1} ${oy1}`,
    `A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${INNER} ${INNER} 0 ${largeArc} 0 ${ix1} ${iy1}`,
    "Z",
  ].join(" ");
}

function patternId(category: string): string {
  return `snapshot-hatch-${category.replace(/[^a-zA-Z]/g, "")}`;
}

export function AppSnapshot() {
  let cursor = 0;
  const segments = SLICES.map((slice) => {
    const startAngle = cursor;
    const endAngle = cursor + (slice.cents / TOTAL) * 360;
    cursor = endAngle;
    return { ...slice, startAngle, endAngle };
  });

  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[26px] border border-line bg-surface p-5 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.4)] sm:p-6">
      {/* Home header — mirrors the app's own top bar and range picker. */}
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">Home</span>
        <span className="rounded-full border border-line px-3 py-1 text-[11px] text-ink-2">
          This month
        </span>
      </div>

      <div className="mt-4">
        <p className="font-mono text-[30px] font-medium leading-none tracking-tight text-ink">
          {formatCents(TOTAL)}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-3">spent · This month</p>
      </div>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto mt-4 h-[220px] w-[220px]"
        role="img"
        aria-label={`Spending pie: ${formatCents(TOTAL)} this month across ${SLICES.length} categories, the largest being Food and Drinks at ${formatCents(SLICES[0].cents)}.`}
      >
        <defs>
          {Object.entries(HATCHED).map(([category, angle]) => (
            <pattern
              key={category}
              id={patternId(category)}
              width={6}
              height={6}
              patternTransform={`rotate(${angle})`}
              patternUnits="userSpaceOnUse"
            >
              <rect width={6} height={6} fill={categoryColor(category)} />
              <line x1={0} y1={0} x2={0} y2={6} stroke="#ffffff" strokeWidth={2.5} />
            </pattern>
          ))}
        </defs>

        {segments.map((segment, i) => (
          <path
            key={segment.category}
            d={donutSegment(segment.startAngle, segment.endAngle)}
            fill={
              isHatched(segment.category)
                ? `url(#${patternId(segment.category)})`
                : categoryColor(segment.category)
            }
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinejoin="round"
            className="animate-fade-in"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </svg>

      <ul className="mt-3 flex flex-wrap justify-center gap-x-3.5 gap-y-1.5">
        {SLICES.map((slice) => (
          <li key={slice.category} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: categoryColor(slice.category) }}
            />
            <span className="text-[11px] text-ink-2">{categoryLabel(slice.category)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
