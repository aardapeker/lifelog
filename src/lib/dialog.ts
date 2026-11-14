import { useEffect, useState } from 'react';

/*
 * Lifelog's own popup, used instead of React Native's Alert.alert everywhere. Same call shape
 * (title, message, buttons), drawn by <DialogHost /> in Lifelog's style. Android's alert shows at
 * most 3 buttons (a 4th, often Cancel, silently disappears) and can't always be dismissed; this one
 * takes any number of buttons and always closes (tap outside or back = Cancel).
 */

export type DialogButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type Dialog = { id: number; title: string; message?: string; buttons: DialogButton[] };

let queue: Dialog[] = [];
let nextId = 1;
const listeners = new Set<(d: Dialog | null) => void>();
const emit = () => listeners.forEach((l) => l(queue[0] ?? null));

/** Shows a popup (queued if one is already open). Without buttons, there's an OK. */
export function showAlert(title: string, message?: string, buttons?: DialogButton[]): void {
  queue = [...queue, { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] }];
  emit();
}

/** Closes the open popup, running the pressed button (or Cancel, when it was dismissed). */
export function close(d: Dialog, pressed?: DialogButton): void {
  queue = queue.filter((x) => x.id !== d.id);
  emit();
  const b = pressed ?? d.buttons.find((x) => x.style === 'cancel');
  // after the popup is gone, so a button that opens another popup or a screen works
  if (b?.onPress) setTimeout(b.onPress, 0);
}

export function useDialog(): Dialog | null {
  const [d, setD] = useState<Dialog | null>(queue[0] ?? null);
  useEffect(() => {
    listeners.add(setD);
    return () => {
      listeners.delete(setD);
    };
  }, []);
  return d;
}
