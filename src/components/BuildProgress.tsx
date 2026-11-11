import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Ionicons from './Icon';
import { colors, fonts } from '../lib/theme';
import type { Station } from '../lib/stations';

/*
 * While a show is being made: a list of what's happening, like a log. Finished steps get a ✓ and
 * fade back; the running one has four pulsing dots and its words ripple with light. The long step
 * (the writer at work) cycles through little behind-the-scenes lines and shows how long it's been.
 */

const WARM = '#E8825A'; // the one warm colour on the screen: "something is happening"

function labelOf(key: string, st: Station, tr: boolean): string {
  const host = st.host.name;
  const side = st.sidekick?.name ?? host;
  const L: Record<string, [string, string]> = {
    journal: ['Reading your journal', 'Günlüğün okunuyor'],
    favourites: ['Digging through your favourites', 'Favori şarkıların karıştırılıyor'],
    writing: [`${host} is writing the show`, `${host} programı yazıyor`],
    songs: ['Finding the songs on Spotify', "Şarkılar Spotify'da aranıyor"],
    voice: [`${host} & ${side} are warming up the mic`, `${host} ve ${side} mikrofonu ısıtıyor`],
  };
  if (!st.sidekick) L.voice = [`${host} is warming up the mic`, `${host} mikrofonu ısıtıyor`];
  return (L[key] ?? [key, key])[tr ? 1 : 0];
}

/** Each station's own jokes for the long wait: [English, Turkish]. */
const FUNNY: Record<string, [string, string][]> = {
  friend: [
    ['Pretending to listen to your problems', 'Dertlerini dinliyormuş gibi yapılıyor'],
    ["Checking if you drank water today (you didn't)", 'Bugün su içtin mi diye bakılıyor (içmedin)'],
    ['Practising a supportive voice', 'Destekleyici ses tonu prova ediliyor'],
  ],
  neon: [
    ['Candy is teasing her hair to 1987 levels', 'Candy saçlarını 1987 seviyesine kabartıyor'],
    ['Rico is ironing the shoulder pads', 'Rico vatkaları ütülüyor'],
    ['Rewinding the cassette with a pencil', 'Kaset kalemle geri sarılıyor'],
    ['Looking for the convertible keys', 'Üstü açık arabanın anahtarı aranıyor'],
  ],
  nightshift: [
    ['Max is on his fourth coffee', 'Max dördüncü kahvesinde'],
    ['Deniz is staring at the city lights, dramatically', 'Deniz şehrin ışıklarına dramatik dramatik bakıyor'],
    ['Waiting for the servis that is always 7 minutes late', 'Her zaman 7 dakika geç kalan servis bekleniyor'],
    ['Counting boxes until sunrise', 'Güneş doğana kadar koli sayılıyor'],
  ],
  rock: [
    ['Riff is tuning a guitar that was already in tune', 'Riff zaten akortlu gitarı akort ediyor'],
    ['Turning the amp up to 11', 'Amfi 11’e açılıyor'],
    ['Selin is hiding the drummer’s energy drinks', 'Selin davulcunun enerji içeceklerini saklıyor'],
    ['Looking for the guitar pick inside the guitar', 'Gitarın içine düşen pena aranıyor'],
  ],
  chill: [
    ['Şemistan is sitting on the keyboard', 'Şemistan klavyenin üstüne oturdu'],
    ['Ece is waiting for the rain to start', 'Ece yağmurun başlamasını bekliyor'],
    ['Şemistan knocked the mic off the table. Again.', 'Şemistan mikrofonu masadan düşürdü. Yine.'],
    ['Negotiating with the cat for the chair', 'Sandalye için kediyle pazarlık yapılıyor'],
  ],
  arabesk: [
    ['Kemal is staring out the window, sighing', 'Kemal camdan dışarı bakıp iç çekiyor'],
    ['Cengiz is brewing the tea, demli', 'Cengiz çayı demliyor, tavşan kanı'],
    ['Kemal lit a cigarette, then remembered he quit', 'Kemal sigara yaktı, sonra bıraktığını hatırladı'],
    ['Wiping a single tear off the microphone', 'Mikrofondaki tek damla gözyaşı siliniyor'],
    ['Blaming fate (kader) for the delay', 'Gecikme için kader suçlanıyor'],
  ],
};

