import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet — the app's one modal surface (date range, row action menus, …).
 *
 * Motion is deliberately symmetric: opening slides up from the bottom while fading in
 * from 50% opacity; closing runs the exact same distance, fade amount, duration and
 * easing in reverse. Both directions share SHEET_DURATION/SHEET_EASING so the sheet never
 * feels snappier one way than the other; both are theme tokens (tailwind.config.ts) rather
 * than arbitrary values, which Tailwind silently declines to generate for these utilities.
 */
const SHEET_DURATION = "duration-sheet";
/** Gentle decelerate — long tail, no bounce. Same curve both directions. */
const SHEET_EASING = "ease-sheet";

const sheetMotion = cn(
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  // Matching fade amounts: in from 50%, out to 50%.
  "data-[state=open]:fade-in-50 data-[state=closed]:fade-out-50",
  "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  SHEET_DURATION,
  SHEET_EASING,
);

const overlayMotion = cn(
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
  SHEET_DURATION,
  SHEET_EASING,
);

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  /** Renders a back chevron left of the title. */
  onBack,
  /** Left-align the header text (row menus) instead of centering it (pickers). */
  align = "center",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onBack?: () => void;
  align?: "center" | "start";
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn("fixed inset-0 z-50 bg-black/50", overlayMotion)}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col outline-none",
            // Never taller than the screen — the body scrolls instead.
            "max-h-[92svh]",
            "rounded-t-3xl bg-popover text-popover-foreground shadow-lg",
            sheetMotion,
          )}
          // Don't auto-focus the first control — feels less jumpy on mobile.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Grab handle — signals "dismissable sheet", not a desktop menu. */}
          <div className="flex shrink-0 justify-center pb-1 pt-2.5">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          <div
            className={cn(
              "relative flex shrink-0 items-center pb-3",
              align === "center" ? "justify-center px-4" : "px-6",
              // Leave room for the back chevron so a centered title stays centered.
              align === "center" && onBack && "px-12",
            )}
          >
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className={cn("min-w-0", align === "start" && "w-full")}>
              {title && (
                <DialogPrimitive.Title className="truncate text-base font-semibold">
                  {title}
                </DialogPrimitive.Title>
              )}
              <DialogPrimitive.Description
                className={cn(
                  "mt-0.5 text-sm text-muted-foreground",
                  // Radix wants a description for a11y even with nothing to say.
                  !description && "sr-only",
                )}
              >
                {description ?? "Choose an option"}
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * A tappable row inside a sheet — one thumb-sized target, used by both the date presets
 * and the row action menus so they stay visually identical.
 */
export function SheetRow({
  onClick,
  disabled,
  selected,
  destructive,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  destructive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl px-4 text-base",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        destructive ? "text-destructive" : "text-foreground",
        selected ? "font-semibold text-primary" : "font-medium",
        className,
      )}
    >
      {children}
    </button>
  );
}
