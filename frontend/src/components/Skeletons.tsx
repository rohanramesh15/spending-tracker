import { cn } from "@/lib/utils";

/** Base shimmer block. Compose these to mirror a page's real layout while it loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Placeholder for the total + caption line (e.g. Home's "$123.45 / spent · …"). */
export function TotalSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

/** Donut-chart placeholder matching SpendingPie's footprint (ring + legend chips). */
export function ChartSkeleton() {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-5">
      <div className="h-44 w-44 animate-pulse rounded-full border-[22px] border-muted" />
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
    </div>
  );
}

/** Transaction-detail placeholder: header (vendor + date), item list, totals line. */
export function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <ListSkeleton rows={4} />
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

/** Bordered list of placeholder rows: two stacked text lines + a trailing value. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y rounded-xl border">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between px-4 py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-14" />
        </li>
      ))}
    </ul>
  );
}
