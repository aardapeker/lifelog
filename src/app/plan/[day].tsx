import Ionicons from '../../components/Icon';
import { openWrite } from '../../lib/write';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Shimmer, ShimmerText } from '../../components/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, InfoTile, PillButton, StatusLine, type Status } from '../../components/ui';
import {
  dayTitle,
  draftEntryFromPlan,
  getPlan,
  makePlan,
  parseDayParam,
  savePlan,
  type Plan,
  type PlanItem,
} from '../../lib/planner';
import { setPendingShare } from '../../lib/share';
import { colors, fonts, radius } from '../../lib/theme';

const KIND_LABEL: Record<PlanItem['kind'], string> = {
  social: 'With people',
  solo: 'Just you',
  goal: 'Goal step',
  rest: 'Rest',
  chore: 'To do',
};

const open = (url: string) => Linking.openURL(url).catch(() => {});

/** The friend's plan for a day off: weather, a checklist, real events with links. */
export default function PlanScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { day } = useLocalSearchParams<{ day: string }>();
  const dayMs = parseDayParam(day ?? '');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [making, setMaking] = useState(false);

  const build = useCallback(async () => {
    setMaking(true);
    setStatus({ kind: 'idle' });
    try {
      setPlan(await makePlan(db, dayMs));
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setMaking(false);
    }
  }, [db, dayMs]);

  // open an existing plan, or make one right away
  useEffect(() => {
    getPlan(db, dayMs).then((p) => (p ? setPlan(p) : build()));
  }, [db, dayMs, build]);

  const toggle = async (index: number) => {
    if (!plan) return;
    const next = { ...plan, items: plan.items.map((it, i) => (i === index ? { ...it, done: !it.done } : it)) };
    setPlan(next);
    await savePlan(db, next);
  };

  const writeEntry = async () => {
    if (!plan) return;
    setStatus({ kind: 'busy' });
    try {
      setPendingShare({ text: await draftEntryFromPlan(db, plan), imageUri: null });
      setStatus({ kind: 'idle' });
      openWrite({ shared: true });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const done = plan?.items.filter((i) => i.done).length ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>Day off</Text>
        <IconButton icon="refresh" label="Plan again" onPress={build} />
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>
        <Text style={styles.title}>{dayTitle(dayMs)}</Text>

        {making && (
          <View>
            <Text style={styles.makingText}>Checking the weather, looking for events, planning your day…</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 18 }}>
              <Shimmer style={{ flex: 1, height: 58, borderRadius: 12 }} />
              <Shimmer style={{ flex: 1, height: 58, borderRadius: 12 }} />
              <Shimmer style={{ flex: 1, height: 58, borderRadius: 12 }} />
            </View>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>
                <Shimmer style={{ width: 22, height: 22, borderRadius: 11 }} />
                <View style={{ flex: 1 }}>
                  <ShimmerText lines={2} />
                </View>
              </View>
            ))}
          </View>
        )}

        {!making && plan && (
          <>
            {plan.weather && (
              <View style={styles.tiles}>
                <InfoTile label="Weather" value={plan.weather.text} />
                <InfoTile label="Temp" value={`${plan.weather.min}–${plan.weather.max}°`} />
                <InfoTile label="Rain" value={`${plan.weather.rain}%`} />
              </View>
            )}
            {!!plan.intro && <Text style={styles.intro}>{plan.intro}</Text>}
            {!!plan.note && <Text style={styles.note}>{plan.note}</Text>}

            <View style={{ marginTop: 18 }}>
              {plan.items.map((item, i) => (
                <Pressable key={`${i}-${item.title}`} style={styles.item} onPress={() => toggle(i)}>
                  <Text style={styles.time}>{item.time}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, item.done && styles.done]}>{item.title}</Text>
                    {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
                    <View style={styles.meta}>
                      <Text style={styles.kind}>{KIND_LABEL[item.kind]}</Text>
                      {item.url && (
                        <Pressable onPress={() => open(item.url!)} hitSlop={8}>
                          <Text style={styles.link}>Details</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <Ionicons
                    name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={item.done ? colors.text : colors.muted}
                  />
                </Pressable>
              ))}
            </View>

            <PillButton
              label={done ? `Turn ${done === 1 ? 'it' : `these ${done}`} into today's entry` : "Tick what you did, then write today's entry"}
              onPress={writeEntry}
              disabled={!done}
              full
              style={{ marginTop: 22 }}
            />

            {(plan.queries.length > 0 || plan.sources.length > 0) && (
              <View style={styles.sources}>
                <Text style={styles.sourcesTitle}>Found with Google Search</Text>
                <View style={styles.queries}>
                  {plan.queries.map((q) => (
                    <Pressable
                      key={q}
                      style={styles.query}
                      onPress={() => open(`https://www.google.com/search?q=${encodeURIComponent(q)}`)}
                    >
                      <Ionicons name="search" size={12} color={colors.muted} />
                      <Text style={styles.queryText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
                {plan.sources.map((s) => (
                  <Pressable key={s.uri} onPress={() => open(s.uri)} hitSlop={4}>
                    <Text style={styles.source} numberOfLines={1}>
                      {s.title}
                    </Text>
                  </Pressable>
                ))}
                <Text style={styles.note}>Event details come from the web. Check the link before you go.</Text>
              </View>
            )}
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 22 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 32, lineHeight: 38, color: colors.text, marginBottom: 16 },
  making: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20 },
  makingText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  intro: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 28, color: colors.text },
  note: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  time: { width: 46, fontFamily: fonts.sans, fontSize: 14, color: colors.muted, paddingTop: 2 },
  itemTitle: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 24, color: colors.text },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  detail: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  kind: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  link: { fontFamily: fonts.sans, fontSize: 12, color: colors.text, textDecorationLine: 'underline' },
  sources: { marginTop: 28, gap: 6 },
  sourcesTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.text, marginBottom: 4 },
  queries: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  query: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  queryText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.text },
  source: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
});
