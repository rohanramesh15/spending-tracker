import { useEffect, useRef, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Sector,
} from "recharts";
import type { SpendingSlice } from "@shared/api/types";
import { formatCents } from "@shared/lib/money";
import { categoryColor, categoryLabel, HATCHED, isHatched } from "@shared/lib/categories";

// Color follows the category, never the slice's position — an unknown label falls back to
// Other's neutral rather than borrowing a category's hue.
function colorFor(category: string): string {
  return categoryColor(category);
}

// Hatched categories (Tip, Uncategorized) fill from an SVG pattern instead of a flat color,
// which is what separates Tip from the solid Tax slice sharing its hue.
function patternId(category: string): string {
  return `hatch-${category.replace(/[^a-zA-Z]/g, "")}`;
}

function fillFor(category: string): string {
  return isHatched(category) ? `url(#${patternId(category)})` : colorFor(category);
}

// The patterns live in their own zero-size <svg> rather than inside <PieChart>, because
// Recharts drops children it doesn't recognize — a <defs> passed to the chart never renders.
// Pattern ids resolve document-wide, so the slices can still reference them by url(#id).
function HatchDefs() {
  return (
    <svg width={0} height={0} aria-hidden="true" className="absolute">
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
            <rect width={6} height={6} fill={colorFor(category)} />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#ffffff" strokeWidth={2.5} />
          </pattern>
        ))}
      </defs>
    </svg>
  );
}

const RADIAN = Math.PI / 180;

// Readable ink for the on-slice percentage: dark slate on light slices, white on dark ones.
function labelInkFor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#334155" : "#ffffff";
}

interface SliceLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  index: number;
  payload: { name: string };
}

interface ActiveSliceProps {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
}

// Selected-slice highlight: trace the slice's own arc (a Sector, not a bounding box) with
// a stroke and a small radius bump — so clicking outlines the portion, never a square.
function renderActiveSlice(props: unknown) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
    props as ActiveSliceProps;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 4}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#0f172a"
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

export function SpendingPie({ slices }: { slices: SpendingSlice[] }) {
  const data = slices.map((s) => ({ name: s.category, value: s.cents }));
  // -1 = nothing selected. Clicking a slice selects it; clicking it again clears.
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the chart clears the selected slice (closes the popup).
  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  // The percentage shows ONLY on the slice the user has clicked — centered in its ring.
  const renderSelectedPercent = (props: unknown) => {
    const p = props as SliceLabelProps;
    if (p.index !== activeIndex || !p.percent) return <g />;
    const r = p.innerRadius + (p.outerRadius - p.innerRadius) * 0.5;
    const x = p.cx + r * Math.cos(-p.midAngle * RADIAN);
    const y = p.cy + r * Math.sin(-p.midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill={labelInkFor(colorFor(p.payload?.name ?? ""))}
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {`${Math.round(p.percent * 100)}%`}
      </text>
    );
  };

  return (
    <div ref={containerRef}>
      <HatchDefs />
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={95}
            paddingAngle={0}
            // A 2px surface-colored gap between adjacent fills — keeps neighboring slices
            // from bleeding together, and gives the hatched Tip slice a clean edge against
            // the solid Tax slice it shares a hue with.
            stroke="#ffffff"
            strokeWidth={2}
            labelLine={false}
            label={renderSelectedPercent}
            activeIndex={activeIndex}
            activeShape={renderActiveSlice}
            onClick={(_, index) => setActiveIndex((cur) => (cur === index ? -1 : index))}
            className="cursor-pointer focus:outline-none [&_*]:outline-none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={fillFor(entry.name)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCents(value)}
            labelFormatter={(label: string) => categoryLabel(label)}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value: string) => (
              <span className="text-xs text-foreground">{categoryLabel(value)}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
