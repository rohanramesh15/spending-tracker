import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
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

export function SpendingPie({ slices }: { slices: SpendingSlice[] }) {
  const data = slices.map((s) => ({ name: s.category, value: s.cents }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={1}>
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
