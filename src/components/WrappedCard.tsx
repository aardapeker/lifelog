import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../lib/theme';
import { listWrapped, monthKey, monthName } from '../lib/wrapped';
import { PressScale } from './motion';
import { SectionTitle } from './ui';

/** Life tab: this month's sneak peek, and every Wrapped so far. */
export function WrappedCard() {
  const db = useSQLiteContext();
  const [months, setMonths] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      listWrapped(db).then(setMonths).catch(() => {});
    }, [db]),
  );
  const now = monthKey(new Date());
  const all = [now, ...months.filter((m) => m !== now)];
  return (
    <View>
      <SectionTitle title="Wrapped" />
      <Text style={styles.hint}>Your month in numbers, fake awards and a roast. A new one arrives on the 1st.</Text>
      <View style={styles.row}>
        {all.map((m) => (
          <PressScale key={m} style={[styles.tape, m === now && styles.now]} onPress={() => router.push(`/wrapped/${m}`)} accessibilityLabel={`${monthName(m)} Wrapped`}>
            <Text style={styles.emoji}>📼</Text>
            <Text style={styles.name}>{monthName(m)}</Text>
            <Text style={styles.sub}>{m === now ? 'Sneak peek' : 'Wrapped'}</Text>
          </PressScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tape: { width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 4 },
  now: { borderWidth: 1, borderColor: 'rgba(232,130,90,0.5)' },
  emoji: { fontSize: 26 },
  name: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
});
