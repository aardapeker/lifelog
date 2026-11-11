import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACHIEVEMENTS, checkAchievements, progress, unlocked } from '../lib/achievements';
import { colors, fonts, radius } from '../lib/theme';
import { SectionTitle } from './ui';

/** The silly badges, in the Life tab: unlocked ones shine, the rest show how close you are. */
export function Achievements() {
  const db = useSQLiteContext();
  const [have, setHave] = useState<Record<string, number>>({});
  const [p, setP] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await checkAchievements(db).catch(() => []);
        setHave(await unlocked(db));
        setP(await progress(db));
      })().catch(() => {});
    }, [db]),
  );

  const got = ACHIEVEMENTS.filter((a) => have[a.id]).length;
  return (
    <View>
      <SectionTitle title="Achievements" right={<Text style={styles.count}>{got}/{ACHIEVEMENTS.length}</Text>} />
      <View style={styles.grid}>
        {ACHIEVEMENTS.map((a) => {
          const on = !!have[a.id];
          const now = Math.min(p[a.id] ?? 0, a.goal);
          const shown = open === a.id;
          return (
            <Pressable
              key={a.id}
              onPress={() => setOpen(shown ? null : a.id)}
              style={[styles.badge, on && styles.badgeOn, shown && styles.badgeOpen]}
              accessibilityLabel={`${a.name}: ${on ? 'unlocked' : `${now} of ${a.goal}`}`}
            >
              <Text style={[styles.emoji, !on && styles.locked]}>{a.emoji}</Text>
              <Text style={[styles.name, !on && { color: colors.muted }]} numberOfLines={2}>
                {a.name}
              </Text>
              {shown ? (
                <Text style={styles.how}>
                  {a.how}.{' '}
                  {on ? `Unlocked ${new Date(have[a.id]).toLocaleDateString()}.` : ''}
                </Text>
              ) : on ? null : (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(4, (now / a.goal) * 100)}%` }]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  count: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  badgeOn: { borderColor: 'rgba(255,255,255,0.25)', backgroundColor: '#2F2D2D' },
  badgeOpen: { width: '100%' },
  emoji: { fontSize: 28 },
  locked: { opacity: 0.25 },
  name: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 16, color: colors.text, textAlign: 'center' },
  how: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  track: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: colors.raised, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.muted },
});
