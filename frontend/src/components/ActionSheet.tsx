import type { ReactNode } from "react";
import { Sheet, SheetRow } from "@/components/ui/sheet";

export type ActionSheetItem = {
  label: string;
  onSelect: () => void;
  /** Destructive styling (e.g. Delete). */
  destructive?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
};

/**
 * Bottom action menu — a short list of actions for one object. Just a `Sheet` with
 * `SheetRow`s, so it shares the picker's surface, rows and motion.
 */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actions: ActionSheetItem[];
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      align="start"
    >
      <ul>
        {actions.map((action) => (
          <li key={action.label}>
            <SheetRow
              disabled={action.disabled}
              destructive={action.destructive}
              onClick={() => {
                // Close first so the next dialog (edit/delete) stacks cleanly.
                onOpenChange(false);
                // Defer the action until after the close animation starts — avoids
                // focus fighting between two modals opening on the same tick.
                Promise.resolve().then(action.onSelect);
              }}
            >
              {action.icon}
              {action.label}
            </SheetRow>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
