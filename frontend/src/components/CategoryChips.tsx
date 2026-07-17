import { categoryColor } from "@/lib/categories";

/** Small colored pills for a transaction's line-item categories (row short-view). Colors
 *  match the spending pie. Caps the count and shows "+N" so long receipts stay tidy. */
export function CategoryChips({
  categories,
  max = 3,
}: {
  categories: string[];
  max?: number;
}) {
  if (!categories?.length) return null;
  const shown = categories.slice(0, max);
  const extra = categories.length - shown.length;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((c) => (
        <span
          key={c}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
          style={{ color: categoryColor(c), backgroundColor: categoryColor(c) + "1a" }}
        >
          {c}
        </span>
      ))}
      {extra > 0 && <span className="text-[10px] leading-none text-muted-foreground">+{extra}</span>}
    </div>
  );
}
