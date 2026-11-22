import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreview } from '../radar/components/Preview';
import { RemoteImage } from '../radar/components/RemoteImage';
import { searchDeezer, trackTime, type DzTrack } from '../lib/deezer';
import { addBedPick, BED_IDEAS, bedPickUri, bedPicks, ensureDefaultBeds, loadStationSoundsSetting, removeBedPick, setStationSoundsOn, type BedPick } from '../lib/stationSounds';
import type { Station } from '../lib/stations';
import { colors, fonts, inputColors, radius } from '../lib/theme';
import Ionicons from './Icon';
import { Chip, IconButton, PillButton, StatusLine, type Status } from './ui';

/**
 * The station page's "Music under the hosts": real instrumental tracks you pick from Deezer (a show uses
 * one of them), and on/off for shows.
 */
export function StationSounds({ station }: { station: Station }) {
  const db = useSQLiteContext();
  const [picks, setPicks] = useState<BedPick[]>([]);
  const [on, setOn] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [picking, setPicking] = useState(false);
  const pv = usePreview(`beds-${station.key}`);

  const reload = useCallback(() => {
    bedPicks(db, station.key).then(setPicks).catch(() => {});
  }, [db, station.key]);
  useEffect(() => {
    reload();
    loadStationSoundsSetting(db).then(setOn).catch(() => {});
    ensureDefaultBeds(db, station.key).then(reload).catch(() => {}); // the first time: 3 to start with
  }, [db, reload, station.key]);

  return (
    <View>
      <Text style={styles.label}>Music under the hosts</Text>
      <Text style={styles.hint}>Quiet instrumental music while the hosts talk. Only in the pauses between songs, never over Spotify.</Text>
      {picks.length > 0 && (
        <View style={styles.chips}>
          <Chip
            label={on ? 'On in shows' : 'Off in shows'}
            active={on}
            onPress={() => {
              setOn(!on);
              setStationSoundsOn(db, !on).catch(() => {});
            }}
          />
        </View>
      )}
      {picks.length ? (
        <View style={{ gap: 4, marginTop: 6 }}>
          {picks.map((p) => {
            const playing = pv.is(String(p.id));
            return (
              <View key={p.id} style={styles.row}>
                <Pressable
                  onPress={() => pv.toggle(String(p.id), bedPickUri(station.key, p.id))}
                  style={styles.rowMain}
                  accessibilityLabel={`${playing ? 'Stop' : 'Hear'} ${p.title}`}
                >
                  {p.cover ? <RemoteImage uri={p.cover} style={styles.cover} /> : <View style={styles.cover} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, playing && { color: '#5BE0A0' }]} numberOfLines={1}>
                      {playing ? '■ ' : '▶ '}
                      {p.title}
                    </Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {p.artist}
                    </Text>
                  </View>
                </Pressable>
                <IconButton icon="close" label={`Remove ${p.title}`} onPress={() => removeBedPick(db, station.key, p.id).then(reload)} />
              </View>
            );
          })}
          <Text style={styles.hint}>Each talk gets the next one of these, in a new shuffled order every show.</Text>
        </View>
      ) : (
        <Text style={styles.hint}>None yet. Pick instrumental tracks from Deezer:</Text>
      )}
      <PillButton label="＋ Pick from Deezer" ghost onPress={() => setPicking(true)} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
      <StatusLine status={status} />

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)} statusBarTranslucent>
        <BedPicker
          station={station}
          picked={new Set(picks.map((p) => p.id))}
          onAdded={(warning) => {
            reload();
            if (warning) setStatus({ kind: 'err', msg: warning });
          }}
          onClose={() => setPicking(false)}
        />
      </Modal>
    </View>
  );
}

/** Search Deezer (with ideas for the station's style), hear the previews, add the ones you like. */
function BedPicker({ station, picked, onAdded, onClose }: { station: Station; picked: Set<number>; onAdded: (warning: string | null) => void; onClose: () => void }) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const ideas = BED_IDEAS[station.key] ?? ['instrumental'];
  const [q, setQ] = useState(ideas[0]);
  const [results, setResults] = useState<DzTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(picked);
  const [err, setErr] = useState<string | null>(null);
  const pv = usePreview(`bedpick-${station.key}`);

  const search = useCallback(async (text: string) => {
    setQ(text);
    setBusy(true);
    setErr(null);
    try {
      setResults(await searchDeezer(text, 25));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    search(ideas[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (t: DzTrack) => {
    setAdding(t.id);
    setErr(null);
    try {
      const warning = await addBedPick(db, station.key, t);
      setAdded((s) => new Set(s).add(t.id));
      onAdded(warning);
      if (warning) setErr(warning);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  };

  return (
    <View style={[styles.sheet, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
      <View style={styles.sheetHead}>
        <IconButton icon="chevron-down" label="Close" onPress={onClose} />
        <Text style={styles.sheetTitle} numberOfLines={1}>
          Music for {station.name}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => search(q)}
        returnKeyType="search"
        placeholder="instrumental, lofi, taksim…"
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...inputColors}
      />
      {/* wrapped, not a sideways scroll: in the sheet's column that scroll got squashed and hid the words */}
      <View style={styles.ideas}>
        {ideas.map((i) => (
          <Chip key={i} label={i} active={q === i} onPress={() => search(i)} />
        ))}
      </View>
      <Text style={styles.hint}>Pick tracks without singing: the hosts talk over them. Tap one to hear 30 seconds.</Text>
      {err && <Text style={styles.err}>{err}</Text>}
      {busy && <ActivityIndicator color={colors.text} style={{ marginTop: 16 }} />}
      <ScrollView contentContainerStyle={{ gap: 4, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {results?.map((t) => {
          const playing = pv.is(String(t.id));
          const has = added.has(t.id);
          return (
            <View key={t.id} style={styles.row}>
              <Pressable onPress={() => pv.toggle(String(t.id), t.preview)} style={styles.rowMain} accessibilityLabel={`${playing ? 'Stop' : 'Hear'} ${t.title}`}>
                {t.album?.cover ? <RemoteImage uri={t.album.cover} style={styles.cover} /> : <View style={styles.cover} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, playing && { color: '#5BE0A0' }]} numberOfLines={1}>
                    {playing ? '■ ' : '▶ '}
                    {t.title}
                  </Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {t.artist} · {trackTime(t.seconds)}
                  </Text>
                </View>
              </Pressable>
              {adding === t.id ? (
                <ActivityIndicator color={colors.text} style={{ width: 44 }} />
              ) : (
                <Pressable onPress={() => !has && add(t)} hitSlop={8} style={styles.add} accessibilityLabel={has ? `${t.title} is added` : `Add ${t.title}`}>
                  <Ionicons name={has ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={has ? '#5BE0A0' : colors.text} />
                </Pressable>
              )}
            </View>
          );
        })}
        {results && !results.length && !busy && <Text style={styles.hint}>Nothing found. Try other words.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 26, marginBottom: 6 },
  sub: { fontFamily: fonts.sans, fontSize: 13, color: colors.text },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 6 },
  err: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.danger, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  cover: { width: 44, height: 44, borderRadius: 6, backgroundColor: colors.raised },
  title: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  add: { width: 44, alignItems: 'center' },
  sheet: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  input: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.raised, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
});
