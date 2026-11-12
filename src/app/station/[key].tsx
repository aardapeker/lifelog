import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../../components/motion';
import { StationArt } from '../../components/StationArt';
import { Chip, IconButton, PillButton, StatusLine } from '../../components/ui';
import { getSetting, setSetting } from '../../lib/db';
import { SHOW_LENGTHS, songLangOf, songLangsFor, type SongLang } from '../../lib/radio';
import { useRadio } from '../../lib/radioEngine';
import { FRIEND_VOICES, LANGS, STATIONS, voicesFor } from '../../lib/stations';
import { colors, fonts, inputColors, radius } from '../../lib/theme';

/** One station: its artwork and hosts, the show's options, and Go on air. */
export default function StationScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const scroll = useRef<ScrollViewInstance>(null);
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboard(e.endCoordinates.height);
      scroll.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const r = useRadio();
  const { station, stationKey, setStationKey, length, setLength, reviewFirst, setReviewFirst, chooseLang, chooseVoice, trying, wish, setWish, status, phase } = r;
  useEffect(() => {
    if (key && STATIONS.some((s) => s.key === key) && key !== stationKey) setStationKey(key);
  }, [key, stationKey, setStationKey]);

  const [songLang, setSongLang] = useState<SongLang>('station'); // the songs' language (the talk has its own)
  useEffect(() => {
    getSetting(db, 'radio.songLang', 'station').then((v) => setSongLang(v as SongLang)).catch(() => {});
  }, [db]);
  const pickSongLang = (v: SongLang) => {
    setSongLang(v);
    setSetting(db, 'radio.songLang', v).catch(() => {});
  };
  const [recast, setRecast] = useState(false); // the full voice lists, only on purpose

  const busy = phase === 'building' || phase === 'review' || phase === 'onair';
  const goOnAir = () => {
    r.start();
    router.replace('/onair');
  };

  if (station.key !== key) return <View style={styles.screen} />; // a frame, while the station switches

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>
          {station.name} {station.freq}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingBottom: keyboard ? 110 + keyboard : 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <FadeIn>
          <StationArt station={station} size={56} style={styles.hero} />
          <Text style={styles.tagline}>{station.tagline}</Text>
          <Text style={styles.hosts}>
            {station.sidekick ? `with ${station.host.name} & ${station.sidekick.name}` : `with ${station.host.name}`}
          </Text>
        </FadeIn>

        <Text style={styles.label}>How long?</Text>
        <View style={styles.chips}>
          {SHOW_LENGTHS.map((n) => (
            <Chip key={n} label={`${n} songs`} active={length === n} onPress={() => setLength(n)} />
          ))}
        </View>

        <Text style={styles.label}>Playlist</Text>
        <View style={styles.chips}>
          <Chip label="Let me check it first" active={reviewFirst} onPress={() => setReviewFirst(true)} />
          <Chip label="Surprise me" active={!reviewFirst} onPress={() => setReviewFirst(false)} />
        </View>

        <Text style={styles.label}>Hosts speak</Text>
        <View style={styles.chips}>
          {LANGS.map((l) => (
            <Chip key={l.key} label={l.label} active={station.lang === l.key} onPress={() => chooseLang(l.key)} />
          ))}
        </View>

        <Text style={styles.label}>Songs</Text>
        <View style={styles.chips}>
          {/* only the languages that exist in the station's genre (Arabesk: Turkish only) */}
          {songLangsFor(station).map((l) => (
            <Chip key={l.key} label={l.label} active={songLangOf(station, songLang) === l.key} onPress={() => pickSongLang(l.key)} />
          ))}
        </View>

        <Text style={styles.label}>Voices</Text>
        {[
          { role: 'host' as const, p: station.host },
          ...(station.sidekick ? [{ role: 'sidekick' as const, p: station.sidekick }] : []),
        ].map(({ role, p }) => {
          const friend = station.key === 'friend';
          const options = friend
            ? FRIEND_VOICES.map((f) => ({ voice: f.voice, label: f.label }))
            : voicesFor(p).map((v) => ({ voice: v.name, label: `${v.name} · ${v.vibe}${p.gender ? '' : v.gender === 'male' ? ' ♂' : ' ♀'}` }));
          const currentVoice = friend && !FRIEND_VOICES.some((f) => f.voice === p.voice) ? FRIEND_VOICES[0].voice : p.voice;
          const mine = options.find((o) => o.voice === currentVoice) ?? { voice: currentVoice, label: currentVoice };
          const say = (o: { voice: string; label: string }) => `${trying === o.voice && p.voice === o.voice ? '🔊 ' : ''}${o.label}`;
          return (
            <View key={role} style={{ marginBottom: 12 }}>
              <Text style={styles.voiceFor}>{p.name}</Text>
              {!recast ? (
                // the cast is set: only the chosen voice shows (tap to hear it; a kept sample costs nothing)
                <View style={styles.chips}>
                  <Chip label={say(mine)} active onPress={() => chooseVoice(role, p, mine.voice)} />
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceRow}>
                  {options.map((o) => (
                    <Chip key={o.voice} label={say(o)} active={currentVoice === o.voice} onPress={() => chooseVoice(role, p, o.voice)} />
                  ))}
                </ScrollView>
              )}
            </View>
          );
        })}
        {/* changing voices is tucked away on purpose: every new sample uses the daily voice quota */}
        <Pressable onPress={() => setRecast((x) => !x)} hitSlop={8} style={styles.recast}>
          <Text style={styles.recastText}>{recast ? 'Done' : 'Change voices'}</Text>
        </Pressable>

        <Text style={styles.label}>Anything else? (optional)</Text>
        <View style={[styles.chips, { marginBottom: 10 }]}>
          {station.wishes.map((w) => (
            <Chip key={w} label={w} active={wish === w} onPress={() => setWish(wish === w ? '' : w)} />
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={wish}
          onChangeText={setWish}
          placeholder="No sad songs, something Turkish…"
          placeholderTextColor={colors.muted}
          onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250)}
          {...inputColors}
        />
        <StatusLine status={status} />
      </ScrollView>

      {/* always in reach: floats at the bottom */}
      {!keyboard && (
        <View style={[styles.go, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
          <PillButton label={busy ? 'A show is already on: open it' : 'Go on air'} onPress={busy ? () => router.replace('/onair') : goOnAir} full />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  barTitle: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  content: { padding: 20 },
  hero: { aspectRatio: 1.5, borderRadius: radius.lg },
  tagline: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.text, marginTop: 18 },
  hosts: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted, marginTop: 6 },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 26, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voiceFor: { fontFamily: fonts.sans, fontSize: 13, color: colors.text, marginBottom: 8 },
  voiceRow: { gap: 8, paddingRight: 24 },
  recast: { alignSelf: 'flex-start', marginBottom: 18 },
  recastText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
    color: colors.text,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  go: { position: 'absolute', left: 20, right: 20, elevation: 12 },
});
