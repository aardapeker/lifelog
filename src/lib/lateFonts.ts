import { Inter_800ExtraBold_Italic, Inter_900Black, Inter_900Black_Italic } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { BlackOpsOne_400Regular } from '@expo-google-fonts/black-ops-one/400Regular';
import { Cinzel_800ExtraBold } from '@expo-google-fonts/cinzel/800ExtraBold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces/800ExtraBold';
import { LibreCaslonText_400Regular_Italic } from '@expo-google-fonts/libre-caslon-text';
import { Monoton_400Regular } from '@expo-google-fonts/monoton/400Regular';
import * as Font from 'expo-font';
import { useSyncExternalStore } from 'react';

/*
 * Fonts only a few screens use (the radio stations' logos and player skins, code in Bug Arena), loaded a moment after
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
    // the stations' player skins (lib/skins): one weight each, imported by path so the others stay out of the app
    Cinzel_800ExtraBold,
    Monoton_400Regular,
    BlackOpsOne_400Regular,
    Fraunces_600SemiBold,
    Fraunces_800ExtraBold,
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
