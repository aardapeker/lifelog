import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '../../components/Glass';
import { FadeIn, PressScale, stagger } from '../../components/motion';
import { IconButton, InfoButton } from '../../components/ui';
import {
  BOSS_EVERY,
  bossReady,
  ensureBank,
  getBank,
  getProgress,
  langInfo,
  LANGS,
  levelOf,
  rankOf,
  ROUND_SIZE,
  SPEED_SECONDS,
  totalXp,
  type Lang,
  type Mode,
  type Progress,
} from '../../lib/arena';
import { getSetting, setSetting } from '../../lib/db';
import { colors, fonts, radius } from '../../lib/theme';
import { useFirstFrame } from '../../lib/perf';

/** Bug Arena's home: your rank, the languages, and the three ways to play. */
export default function ArenaHome() {
  useFirstFrame('Bug Arena'); // Settings → Privacy → Speed
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Progress | null>(null);
  const [lang, setLang] = useState<Lang>('js');
  const [ready, setReady] = useState<number | null>(null); // questions waiting
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');

  const fill = useCallback(
    (l: Lang) => {
      setError('');
      getBank(db, l).then((b) => setReady(b.length));
      setWriting(true);
      ensureBank(db, l)
        .then((n) => setReady(n))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setWriting(false));
    },
    [db],
  );

  useFocusEffect(
    useCallback(() => {
      getProgress(db).then(setP);
      getSetting(db, 'arena.lang', 'js').then((l) => {
        const k = (LANGS.find((x) => x.key === l && x.ready)?.key ?? 'js') as Lang;
        setLang(k);
        fill(k);
      });
    }, [db, fill]),
  );

  const pick = (l: Lang) => {
    setLang(l);
    setSetting(db, 'arena.lang', l).catch(() => {});
    fill(l);
  };
  const play = (mode: Mode) => router.push({ pathname: '/arena/play', params: { lang, mode } });

  const info = langInfo(lang);
  const xp = p ? totalXp(p) : 0;
  const rank = rankOf(xp);
  const answered = p ? p.right + p.wrong : 0;
  const due = p ? p.mistakes.filter((m) => m.lang === lang).length : 0;
  const boss = p ? bossReady(p, lang) : false;
  const toBoss = p ? BOSS_EVERY - (p.sinceBoss[lang] ?? 0) : BOSS_EVERY;

  return (
    <View style={styles.screen}>
      {/* the chosen language's colour, glowing from the top */}
      <LinearGradient colors={[`${info.color}33`, 'transparent']} style={styles.glow} pointerEvents="none" />
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <InfoButton
          title="How Bug Arena works"
          points={[
            'Short rounds you play with your thumb: predict what code prints, tap the broken line, or fill the blank.',
            'A normal round is 10 questions and 3 lives. Fast right answers in a row build a combo: ×2 at 3, ×3 at 6.',
            'Questions you miss come back two rounds later, until you get them right.',
            `Every ${BOSS_EVERY} rounds a boss shows up with harder questions. Beat it for +150 XP.`,
            'Questions are written by AI (Gemini when its key is saved) in batches and kept on your phone, so rounds work offline. JavaScript answers are double-checked by running the code.',
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <FadeIn>
          <Text style={styles.title}>Bug Arena ⚔️</Text>
          <Text style={styles.sub}>Break-sized coding rounds. Three lives. No mercy.</Text>
        </FadeIn>

        {/* your rank */}
        <FadeIn delay={stagger(1)}>
          <Glass radius={radius.md} style={styles.rank}>
            <View style={styles.rankTop}>
              <Text style={styles.rankEmoji}>{rank.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rankName}>{rank.name}</Text>
                <Text style={styles.rankXp}>
                  {xp.toLocaleString()} XP{rank.next ? ` · ${(rank.next.xp - xp).toLocaleString()} to ${rank.next.name}` : ' · the final form'}
                </Text>
              </View>
            </View>
            <View style={styles.track}>
              <LinearGradient
                colors={['#7C3AED', '#22D3EE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.fill, { width: `${Math.max(3, rank.toNext * 100)}%` }]}
              />
            </View>
            <View style={styles.stats}>
              <Stat value={`🔥 ${p?.streak ?? 0}`} label={p?.streak === 1 ? 'day streak' : 'days streak'} />
              <Stat value={answered ? `${Math.round(((p?.right ?? 0) / answered) * 100)}%` : '–'} label="accuracy" />
              <Stat value={`×${p?.bestCombo ?? 0}`} label="best combo" />
            </View>
          </Glass>
        </FadeIn>

        {/* the languages */}
        <Text style={styles.label}>Pick your weapon</Text>
        <View style={styles.langs}>
          {LANGS.map((l, i) => {
            const on = l.key === lang;
            return (
              <FadeIn key={l.key} delay={stagger(i + 2, 40)} style={styles.langCell}>
                <PressScale
                  disabled={!l.ready}
                  onPress={() => pick(l.key)}
                  style={[styles.lang, on && { borderColor: l.color, backgroundColor: `${l.color}1F` }, !l.ready && { opacity: 0.4 }]}
                  accessibilityLabel={l.ready ? l.label : `${l.label}, coming soon`}
                >
                  <Text style={[styles.langShort, { color: l.color }]}>{l.short}</Text>
                  <Text style={styles.langSub}>{l.ready ? `Lv ${p ? levelOf(p, l.key) : 1}` : '🔒 Soon'}</Text>
                </PressScale>
              </FadeIn>
            );
          })}
        </View>

        {/* how to play it */}
        <Text style={styles.label}>{info.label}</Text>
        <Mode
          emoji="⚔️"
          title="Play a round"
          sub={`${ROUND_SIZE} questions · 3 ❤️${due ? ` · ${due} missed coming back` : ''}`}
          onPress={() => play('round')}
          tint={info.color}
          main
        />
        <Mode
          emoji="⏱️"
          title="Speed run"
          sub={`${SPEED_SECONDS} seconds, as many as you can · best ${p?.speedBest[lang] ?? 0}`}
          onPress={() => play('speed')}
          tint={info.color}
        />
        <Mode
          emoji={info.boss.emoji}
          title={boss ? `BOSS: ${info.boss.name}` : info.boss.name}
          sub={boss ? 'Harder questions. 3 lives. +150 XP if you win.' : `Shows up in ${toBoss} round${toBoss === 1 ? '' : 's'}`}
          onPress={() => play('boss')}
          tint="#FF4D4D"
          disabled={!boss}
        />

        <Text style={styles.bank}>
          {error
            ? `⚠️ ${error}`
            : writing && !ready
              ? '✍️ Writing your first questions… (about half a minute)'
              : `${ready ?? 0} questions ready${writing ? ' · writing more…' : ''}`}
        </Text>
        {!!error && (
          <PressScale onPress={() => fill(lang)} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </PressScale>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Mode(props: { emoji: string; title: string; sub: string; onPress: () => void; tint: string; main?: boolean; disabled?: boolean }) {
  return (
    <PressScale
      scaleTo={0.97}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.mode, props.main && { borderColor: `${props.tint}88` }, props.disabled && { opacity: 0.45 }]}
      accessibilityLabel={props.title}
    >
      <LinearGradient colors={[`${props.tint}${props.main ? '30' : '14'}`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <Text style={styles.modeEmoji}>{props.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.modeTitle} numberOfLines={1}>
          {props.title}
        </Text>
        <Text style={styles.modeSub}>{props.sub}</Text>
      </View>
      <Text style={styles.modeGo}>{props.disabled ? '🔒' : '›'}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  content: { padding: 20, paddingTop: 8 },
  title: { fontFamily: fonts.display, fontSize: 38, lineHeight: 44, letterSpacing: -0.5, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.muted, marginTop: 4, marginBottom: 18 },
  rank: { padding: 18 },
  rankTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rankEmoji: { fontSize: 40 },
  rankName: { fontFamily: fonts.sansBold, fontSize: 20, color: colors.text },
  rankXp: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 16, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', marginTop: 16 },
  statValue: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text },
  statLabel: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 26, marginBottom: 10 },
  langs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  langCell: { width: '31.5%' },
  lang: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  langShort: { fontFamily: fonts.monoBold, fontSize: 22 },
  langSub: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 4 },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  modeEmoji: { fontSize: 28 },
  modeTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  modeSub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  modeGo: { fontFamily: fonts.sans, fontSize: 24, color: colors.muted },
  bank: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 10, textAlign: 'center' },
  retry: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.raised },
  retryText: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
});
