/**
 * Hand-off between the share menu and the entry editor. The shared content is
 * held here for a moment instead of being squeezed into a URL.
 */
export type PendingShare = { text: string; imageUri: string | null };

/** A backup file shared into Lifelog (Drive → Send a copy), waiting for its passphrase. */
let pendingBackup: { uri: string; name: string } | null = null;
export const setPendingBackup = (b: { uri: string; name: string }) => {
  pendingBackup = b;
};
export const peekPendingBackup = () => pendingBackup;
export const clearPendingBackup = () => {
  pendingBackup = null;
};

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
