/**
 * Hand-off between the share menu and the entry editor. The shared content is
 * held here for a moment instead of being squeezed into a URL.
 */
export type PendingShare = { text: string; imageUri: string | null };

let pending: PendingShare | null = null;

export function setPendingShare(share: PendingShare) {
  pending = share;
}

/** Returns the shared content once, then forgets it. */
export function takePendingShare(): PendingShare | null {
  const s = pending;
  pending = null;
  return s;
}
