import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRadioDock } from '../lib/radioEngine';
import { colors } from '../lib/theme';
import { MiniPlayer, MINI_HEIGHT } from './MiniPlayer';
import { ShowWash } from './radioParts';

/*
 * A full page outside the tabs (Radar, …) that still feels like Lifelog: the same background as the
 * tabs behind it (your chosen colour, or the song's while a show plays) and the radio's mini player
 * docked at the bottom while a show is on air. Lists inside add usePageBottom() as bottom padding.
 */
export function Page({ children, player = true }: { children: ReactNode; player?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ShowWash />
      {children}
      {player && (
        <View pointerEvents="box-none" style={[styles.dock, { bottom: insets.bottom + 6 }]}>
          <MiniPlayer />
        </View>
      )}
    </View>
  );
}

/** Room at the bottom of a Page's list for the docked mini player (when it's showing). */
export function usePageBottom(): number {
  const { phase, miniCollapsed } = useRadioDock();
  return phase === 'onair' ? (miniCollapsed ? 64 : MINI_HEIGHT + 10) : 0;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  dock: { position: 'absolute', left: 16, right: 16 },
});
