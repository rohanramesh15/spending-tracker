/**
 * Tiny handoff for the receipt photo captured by the Scan FAB. The FAB opens the
 * camera directly (preserving the user gesture), stashes the File here, and navigates
 * to /scan, which picks it up and starts extraction. Cleared on read (one-shot).
 */
let pending: File | null = null;

export function setPendingReceipt(file: File): void {
  pending = file;
}

export function takePendingReceipt(): File | null {
  const f = pending;
  pending = null;
  return f;
}
