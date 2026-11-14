import { Inter_800ExtraBold_Italic, Inter_900Black, Inter_900Black_Italic } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { LibreCaslonText_400Regular_Italic } from '@expo-google-fonts/libre-caslon-text';
import * as Font from 'expo-font';
import { useSyncExternalStore } from 'react';

/*
 * Fonts only a few screens use (the radio stations' logos, code in Bug Arena), loaded a moment after
 * the first screen instead of before it: the app's own Inter is all the start needs. Screens that use
 * them call useLateFonts(), so they redraw with the right letters once these are in.
 */

let ready = false;
let started = false;
const listeners = new Set<() => void>();

export function loadLateFonts(): void {
  if (started) return;
  started = true;
  Font.loadAsync({
    Inter_800ExtraBold_Italic,
    Inter_900Black,
    Inter_900Black_Italic,
    LibreCaslonText_400Regular_Italic,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  })
    .catch(() => {}) // the system font stands in
    .finally(() => {
      ready = true;
      listeners.forEach((l) => l());
    });
}

/** true once the late fonts are in (and it starts loading them, in case it hasn't yet). */
export function useLateFonts(): boolean {
  return useSyncExternalStore(
    (l) => {
      loadLateFonts();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ready,
  );
}
