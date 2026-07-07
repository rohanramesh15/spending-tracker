import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Sector } from "recharts";
import type { SpendingSlice } from "@/api/types";
import { formatCents } from "@/lib/utils";

// Categorical palette (brand-neutral). Tax/Tip/Uncategorized get fixed hues for recall.
const PALETTE = [
  "#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed",
  "#0891b2", "#dc2626", "#65a30d", "#c026d3", "#0d9488",
  "#ea580c", "#4f46e5", "#059669", "#e11d48", "#9333ea",
];
const FIXED: Record<string, string> = {
  Tax: "#94a3b8",
  Tip: "#cbd5e1",
  Uncategorized: "#e2e8f0",
};

function colorFor(category: string, i: number): string {
  return FIXED[category] ?? PALETTE[i % PALETTE.length];
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

// Percentage centered in each slice's ring. Thin slivers (<4%) are skipped so labels
// don't collide/overflow — their exact share still shows in the tooltip on hover.
function renderSlicePercent(props: unknown) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, index, payload } =
    props as SliceLabelProps;
  if (!percent || percent < 0.04) return <g />;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill={labelInkFor(colorFor(payload?.name ?? "", index))}
      fontSize={11}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

// Selected-slice highlight: trace the slice's own arc (a Sector, not a bounding box) with
// a stroke and a small radius bump — so clicking outlines the portion, never a square.
interface ActiveSliceProps {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
}
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
  const total = data.reduce((sum, d) => sum + d.value, 0);
  // -1 = nothing selected. Clicking a slice selects it; clicking it again clears.
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={1}
          labelLine={false}
          label={renderSlicePercent}
          activeIndex={activeIndex}
          activeShape={renderActiveSlice}
          onClick={(_, index) =>
            setActiveIndex((cur) => (cur === index ? -1 : index))
          }
          className="cursor-pointer focus:outline-none [&_*]:outline-none"
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={colorFor(entry.name, i)} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) =>
            total
              ? `${formatCents(value)} · ${((value / total) * 100).toFixed(1)}%`
              : formatCents(value)
          }
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
