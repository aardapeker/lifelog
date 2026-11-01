import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDate, type Note } from '../lib/notes';
import { colors, fonts, radius } from '../lib/theme';
import { IconButton } from './ui';

/** Shared layout for goal and person pages: round back button, serif headline on a sheet, entry list. */
export function DetailScreen(props: {
  barTitle: string;
  title: string;
  right?: ReactNode;
  children?: ReactNode;
  notes: Note[];
  emptyText: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>{props.barTitle}</Text>
        {props.right ?? <View style={{ width: 44 }} />}
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>
        <Text style={styles.title}>{props.title}</Text>
        {props.children}
        <Text style={styles.section}>Entries</Text>
        {props.notes.length === 0 && <Text style={styles.empty}>{props.emptyText}</Text>}
        {props.notes.map((n) => (
          <Pressable key={n.id} style={styles.card} onPress={() => router.push(`/note/${n.id}`)}>
            <Text style={styles.cardDate}>{formatDate(n.created_at)}</Text>
            <Text style={styles.cardBody} numberOfLines={4}>
              {n.body}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export const detailStyles = StyleSheet.create({
  fact: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 24, color: colors.text, marginBottom: 8 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 22 },
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40, color: colors.text, marginBottom: 16 },
  section: { fontFamily: fonts.serif, fontSize: 20, color: colors.text, marginTop: 22, marginBottom: 10 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted },
  card: { backgroundColor: colors.raised, borderRadius: radius.sm, padding: 16, marginBottom: 10 },
  cardDate: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginBottom: 6 },
  cardBody: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.text },
});