/** Little lines for the long wait while the script is written: real work and jokes, shuffled. */
function asides(st: Station, tr: boolean): string[] {
  const host = st.host.name;
  const side = st.sidekick?.name;
  const work = tr
    ? ['Bu haftanın notlarına bakılıyor', `${host} açılış cümlesini düşünüyor`, side ? `${side} sahte bir reklam yazıyor` : 'Sahte bir reklam yazılıyor', 'Şakalar deneniyor, kötüleri atılıyor']
    : ['Looking at this week’s notes', `${host} is thinking of an opening line`, side ? `${side} is writing a fake ad` : 'Writing a fake ad', 'Testing jokes, throwing out the bad ones'];
  const jokes = (FUNNY[st.key] ?? FUNNY.friend).map(([en, trk]) => (tr ? trk : en));
  // alternate: a real step, a joke, a real step… (jokes in random order, so it's not the same every show)
  const mixed = [...jokes].sort(() => Math.random() - 0.5);
  return work.flatMap((w, i) => (mixed[i] ? [w, mixed[i]] : [w])).concat(mixed.slice(work.length));
}

/** Four dots in a square, lighting up one after another. */
function Dots() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 4, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  // clockwise: top-left, top-right, bottom-right, bottom-left
  const order = [0, 1, 3, 2];
  return (
    <View style={styles.dots}>
      {[0, 1, 2, 3].map((i) => {
        const k = order.indexOf(i);
        const opacity = t.interpolate({
          inputRange: [0, k, k + 0.5, k + 1, 4],
          outputRange: k === 0 ? [1, 1, 0.55, 0.25, 0.25] : [0.25, 0.25, 1, 0.55, 0.25],
          extrapolate: 'clamp',
        });
        return <Animated.View key={i} style={[styles.dot, { opacity }]} />;
      })}
    </View>
  );
}

/** Words with a wave of light running through them, letter by letter. */
function Ripple({ text, style }: { text: string; style?: object }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t, text]);
  const chars = useMemo(() => Array.from(text), [text]);
  const n = chars.length + 8; // the wave starts before the first letter and leaves after the last
  // each letter is its own small view (Android can't animate letters nested inside one Text)
  return (
    <View style={styles.ripple}>
      {chars.map((c, i) => {
        const at = (i + 4) / n;
        const opacity = t.interpolate({
          inputRange: [0, Math.max(0, at - 0.12), at, Math.min(1, at + 0.12), 1],
          outputRange: [0.45, 0.45, 1, 0.45, 0.45],
          extrapolate: 'clamp',
        });
        return (
          <Animated.Text key={i} style={[style, { opacity }]}>
            {c === ' ' ? '\u00A0' : c}
          </Animated.Text>
        );
      })}
    </View>
  );
}

/** A finished step: slides in, then settles grey with a check. */
function Done({ text }: { text: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.View style={[styles.row, { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }]}>
      <View style={styles.icon}>
        <Ionicons name="checkmark" size={16} color={colors.ok} />
      </View>
      <Text style={styles.doneText}>{text}</Text>
    </Animated.View>
  );
}

export function BuildProgress({ steps, station }: { steps: { key: string; detail?: string }[]; station: Station }) {
  const tr = station.lang === 'tr';
  const current = steps.at(-1);
  // the clock for the running step, and the rotating aside while the writer works
  const [since, setSince] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => setSince(Date.now()), [current?.key]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  const lines = useMemo(() => asides(station, tr), [station, tr]);
  const aside = current?.key === 'writing' ? lines[Math.floor(secs / 6) % lines.length] : current?.detail;
  const clock = secs >= 5 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.station}>
        {station.emoji} {station.name} {station.freq}
      </Text>
      {steps.slice(0, -1).map((s) => (
        <Done key={s.key} text={labelOf(s.key, station, tr)} />
      ))}
      {current ? (
        <View style={styles.row}>
          <View style={styles.icon}>
            <Dots />
          </View>
          <View style={{ flex: 1 }}>
            <Ripple key={current.key} text={labelOf(current.key, station, tr)} style={styles.nowText} />
            {(aside || clock) && (
              <Text style={styles.aside}>
                {aside}
                {aside && clock ? ' · ' : ''}
                {clock}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.icon}>
            <Dots />
          </View>
          <Ripple text={tr ? 'Hazırlanıyor' : 'Getting ready'} style={styles.nowText} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 8 },
  station: { fontFamily: fonts.sans, fontSize: 13, letterSpacing: 0.3, color: colors.muted, marginBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  doneText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 22, color: colors.muted },
  nowText: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.text },
  aside: { fontFamily: fonts.serifItalic, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 4 },
  ripple: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  dots: { width: 14, height: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: WARM },
});
