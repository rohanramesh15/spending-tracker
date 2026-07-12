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
        fill={labelInkFor(colorFor(p.payload?.name ?? "", p.index))}
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
          label={renderSelectedPercent}
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
        <Tooltip formatter={(value: number) => formatCents(value)} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
