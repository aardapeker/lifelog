import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../lib/theme';
import { hearStationSound, loadStationSoundsSetting, makeStationSound, setStationSoundsOn, soundsOf, stopStationSounds } from '../lib/stationSounds';
import type { Station } from '../lib/stations';
import { Chip, PillButton, StatusLine, type Status } from './ui';

/**
 * The station page's "Station sounds": make the station's jingle and music bed with Lyria (once, a few
 * cents), hear them, make new ones, and switch them on or off for the shows.
 */
export function StationSounds({ station }: { station: Station }) {
  const db = useSQLiteContext();
  const [have, setHave] = useState(() => soundsOf(station.key));
  const [on, setOn] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  useEffect(() => {
    setHave(soundsOf(station.key));
    loadStationSoundsSetting(db).then(setOn).catch(() => {});
    return () => stopStationSounds(); // leaving the page stops a sound you were hearing
  }, [db, station.key]);

  const made = have.jingle && have.bed;
  const make = async () => {
    setStatus({ kind: 'busy' });
    try {
      for (const kind of ['jingle', 'bed'] as const) {
        setStatus({ kind: 'ok', msg: kind === 'jingle' ? 'Recording the jingle… (about 30 s)' : 'Recording the music bed… (about 30 s)' });
        await makeStationSound(station, kind);
        setHave(soundsOf(station.key));
      }
      setStatus({ kind: 'ok', msg: 'Done! Tap ▶ to hear them. They play in your next show.' });
    } catch (e) {
      setHave(soundsOf(station.key));
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <View>
      <Text style={styles.label}>Station sounds</Text>
      <Text style={styles.hint}>
        A sung jingle before the first talk (and every third one), and quiet music under the hosts while they talk. Only in the
        pauses between songs, never over Spotify. Made once with your Gemini key (Lyria), a few cents.
      </Text>
      {(have.jingle || have.bed) && (
        <View style={styles.chips}>
          {have.jingle && <Chip label="▶ Jingle" onPress={() => hearStationSound(station.key, 'jingle')} />}
          {have.bed && <Chip label="▶ Music bed" onPress={() => hearStationSound(station.key, 'bed')} />}
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
      <PillButton
        label={made ? 'Make new ones' : 'Make the jingle & music bed'}
        ghost={made}
        disabled={status.kind === 'busy' || (status.kind === 'ok' && status.msg.startsWith('Recording'))}
        onPress={make}
        style={{ alignSelf: 'flex-start', marginTop: 12 }}
      />
      <StatusLine status={status} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 26, marginBottom: 6 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
