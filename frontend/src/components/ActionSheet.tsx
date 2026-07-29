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
 * Rocket Money–style bottom action menu: dimmed backdrop, sheet slides up from the
 * bottom with a short list of actions + Cancel. Built on Radix Dialog (focus trap,
 * escape-to-close, aria) with positioning overridden to the bottom edge.
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
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "duration-200",
          )}
          // Don't auto-focus the first action — feels less jumpy on mobile.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <div className="overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg">
              {(title || description) && (
                <div className="border-b px-4 py-3 text-center">
                  {title && (
                    <DialogPrimitive.Title className="truncate text-sm font-semibold">
                      {title}
                    </DialogPrimitive.Title>
                  )}
                  {description && (
                    <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                      {description}
                    </DialogPrimitive.Description>
                  )}
                  {!description && (
                    // Radix requires a description for a11y when title is set; hide a blank one.
                    <DialogPrimitive.Description className="sr-only">
                      Choose an action
                    </DialogPrimitive.Description>
                  )}
                </div>
              )}
              <ul className="divide-y">
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
                        "flex w-full items-center justify-center gap-2 px-4 py-3.5 text-base font-medium transition-colors",
                        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                        "disabled:pointer-events-none disabled:opacity-50",
                        action.destructive
                          ? "text-destructive"
                          : "text-foreground",
                      )}
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "mt-2 w-full rounded-2xl bg-popover px-4 py-3.5 text-base font-semibold text-foreground shadow-lg",
                "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
              )}
            >
              Cancel
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
