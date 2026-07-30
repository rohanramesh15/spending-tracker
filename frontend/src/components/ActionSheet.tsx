import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export type ActionSheetItem = {
  label: string;
  onSelect: () => void;
  /** Destructive styling (e.g. Delete). */
  destructive?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
};

/**
 * Bottom action menu, sharing one visual language with the DateRangePicker sheet:
 * dimmed backdrop, a panel attached to the bottom edge with a rounded top and a grab
 * handle, a centered title, then thumb-sized rows. Built on Radix Dialog (focus trap,
 * escape-to-close, aria); dismiss by tapping the backdrop.
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
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/50",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg outline-none",
            "rounded-t-3xl bg-popover text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "duration-200",
          )}
          // Don't auto-focus the first action — feels less jumpy on mobile.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Grab handle — signals "dismissable sheet", not a desktop menu. */}
          <div className="flex justify-center pb-1 pt-2.5">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="px-4 pb-3 text-center">
            {title && (
              <DialogPrimitive.Title className="truncate text-base font-semibold">
                {title}
              </DialogPrimitive.Title>
            )}
            <DialogPrimitive.Description
              className={cn(
                "mt-0.5 text-sm text-muted-foreground",
                // Radix wants a description for a11y even when there's nothing to say.
                !description && "sr-only",
              )}
            >
              {description ?? "Choose an action"}
            </DialogPrimitive.Description>
          </div>

          <ul className="px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {actions.map((action) => (
              <li key={action.label}>
                <button
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    // Close first so the next dialog (edit/delete) stacks cleanly.
                    onOpenChange(false);
                    // Defer the action until after close animation starts — avoids
                    // focus fighting between two modals opening on the same tick.
                    Promise.resolve().then(action.onSelect);
                  }}
                  className={cn(
                    "flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl px-4 text-base font-medium",
                    "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    "disabled:pointer-events-none disabled:opacity-50",
                    action.destructive ? "text-destructive" : "text-foreground",
                  )}
                >
                  {action.icon}
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
