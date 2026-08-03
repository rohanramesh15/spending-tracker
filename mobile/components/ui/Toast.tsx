import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Paragraph, YStack } from "tamagui";

type ToastTone = "success" | "error";
interface ToastState {
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 2600;

/**
 * Minimal toast — the native stand-in for the web app's sonner Toaster.
 *
 * Deliberately hand-rolled rather than pulling in @tamagui/toast: the only requirement is a
 * transient confirmation ("Saved", "Deleted"), and the Tamagui toast needs the animation
 * config that currently doesn't typecheck (see AppSheet's note). This has no such dependency.
 *
 * Rendered above the tab bar rather than at the top, so a confirmation appears near the thumb
 * that triggered it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, tone: ToastTone) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => show(message, "success"),
      error: (message: string) => show(message, "error"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <YStack
          position="absolute"
          bottom={96}
          left="$4"
          right="$4"
          padding="$3"
          borderRadius="$4"
          backgroundColor={toast.tone === "error" ? "$red9" : "$green9"}
          alignItems="center"
          testID="toast"
          accessibilityLiveRegion="polite"
          pointerEvents="none"
        >
          <Paragraph color="#ffffff" fontWeight="600">
            {toast.message}
          </Paragraph>
        </YStack>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * Toasts are confirmations, never the only signal that something happened — they disappear and
 * are easy to miss. Anything that changes data must also be visible in the list or detail it
 * affected.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
