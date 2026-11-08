import Ionicons from './Icon';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  approveMilestone,
  dismissMilestone,
  journalScanned,
  listMilestones,
  milestoneDate,
  scanJournal,
  type Milestone,
} from '../lib/milestones';
import { colors, fonts, radius } from '../lib/theme';
import { FadeIn, PressScale } from './motion';
import { PillButton, SectionTitle } from './ui';

/** "📌 A milestone?" — a suggestion with Save / Edit / No. */
function Suggestion({ m, onDone }: { m: Milestone; onDone: () => void }) {
  const db = useSQLiteContext();
  return (
    <View style={styles.suggestion}>
      <Text style={styles.kicker}>📌 A milestone?</Text>
      <Text style={styles.title}>
        {m.emoji ? `${m.emoji} ` : ''}
        {m.title}
      </Text>
      <Text style={styles.meta}>
        {milestoneDate(m)}
        {m.story ? ` · ${m.story}` : ''}
      </Text>
      <View style={styles.buttons}>
        <PillButton label="Save" onPress={() => approveMilestone(db, m.id).then(onDone)} />
        <PillButton label="Edit" ghost onPress={() => router.push(`/milestone/${m.id}`)} />
        <PillButton label="No" ghost onPress={() => dismissMilestone(db, m).then(onDone)} />
      </View>
    </View>
  );
}

/** On the Journal page: milestones the AI noticed in new entries, waiting for your OK (newest one). */
export function MilestoneSuggestions({ refresh }: { refresh: number }) {
  const db = useSQLiteContext();
  const [pending, setPending] = useState<Milestone[]>([]);
  const load = useCallback(() => {
    listMilestones(db, 'pending').then(setPending).catch(() => {});
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refresh]),
  );
  if (!pending.length) return null;
  return (
    <FadeIn>
      <Suggestion m={pending[0]} onDone={load} />
      {pending.length > 1 && (
        <Text style={[styles.meta, { marginTop: -8, marginBottom: 14 }]}>+{pending.length - 1} more in Insights → Life timeline</Text>
      )}
    </FadeIn>
  );
}

/** Insights: your life in milestones, by year. Add, edit, scan the journal for more, approve suggestions. */
export function LifeTimeline() {
  const db = useSQLiteContext();
  const [saved, setSaved] = useState<Milestone[]>([]);
  const [pending, setPending] = useState<Milestone[]>([]);
  const [scanned, setScanned] = useState(true);
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    listMilestones(db).then(setSaved).catch(() => {});
    listMilestones(db, 'pending').then(setPending).catch(() => {});
    journalScanned(db).then(setScanned).catch(() => {});
  }, [db]);
  useFocusEffect(load);

  const runScan = async () => {
    setNote('');
    setScan({ done: 0, total: 0 });
    try {
      const found = await scanJournal(db, (done, total) => setScan({ done, total }));
      setNote(found ? `Found ${found} possible milestone${found > 1 ? 's' : ''}. Save the real ones below.` : 'No new milestones found.');
    } catch (e) {
      setNote(`Scan stopped: ${e instanceof Error ? e.message : e}. Tap again to continue where it stopped.`);
    }
    setScan(null);
    load();
  };

  const years = [...new Set(saved.map((m) => new Date(m.date).getFullYear()))];

  return (
    <View>
      <SectionTitle
        title="Life timeline"
        right={
          <PressScale onPress={() => router.push('/milestone/new')} hitSlop={10} scaleTo={0.92} style={styles.add} accessibilityLabel="Add a milestone">
            <Ionicons name="add" size={18} color={colors.accentText} />
            <Text style={styles.addText}>Add</Text>
          </PressScale>
        }
      />
      <Text style={styles.hint}>
        The big moments: new jobs, moves, trips, wins. Your friend and the radio know them, and remember the anniversaries.
      </Text>

      {pending.map((m) => (
        <Suggestion key={m.id} m={m} onDone={load} />
      ))}

      {saved.length ? (
        years.map((y) => (
          <View key={y} style={styles.year}>
            <Text style={styles.yearText}>{y}</Text>
            {saved
              .filter((m) => new Date(m.date).getFullYear() === y)
              .map((m) => (
                <Pressable key={m.id} style={styles.row} onPress={() => router.push(`/milestone/${m.id}`)} accessibilityLabel={`Edit ${m.title}`}>
                  <View style={[styles.dot, m.big ? styles.dotBig : null]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, m.big ? { fontFamily: fonts.serifBold } : null]}>
                      {m.emoji ? `${m.emoji} ` : ''}
                      {m.title}
                    </Text>
                    <Text style={styles.meta}>
                      {milestoneDate(m)}
                      {m.story ? ` · ${m.story}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
          </View>
        ))
      ) : (
        <Text style={styles.meta}>Nothing yet. Add one with +, or let the app look through your journal.</Text>
      )}

      <View style={styles.scanRow}>
        {scan ? (
          <>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.meta}>
              Reading your journal{scan.total ? ` · ${Math.min(scan.done + 15, scan.total)}/${scan.total}` : '…'}
            </Text>
          </>
        ) : (
          <PillButton label={scanned ? 'Look through new entries' : 'Find milestones in my journal'} ghost onPress={runScan} />
        )}
      </View>
      {!!note && <Text style={styles.meta}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestion: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18, marginBottom: 14, gap: 4 },
  kicker: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, letterSpacing: 0.5 },
  title: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 26, color: colors.text },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 12 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  year: { marginBottom: 6 },
  yearText: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 22, color: colors.text, marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 9, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, marginTop: 8 },
  dotBig: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text, marginTop: 6, marginLeft: -2 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 23, color: colors.text },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accent, alignSelf: 'center' },
  addText: { fontFamily: fonts.sans, fontSize: 14, color: colors.accentText },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 6 },
});
