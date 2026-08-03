import { Link } from "react-router-dom";
import { MoreVertical } from "lucide-react";
import { CategoryChips } from "@/components/CategoryChips";
import { cn } from "@/lib/utils";
import { formatCents } from "@shared/lib/money";
import type { TransactionListItem } from "@shared/api/types";

/**
 * One transaction in a ledger list: vendor, item count + state suffixes, category chips
 * and the amount, with an optional ⋯ button opening the row's action sheet. Tapping the
 * body navigates to the detail screen. Shared by every list that shows transactions so
 * they can't drift apart.
 */
export function TransactionRow({
  txn,
  onOpenMenu,
}: {
  txn: TransactionListItem;
  /** Omit to render the row without a ⋯ menu (e.g. read-only lists). */
  onOpenMenu?: (txn: TransactionListItem) => void;
}) {
  const subtitle = [
    txn.item_count > 0
      ? `${txn.item_count} item${txn.item_count === 1 ? "" : "s"}`
      : "Not itemized",
    txn.review_status === "needs_review" ? "needs review" : null,
    txn.pending ? "pending" : null,
    txn.hidden ? "hidden from spending" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-stretch">
      <Link
        to={`/transactions/${txn.id}`}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between py-3 pl-4 pr-1 hover:bg-muted/40",
          txn.hidden && "opacity-50",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{txn.vendor}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <CategoryChips categories={txn.categories} />
        </div>
        <span className="shrink-0 pl-3 font-medium">
          {formatCents(txn.total_cents, txn.currency)}
        </span>
      </Link>
      {onOpenMenu && (
        <button
          type="button"
          aria-label={`Actions for ${txn.vendor}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenMenu(txn);
          }}
          className="flex shrink-0 items-center pl-1 pr-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      )}
    </li>
  );
}
