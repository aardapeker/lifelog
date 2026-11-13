import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getSetting } from '../lib/db';
import { chainOf, getList, tl } from '../lib/groceries';
import { colors, fonts, radius } from '../lib/theme';
import { PressScale } from './motion';
import { SectionTitle } from './ui';

/** Life tab: the grocery list, with how many things are left and where it was cheapest last time. */
export function GroceryCard() {
  const db = useSQLiteContext();
  const [left, setLeft] = useState(0);
  const [last, setLast] = useState<{ chain: string; total: number; split: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      getList(db).then((l) => setLeft(l.filter((i) => !i.done).length)).catch(() => {});
      getSetting(db, 'groceries.last', '')
        .then((v) => setLast(v ? JSON.parse(v) : null))
        .catch(() => {});
    }, [db]),
  );
  return (
    <View>
      <SectionTitle title="Groceries" />
      <Text style={styles.hint}>Your list, with the cheapest chain market near you. Free: no AI, just the prices.</Text>
      <PressScale scaleTo={0.97} onPress={() => router.push('/groceries')} style={styles.card} accessibilityLabel="Open the grocery list">
        <Text style={styles.emoji}>🛒</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{left ? `${left} thing${left === 1 ? '' : 's'} to buy` : 'Grocery list'}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {last ? `Last check: ${chainOf(last.chain).name} ${tl(last.total)} · split ${tl(last.split)}` : 'Write it down, find where it’s cheapest'}
          </Text>
        </View>
        <Text style={styles.go}>›</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.md, padding: 18, backgroundColor: colors.surface },
  emoji: { fontSize: 32 },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  go: { fontFamily: fonts.sans, fontSize: 26, color: colors.muted },
});
