import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, stagger } from '../../components/motion';
import { IconButton, PillButton, StatusLine, type Status } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';
import { getWrapped, makeWrapped, monthName, type Wrapped } from '../../lib/wrapped';

/** Monthly Wrapped, unhinged: big numbers, fake awards, a movie plot, a verdict. */
export default function WrappedScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { month } = useLocalSearchParams<{ month: string }>();
  const [w, setW] = useState<Wrapped | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    getWrapped(db, month).then((x) => {
      setW(x);
      setLoaded(true);
    });
  }, [db, month]);

  const make = async () => {
    setStatus({ kind: 'busy' });
    try {
      setW(await makeWrapped(db, month));
      setStatus({ kind: 'idle' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const s = w?.stats;
  const big = s
    ? [
        { n: String(s.entries), label: s.entries === 1 ? 'entry' : 'entries' },
        { n: s.words.toLocaleString(), label: 'words' },
        { n: String(s.days), label: 'days you showed up' },
        ...(s.latest ? [{ n: s.latest, label: 'latest you were up writing' }] : []),
        ...(s.shows ? [{ n: String(s.shows), label: 'radio shows' }] : []),
        ...(s.bruh ? [{ n: String(s.bruh), label: 'entries with "bruh"' }] : []),
        ...(s.cat ? [{ n: String(s.cat), label: 'Şemistan sightings' }] : []),
      ]
    : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>📼 {month ? monthName(month) : ''}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {loaded && !w && (
          <View>
            <Text style={styles.title}>{'Your Month,\nWrapped'}</Text>
            <Text style={styles.body}>Numbers from your journal, fake awards, and a roast. Unhinged edition.</Text>
            <PillButton label="Make it" onPress={make} style={{ alignSelf: 'flex-start', marginTop: 22 }} />
          </View>
        )}
        {w && s && (
          <>
            <FadeIn>
              {w.partial && <Text style={styles.kicker}>SNEAK PEEK · the month isn't over</Text>}
              <Text style={styles.title}>{w.title}</Text>
              {!!w.intro && <Text style={styles.body}>{w.intro}</Text>}
            </FadeIn>

            <View style={styles.grid}>
              {big.map((b, i) => (
                <FadeIn key={b.label} delay={stagger(i, 70)} style={styles.stat}>
                  <Text style={styles.statN}>{b.n}</Text>
                  <Text style={styles.statLabel}>{b.label}</Text>
                </FadeIn>
              ))}
            </View>

            {(s.topMood || s.topWord || s.topArtist) && (
              <FadeIn style={styles.card} delay={stagger(big.length, 70)}>
                {s.topMood && <Line label="Top emotion" value={`${s.topMood.label} (${s.topMood.share}%)`} />}
                {s.avgMood !== null && <Line label="Average mood" value={`${s.avgMood.toFixed(1)} / 5`} />}
                {s.topWord && <Line label="Your word of the month" value={`"${s.topWord.word}" ×${s.topWord.count}`} />}
                {s.topArtist && <Line label="Radio's top artist" value={`${s.topArtist.name} (${s.topArtist.plays} plays)`} />}
                {!!w.topExcuse && <Line label="Top excuse" value={w.topExcuse} />}
              </FadeIn>
            )}

            {w.awards.length > 0 && <Text style={styles.section}>🏆 The Awards</Text>}
            {w.awards.map((a, i) => (
              <FadeIn key={a.title} style={styles.award} delay={stagger(i, 90)}>
                <Text style={styles.awardEmoji}>{a.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.awardTitle}>{a.title}</Text>
                  <Text style={styles.awardText}>{a.text}</Text>
                </View>
              </FadeIn>
            ))}

            {!!w.arc && (
              <>
                <Text style={styles.section}>🎬 The Movie</Text>
                <Text style={styles.quote}>{w.arc}</Text>
              </>
            )}
            {!!w.prediction && (
              <>
                <Text style={styles.section}>🔮 Next Month</Text>
                <Text style={styles.quote}>{w.prediction}</Text>
              </>
            )}
            {!!w.verdict && <Text style={styles.verdict}>{w.verdict}</Text>}

            <PillButton label="Make it again" onPress={make} ghost style={{ alignSelf: 'flex-start', marginTop: 28 }} />
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.sans, fontSize: 17, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 24 },
  kicker: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 1.2, color: '#E8825A', marginBottom: 10 },
  title: { fontFamily: fonts.display, letterSpacing: -0.6, fontSize: 36, lineHeight: 42, color: colors.text, marginBottom: 12 },
  body: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 26, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  stat: { width: '47%', flexGrow: 1, backgroundColor: colors.raised, borderRadius: radius.md, padding: 16 },
  statN: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -1, color: colors.text },
  statLabel: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  card: { backgroundColor: colors.raised, borderRadius: radius.md, padding: 18, marginTop: 12, gap: 12 },
  line: { gap: 2 },
  lineLabel: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 0.4, color: colors.muted },
  lineValue: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 24, color: colors.text },
  section: { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginTop: 32, marginBottom: 12 },
  award: { flexDirection: 'row', gap: 14, backgroundColor: colors.raised, borderRadius: radius.md, padding: 16, marginBottom: 10 },
  awardEmoji: { fontSize: 30 },
  awardTitle: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.text },
  awardText: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 2 },
  quote: { fontFamily: fonts.serifItalic, fontSize: 18, lineHeight: 28, color: colors.text },
  verdict: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, color: colors.text, marginTop: 34 },
});
