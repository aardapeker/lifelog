import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, inputColors, radius } from '../lib/theme';
import { FEATURES, getBudget, lira, setBudget, usageReport, usdToTry, type UsageReport } from '../lib/usage';
import { Glass } from './Glass';
import { IconTile } from './IconTile';
import { PillButton, SectionTitle } from './ui';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const shortModel = (m: string) => m.replace(/^gemini-/, 'Gemini ').replace(/^claude-/, 'Claude ').replace(/-/g, ' ');

/**
 * What the AI costs: counted by the app from every call, priced, in lira.
 * Today, this month, a forecast, 28 days of bars (tap one for that day), where it goes, and a budget that only warns.
 */
export function UsageSection() {
  const db = useSQLiteContext();
  const [r, setR] = useState<UsageReport | null>(null);
  const [fx, setFx] = useState<{ rate: number; day: string } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [budget, setBudgetState] = useState(0);
  const [draft, setDraft] = useState('');
  const [since, setSince] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      usageReport(db).then(setR).catch(() => {});
      usdToTry(db).then(setFx).catch(() => {});
      getBudget(db).then((b) => {
        setBudgetState(b);
        setDraft(b ? String(b) : '');
      });
      db.getFirstAsync<{ at: number | null }>('SELECT MIN(at) AS at FROM usage')
        .then((x) => setSince(x?.at ?? null))
        .catch(() => {});
    }, [db]),
  );

  if (!r) return null;
  const money = (usd: number) => (fx ? lira(usd, fx.rate) : `$${usd.toFixed(usd < 1 ? 3 : 2)}`);
  const max = Math.max(...r.days.map((d) => d.usd), 0.0001);
  const day = picked ?? r.days[r.days.length - 1].day;
  const detail = r.dayDetail.get(day) ?? [];
  const dayTotal = r.days.find((d) => d.day === day)?.usd ?? 0;
  const featMax = Math.max(...r.byFeature.map((f) => f.usd), 0.0001);
  const monthTl = fx ? r.month * fx.rate : 0;

  const saveBudget = async () => {
    const n = Number(draft.replace(/[^\d]/g, '')) || 0;
    await setBudget(db, n);
    setBudgetState(n);
  };

  return (
    <View style={{ gap: 6 }}>
      <SectionTitle title="AI Usage" />
      <Text style={styles.hint}>
        Counted by the app from every AI call, at today's prices. An estimate: your AI Studio page has the real bill
        (and your other apps on the same key).
      </Text>

      <View style={styles.tiles}>
        <Tile label="Today" value={money(r.today)} />
        <Tile label="This month" value={money(r.month)} />
        <Tile label="At this pace" value={money(r.forecast)} sub="by month end" />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Last 28 days</Text>
        <View style={styles.chart}>
          {r.days.map((d) => (
            <Pressable
              key={d.day}
              style={styles.col}
              onPress={() => setPicked(d.day)}
              hitSlop={{ top: 20, bottom: 10 }}
              accessibilityLabel={`${dayLabel(d.day)}: ${money(d.usd)}`}
            >
              <View
                style={[
                  styles.bar,
                  { height: d.usd ? Math.max(3, (d.usd / max) * 110) : 2 },
                  d.day === day ? styles.barPicked : d.usd ? styles.barOn : styles.barOff,
                ]}
              />
            </Pressable>
          ))}
        </View>
        <View style={styles.axis}>
          <Text style={styles.axisText}>{dayLabel(r.days[0].day)}</Text>
          <Text style={styles.axisText}>Today</Text>
        </View>

        <Text style={styles.dayTitle}>
          {dayLabel(day)} · {money(dayTotal)}
        </Text>
        {detail.length ? (
          detail.map((f) => (
            <View key={f.feature} style={styles.line}>
              <View style={styles.featName}>
                <IconTile icon={FEATURES[f.feature].icon} tint={FEATURES[f.feature].tint} size={26} />
                <Text style={styles.lineText} numberOfLines={1}>
                  {FEATURES[f.feature].label}
                </Text>
              </View>
              <Text style={styles.lineValue}>{money(f.usd)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.hint}>Nothing that day. Tap a bar to see a day.</Text>
        )}
      </View>

      {r.byFeature.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>This month, by job</Text>
          {r.byFeature.map((f) => (
            <View key={f.feature} style={styles.featRow}>
              <View style={[styles.featName, { width: 150, flex: 0 }]}>
                <IconTile icon={FEATURES[f.feature].icon} tint={FEATURES[f.feature].tint} size={26} />
                <Text style={styles.featLabel} numberOfLines={1}>
                  {FEATURES[f.feature].label}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(2, (f.usd / featMax) * 100)}%` }]} />
              </View>
              <Text style={styles.featValue}>{money(f.usd)}</Text>
            </View>
          ))}
          <Text style={[styles.panelTitle, { marginTop: 18 }]}>By model</Text>
          {r.byModel.map((m) => (
            <View key={m.model} style={styles.line}>
              <Text style={styles.lineText} numberOfLines={1}>
                {shortModel(m.model)} <Text style={styles.muted}>· {m.calls} calls</Text>
              </Text>
              <Text style={styles.lineValue}>{money(m.usd)}</Text>
            </View>
          ))}
          {r.searches > 0 && (
            <Text style={[styles.hint, { marginTop: 10 }]}>
              Google searches: {r.searches.toLocaleString('tr-TR')} of 5.000 free this month.
            </Text>
          )}
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Monthly budget</Text>
        {budget > 0 && fx && (
          <>
            <View style={[styles.track, { marginTop: 10 }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, (monthTl / budget) * 100)}%` },
                  monthTl >= budget ? { backgroundColor: '#FF5A6E' } : monthTl >= budget * 0.8 ? { backgroundColor: '#EBC96E' } : null,
                ]}
              />
            </View>
            <Text style={styles.hint}>
              {lira(r.month, fx.rate)} of ₺{budget.toLocaleString('tr-TR')} ({Math.round((monthTl / budget) * 100)}%)
            </Text>
          </>
        )}
        <View style={styles.budgetRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            keyboardType="number-pad"
            placeholder="₺ a month, e.g. 500"
            placeholderTextColor={colors.muted}
            {...inputColors}
          />
          <PillButton label="Save" onPress={saveBudget} />
        </View>
        <Text style={styles.hint}>
          A notification at 80% and at 100%. Nothing is ever switched off. Leave it empty for no budget.
        </Text>
      </View>

      <Text style={styles.small}>
        {fx ? `$1 = ₺${fx.rate.toFixed(2)} (European Central Bank, ${fx.day}). ` : 'No exchange rate yet, so dollars. '}
        {since ? `Counting since ${dayLabel(since)}.` : 'Counting starts with the next AI call.'}
      </Text>
    </View>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Glass radius={radius.md} style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!sub && <Text style={styles.small}>{sub}</Text>}
    </Glass>
  );
}

const styles = StyleSheet.create({
  featName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 6 },
  small: { fontFamily: fonts.sansRegular, fontSize: 11, lineHeight: 16, color: colors.muted },
  muted: { color: colors.muted },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  tile: { flex: 1, padding: 14, minHeight: 86 },
  tileLabel: { fontFamily: fonts.serif, fontSize: 13, color: colors.muted },
  tileValue: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 24, lineHeight: 32, color: colors.text, marginTop: 4 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18, marginBottom: 10 },
  panelTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.text, marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 116, gap: 3 },
  col: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', borderRadius: 3 },
  barOn: { backgroundColor: '#8C8B8B' },
  barOff: { backgroundColor: colors.line },
  barPicked: { backgroundColor: colors.text },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontFamily: fonts.sansRegular, fontSize: 11, color: colors.muted },
  dayTitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.text, marginTop: 16, marginBottom: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 10 },
  lineText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: colors.text },
  lineValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  featLabel: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 13, color: colors.text },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.raised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.text },
  featValue: { width: 64, textAlign: 'right', fontFamily: fonts.sans, fontSize: 13, color: colors.text },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  input: {
    flex: 1,
    backgroundColor: colors.raised,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.text,
  },
});
