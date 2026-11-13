import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Easing, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CodeBlock } from '../../components/CodeBlock';
import { FadeIn, haptic, PressScale } from '../../components/motion';
import { IconButton, PillButton } from '../../components/ui';
import {
  BOSS_HP,
  comboMult,
  finishRound,
  KINDS,
  langInfo,
  rankOf,
  SPEED_SECONDS,
  startRound,
  totalXp,
  xpFor,
  type Answered,
  type Lang,
  type Mode,
  type Question,
  type RoundResult,
} from '../../lib/arena';
import { colors, fonts, radius } from '../../lib/theme';

// while it writes the first batch
const WAITING = [
  'Gemini is writing questions… and laughing at its own jokes',
  'Hiding bugs in the code. Very small ones. Mostly.',
  'Teaching JavaScript that 0.1 + 0.2 is fine, actually',
  'Asking NullPointerException Pasha to wait outside',
  'Sharpening the semicolons',
];

const LIVES = { round: 3, boss: 3, speed: 0 } as const;

/** One round: questions one after another, lives, combo, XP, then the results. */
export default function ArenaPlay() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lang: Lang; mode: Mode }>();
  const lang = (params.lang ?? 'js') as Lang;
  const mode = (params.mode ?? 'round') as Mode;
  const info = langInfo(lang);

  const [qs, setQs] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  const [i, setI] = useState(0);
  const [lives, setLives] = useState<number>(LIVES[mode]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [gain, setGain] = useState<{ n: number; key: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null); // the option (or line) you chose
  const [shown, setShown] = useState(false); // answered: show right/wrong
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [left, setLeft] = useState(SPEED_SECONDS);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [over, setOver] = useState(false);
  const [wait, setWait] = useState(0);
  const askedAt = useRef(Date.now());
  const shake = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ScrollViewInstance>(null);

  // the questions
  useEffect(() => {
    startRound(db, lang, mode)
      .then((q) => (q.length ? setQs(q) : setError('No questions yet. Check your AI key in Settings and try again.')))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, lang, mode]);
  useEffect(() => {
    if (qs || error) return;
    const t = setInterval(() => setWait((w) => w + 1), 3500);
    return () => clearInterval(t);
  }, [qs, error]);

  // the speed-run clock
  useEffect(() => {
    if (mode !== 'speed' || !qs || over) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [mode, qs, over]);
  useEffect(() => {
    if (mode === 'speed' && left <= 0 && !over) setOver(true);
  }, [left, mode, over]);

  // quitting mid-round asks first (the round won't count)
  const quit = () => {
    if (over || !qs || !answers.length) return router.back();
    Alert.alert('Run away?', "This round won't count. The bugs will talk about this.", [
      { text: 'Stay', style: 'cancel' },
      { text: 'Run away', style: 'destructive', onPress: () => router.back() },
    ]);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      quit();
      return true;
    });
    return () => sub.remove();
  });

  const q = qs?.[i];
  const right = (pick: number) => !!q && pick === q.answer;
  const rightCount = answers.filter((a) => a.right).length;
  const bossHp = Math.max(0, BOSS_HP - rightCount);

  // the round is saved once, when it ends
  const saved = useRef(false);
  useEffect(() => {
    if (!over || saved.current) return;
    saved.current = true;
    finishRound(db, lang, mode, answers, xp, bestCombo, mode === 'boss' && bossHp === 0)
      .then(setResult)
      .catch(() => {});
  }, [over, db, lang, mode, answers, xp, bestCombo, bossHp]);

  const answer = (pick: number) => {
    if (!q || shown) return;
    const ms = Date.now() - askedAt.current;
    const ok = right(pick);
    setPicked(pick);
    setShown(true);
    setAnswers((a) => [...a, { q, right: ok, ms }]);
    if (ok) {
      haptic.success();
      const c = combo + 1;
      const n = xpFor(q, c, ms);
      setCombo(c);
      setBestCombo((b) => Math.max(b, c));
      setXp((x) => x + n);
      setGain({ n, key: Date.now() });
    } else {
      haptic.error();
      setCombo(0);
      if (mode !== 'speed') setLives((l) => l - 1);
      Animated.sequence(
        [10, -10, 8, -8, 4, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 50, easing: Easing.linear, useNativeDriver: true })),
      ).start();
    }
    // a speed run doesn't stop to explain
    if (mode === 'speed') setTimeout(next, ok ? 350 : 700);
    else setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };

  // read at the moment "next" runs (a speed run calls it from a timer)
  const live = useRef({ lives, answers });
  live.current = { lives, answers };
  const next = () => {
    const { lives: l, answers: a } = live.current;
    const last = !qs || i + 1 >= qs.length;
    const dead = mode !== 'speed' && l <= 0;
    const bossDown = mode === 'boss' && a.filter((x) => x.right).length >= BOSS_HP;
    if (last || dead || bossDown) return setOver(true);
    setI((x) => x + 1);
    setPicked(null);
    setShown(false);
    askedAt.current = Date.now();
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  // ── screens ──

  if (error) {
    return (
      <Center insets={insets} onClose={() => router.back()}>
        <Text style={styles.bigEmoji}>🪲</Text>
        <Text style={styles.centerTitle}>The bugs won this one</Text>
        <Text style={styles.centerText}>{error}</Text>
      </Center>
    );
  }
  if (!qs) {
    return (
      <Center insets={insets} onClose={() => router.back()}>
        <Text style={styles.bigEmoji}>{mode === 'boss' ? info.boss.emoji : '⚔️'}</Text>
        <Text style={styles.centerTitle}>{mode === 'boss' ? `${info.boss.name} approaches…` : 'Getting the arena ready'}</Text>
        <FadeIn key={wait}>
          <Text style={styles.centerText}>{WAITING[wait % WAITING.length]}</Text>
        </FadeIn>
      </Center>
    );
  }
  if (over) return <Results insets={insets} mode={mode} lang={lang} answers={answers} xp={xp} bestCombo={bestCombo} result={result} bossWon={mode === 'boss' && bossHp === 0} />;
  if (!q) return null;

  const isBug = q.kind === 'bug';
  const ok = picked !== null && right(picked);
  const mult = comboMult(combo);

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[mode === 'boss' ? 'rgba(255,60,60,0.22)' : `${info.color}26`, 'transparent']}
        style={styles.glow}
        pointerEvents="none"
      />
      {/* top: close, progress / clock, lives, combo */}
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label="Quit" onPress={quit} />
        <View style={styles.progress}>
          {mode === 'speed' ? (
            <Text style={[styles.clock, left <= 10 && { color: colors.danger }]}>⏱ {Math.max(0, left)}s</Text>
          ) : (
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${((i + (shown ? 1 : 0)) / qs.length) * 100}%`, backgroundColor: info.color }]} />
            </View>
          )}
        </View>
        {mode !== 'speed' ? (
          <Text style={styles.lives}>{'❤️'.repeat(Math.max(0, lives))}{'🖤'.repeat(Math.max(0, LIVES[mode] - lives))}</Text>
        ) : (
          <Text style={styles.lives}>✅ {rightCount}</Text>
        )}
      </View>

      {/* the boss and its health */}
      {mode === 'boss' && (
        <View style={styles.boss}>
          <Animated.Text style={[styles.bossEmoji, !ok && shown && { transform: [{ scale: 1.15 }] }]}>{info.boss.emoji}</Animated.Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bossName} numberOfLines={1}>
              {info.boss.name}
            </Text>
            <View style={styles.hpTrack}>
              <View style={[styles.hpFill, { width: `${(bossHp / BOSS_HP) * 100}%` }]} />
            </View>
          </View>
        </View>
      )}

      <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <View style={styles.meta}>
          <Text style={styles.kind}>
            {KINDS[q.kind].emoji} {KINDS[q.kind].label}
          </Text>
          {combo >= 2 && (
            <FadeIn key={combo}>
              <Text style={[styles.combo, mult > 1 && { color: mult === 3 ? '#FF5CA8' : '#FFC24B' }]}>
                🔥 {combo} combo{mult > 1 ? ` ×${mult}` : ''}
              </Text>
            </FadeIn>
          )}
        </View>
        <Text style={styles.prompt}>{q.prompt}</Text>

        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <CodeBlock
            code={q.code}
            fill={q.kind === 'blank' && shown ? q.options[q.answer] : null}
            onLine={isBug && !shown ? setPicked : undefined}
            picked={isBug ? picked : null}
            right={isBug && shown ? q.answer : null}
          />
        </Animated.View>

        {/* the options (a bug hunt: tap a line, then confirm) */}
        {isBug ? (
          !shown && (
            <View style={{ marginTop: 16 }}>
              <PillButton
                label={picked === null ? 'Tap the broken line' : `Line ${picked + 1} is the bug 🐛`}
                onPress={() => picked !== null && answer(picked)}
                disabled={picked === null}
                full
              />
            </View>
          )
        ) : (
          <View style={styles.options}>
            {q.options.map((o, k) => {
              const isRight = shown && k === q.answer;
              const isWrong = shown && k === picked && k !== q.answer;
              return (
                <PressScale
                  key={k}
                  scaleTo={0.97}
                  onPress={() => answer(k)}
                  disabled={shown}
                  style={[styles.option, isRight && styles.optionRight, isWrong && styles.optionWrong, shown && !isRight && !isWrong && { opacity: 0.45 }]}
                  accessibilityLabel={`Answer: ${o}`}
                >
                  <Text style={styles.optionKey}>{String.fromCharCode(65 + k)}</Text>
                  <Text style={styles.optionText}>{o}</Text>
                  {isRight && <Text>✅</Text>}
                  {isWrong && <Text>❌</Text>}
                </PressScale>
              );
            })}
          </View>
        )}

        {/* +XP */}
        {gain && shown && ok && (
          <FadeIn key={gain.key} style={styles.gainWrap}>
            <Text style={styles.gain}>+{gain.n} XP</Text>
          </FadeIn>
        )}

        {/* what it was, and (wrong) a roast */}
        {shown && mode !== 'speed' && (
          <FadeIn>
            {!ok && (
              <View style={styles.roast}>
                <Text style={styles.roastWho}>{mode === 'boss' ? `${info.boss.emoji} ${info.boss.name}` : '🔥 Your Friend'}</Text>
                <Text style={styles.roastText}>
                  {mode === 'boss' && info.boss.taunts.length
                    ? info.boss.taunts[answers.length % info.boss.taunts.length]
                    : q.roast || 'Bro. BRO. We talked about this.'}
                </Text>
              </View>
            )}
            <View style={styles.explain}>
              <Text style={styles.explainTitle}>{ok ? 'Nice. Here’s why:' : isBug ? `It was line ${q.answer + 1}:` : 'The rule:'}</Text>
              <Text style={styles.explainText}>{q.explain}</Text>
              <Text style={styles.topic}>
                #{q.topic.replace(/\s+/g, '-')}
                {q.checked ? ' · ✓ verified by running it' : ''}
              </Text>
            </View>
            <View style={{ marginTop: 16 }}>
              <PillButton label={lives <= 0 ? 'See the damage' : i + 1 >= qs.length ? 'Finish' : 'Next'} onPress={() => next()} full />
            </View>
          </FadeIn>
        )}
      </ScrollView>
    </View>
  );
}

/** The end of the round: XP, accuracy, combo, a rank-up or a record. */
function Results({
  insets,
  mode,
  lang,
  answers,
  xp,
  bestCombo,
  result,
  bossWon,
}: {
  insets: { top: number; bottom: number };
  mode: Mode;
  lang: Lang;
  answers: Answered[];
  xp: number;
  bestCombo: number;
  result: RoundResult | null;
  bossWon: boolean;
}) {
  const info = langInfo(lang);
  const rights = answers.filter((a) => a.right).length;
  const all = answers.length;
  const perfect = all > 0 && rights === all;
  const dead = mode !== 'speed' && all - rights >= LIVES[mode];
  const [emoji, title, line] =
    mode === 'boss'
      ? bossWon
        ? ['🏆', 'Boss defeated!', `${info.boss.name} has left the building. Crying.`]
        : [info.boss.emoji, 'The boss won. This time.', 'It will remember this. So will you. Come back stronger.']
      : mode === 'speed'
        ? ['⏱️', `${rights} in ${SPEED_SECONDS} seconds`, result?.record ? 'NEW RECORD. Tell the servis driver.' : 'Not bad. Not a record either.']
        : dead
          ? ['💀', 'Game over', 'The bugs won this round. They are celebrating. Rudely.']
          : perfect
            ? ['🌟', 'Flawless!', 'Zero mistakes. Linus is nervous.']
            : ['✅', 'Round cleared', `${rights} of ${all} right. The missed ones will be back.`];
  const p = result?.progress;
  const rank = p ? rankOf(totalXp(p)) : null;
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient colors={[bossWon || perfect ? 'rgba(255,200,60,0.25)' : `${info.color}26`, 'transparent']} style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.results}>
        <FadeIn>
          <Text style={[styles.bigEmoji, { textAlign: 'center' }]}>{emoji}</Text>
          <Text style={styles.resultTitle}>{title}</Text>
          <Text style={styles.centerText}>{line}</Text>
        </FadeIn>
        <FadeIn delay={150}>
          <View style={styles.resultStats}>
            <Big value={`+${result?.xp ?? xp}`} label="XP" />
            <Big value={`${rights}/${all}`} label="right" />
            <Big value={`×${bestCombo}`} label="best combo" />
          </View>
        </FadeIn>
        {result?.rankUp && (
          <FadeIn delay={300}>
            <View style={styles.rankUp}>
              <Text style={styles.rankUpEmoji}>{result.rankUp.emoji}</Text>
              <Text style={styles.rankUpText}>Promoted to {result.rankUp.name}!</Text>
            </View>
          </FadeIn>
        )}
        {rank && !result?.rankUp && (
          <FadeIn delay={300}>
            <Text style={styles.rankLine}>
              {rank.emoji} {rank.name}
              {rank.next ? ` · ${(rank.next.xp - totalXp(p!)).toLocaleString()} XP to ${rank.next.name}` : ''}
            </Text>
          </FadeIn>
        )}
        <View style={{ gap: 10, marginTop: 30 }}>
          <PillButton label="Again!" onPress={() => router.replace({ pathname: '/arena/play', params: { lang, mode: mode === 'boss' ? 'round' : mode } })} full />
          <PillButton label="Back to the Arena" onPress={() => router.back()} ghost full />
        </View>
      </ScrollView>
    </View>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.bigValue}>{value}</Text>
      <Text style={styles.bigLabel}>{label}</Text>
    </View>
  );
}

function Center({ children, insets, onClose }: { children: React.ReactNode; insets: { top: number }; onClose: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 8 },
  progress: { flex: 1 },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  trackFill: { height: 10, borderRadius: 5 },
  clock: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.text, textAlign: 'center' },
  lives: { fontSize: 15, minWidth: 54, textAlign: 'right', color: colors.text, fontFamily: fonts.sans },
  boss: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 6, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,60,60,0.10)', borderWidth: 1, borderColor: 'rgba(255,90,90,0.35)' },
  bossEmoji: { fontSize: 36 },
  bossName: { fontFamily: fonts.sansBold, fontSize: 14, color: '#FFB3B3' },
  hpTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 6, overflow: 'hidden' },
  hpFill: { height: 8, borderRadius: 4, backgroundColor: '#FF4D4D' },
  content: { padding: 20, paddingTop: 10 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  kind: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, letterSpacing: 0.3 },
  combo: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  prompt: { fontFamily: fonts.sansBold, fontSize: 19, lineHeight: 26, color: colors.text, marginBottom: 14 },
  options: { gap: 10, marginTop: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  optionRight: { backgroundColor: 'rgba(86,211,100,0.18)', borderColor: 'rgba(86,211,100,0.7)' },
  optionWrong: { backgroundColor: 'rgba(255,90,80,0.18)', borderColor: 'rgba(255,90,80,0.7)' },
  optionKey: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.muted, width: 16 },
  optionText: { flex: 1, fontFamily: fonts.mono, fontSize: 14, lineHeight: 20, color: colors.text, fontVariant: ['no-contextual', 'no-common-ligatures'] },
  gainWrap: { alignItems: 'center', marginTop: 14 },
  gain: { fontFamily: fonts.monoBold, fontSize: 22, color: '#56D364' },
  roast: { marginTop: 16, padding: 14, borderRadius: radius.sm, backgroundColor: 'rgba(255,120,60,0.12)', borderWidth: 1, borderColor: 'rgba(255,140,80,0.3)' },
  roastWho: { fontFamily: fonts.sansBold, fontSize: 12, color: '#FFB38A', marginBottom: 4 },
  roastText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 21, color: colors.text },
  explain: { marginTop: 12, padding: 14, borderRadius: radius.sm, backgroundColor: colors.surface },
  explainTitle: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, marginBottom: 4 },
  explainText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.text },
  topic: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, marginTop: -60 },
  bigEmoji: { fontSize: 64, marginBottom: 12 },
  centerTitle: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text, textAlign: 'center' },
  centerText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 8 },
  results: { padding: 24 },
  resultTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.text, textAlign: 'center' },
  resultStats: { flexDirection: 'row', marginTop: 30, paddingVertical: 18, borderRadius: radius.md, backgroundColor: colors.surface },
  bigValue: { fontFamily: fonts.monoBold, fontSize: 24, color: colors.text },
  bigLabel: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 4 },
  rankUp: { marginTop: 18, padding: 16, borderRadius: radius.md, alignItems: 'center', backgroundColor: 'rgba(255,200,60,0.14)', borderWidth: 1, borderColor: 'rgba(255,200,60,0.5)' },
  rankUpEmoji: { fontSize: 40 },
  rankUpText: { fontFamily: fonts.sansBold, fontSize: 18, color: '#FFE08A', marginTop: 4 },
  rankLine: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 18 },
});
