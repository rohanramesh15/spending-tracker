// Fixed color per category — the single source of truth for the spending pie AND the
// category chips on transaction rows, so a category always reads the same everywhere.
export const CATEGORY_COLORS: Record<string, string> = {
  "Food and Drinks": "#ea580c", // orange
  Shopping: "#eab308", // yellow
  Entertainment: "#db2777", // pink
  "Travel/Transportation": "#16a34a", // green
  Health: "#dc2626", // red
  Services: "#9333ea", // purple
  Other: "#64748b", // neutral slate
  Tax: "#94a3b8",
  Tip: "#cbd5e1",
  Uncategorized: "#e2e8f0",
};

export function categoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? "#64748b";
}
