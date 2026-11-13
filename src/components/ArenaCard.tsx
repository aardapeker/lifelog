import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bossReady, getProgress, LANGS, rankOf, totalXp, type Progress } from '../lib/arena';
import { colors, fonts, radius } from '../lib/theme';
import { PressScale } from './motion';
import { SectionTitle } from './ui';

/** Life tab: the way into Bug Arena, with your rank and streak (and a warning when a boss is waiting). */
export function ArenaCard() {
  const db = useSQLiteContext();
  const [p, setP] = useState<Progress | null>(null);
  useFocusEffect(
    useCallback(() => {
      getProgress(db).then(setP).catch(() => {});
    }, [db]),
  );
  const xp = p ? totalXp(p) : 0;
  const rank = rankOf(xp);
  const boss = p ? LANGS.find((l) => l.ready && bossReady(p, l.key)) : undefined;
  const played = p ? Object.values(p.rounds).reduce((a, b) => a + (b ?? 0), 0) : 0;
  return (
    <View>
      <SectionTitle title="Bug Arena" />
      <Text style={styles.hint}>A coding game for your breaks: JavaScript, TypeScript and Java. C and Rust are coming.</Text>
      <PressScale scaleTo={0.97} onPress={() => router.push('/arena')} style={styles.card} accessibilityLabel="Open Bug Arena">
        <LinearGradient
          colors={['rgba(124,58,237,0.35)', 'rgba(34,211,238,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.code}>{'if (bored) {\n  fight(bugs);\n}'}</Text>
        <View style={styles.row}>
          <Text style={styles.emoji}>{played ? rank.emoji : '⚔️'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{played ? rank.name : 'Enter the Arena'}</Text>
            <Text style={styles.sub}>
              {played
                ? `${xp.toLocaleString()} XP · 🔥 ${p?.streak ?? 0} day${p?.streak === 1 ? '' : 's'}${boss ? ` · ${boss.boss.emoji} a boss is waiting` : ''}`
                : 'Three lives. Combos. Bosses. Go.'}
            </Text>
          </View>
          <Text style={styles.go}>›</Text>
        </View>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
  card: { borderRadius: radius.md, overflow: 'hidden', padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)' },
  code: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.35)', position: 'absolute', right: 16, top: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 34 },
  emoji: { fontSize: 34 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  go: { fontFamily: fonts.sans, fontSize: 26, color: colors.text },
});
