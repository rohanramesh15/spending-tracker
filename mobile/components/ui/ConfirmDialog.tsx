import { AlertDialog, Separator, XStack, YStack } from "tamagui";

import { Button } from "./Button";

/**
 * Destructive-action confirmation — the native equivalent of the web ConfirmDeleteDialog.
 *
 * Deliberately an AlertDialog rather than a bottom sheet: this is a decision the user must
 * answer, not a menu they can swipe away, and it must not be dismissible by an accidental drag.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          key="overlay"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <AlertDialog.Content
          key="content"
          bordered
          elevate
          enterStyle={{ opacity: 0, scale: 0.95 }}
          exitStyle={{ opacity: 0, scale: 0.95 }}
          gap="$3"
          maxWidth={360}
          width="90%"
        >
          <AlertDialog.Title>{title}</AlertDialog.Title>
          {/* Same rule as the sheets' title: every pop-up separates its heading from its body. */}
          <Separator testID="dialog-title-separator" />
          {description ? (
            <AlertDialog.Description>{description}</AlertDialog.Description>
          ) : null}

          <XStack gap="$3" justifyContent="flex-end" paddingTop="$2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={destructive ? "destructive" : "primary"}
                onPress={onConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </XStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}
