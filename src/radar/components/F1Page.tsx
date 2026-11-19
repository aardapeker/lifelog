import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Glass } from '../../components/Glass';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { countdown, f1Page, raceOf, type Row } from '../local/f1Info';
import { istanbul, startOf, where } from '../local/sources/f1';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';

/*
 * A Formula 1 card's page: the next race with a live countdown (Istanbul time), the full result
 * of the race (gaps, retirements, the fastest lap in purple) and the drivers' championship.
 */

const PODIUM = ['#F5C211', '#D9D8D8', '#D9935B'];

export function F1Page({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const which = raceOf(item.url);
  const page = useLoad(() => f1Page(which.season, which.round), [item.url]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // the countdown ticks
    return () => clearInterval(t);
  }, []);
  const p = page.data;
  const next = p?.next ? (
    <Glass radius={radius.lg} style={styles.card}>
      <Text style={styles.label}>Next race</Text>
      <Text style={styles.title}>{p.next.raceName}</Text>
      <Text style={styles.big}>{countdown(startOf(p.next), now)}</Text>
      <Text style={styles.meta}>
        {istanbul(startOf(p.next))} (Istanbul time){p.next.time ? '' : ', time not set yet'}
      </Text>
      {!!where(p.next) && <Text style={styles.meta}>{where(p.next)}</Text>}
    </Glass>
  ) : null;

  return (
    <View style={styles.page}>
      {which.kind === 'next' && next}
      {!p ? (
        <Text style={ui.muted}>{page.error ? `Couldn't load it: ${page.error.message}` : 'Loading…'}</Text>
      ) : (
        <>
          {p.race && p.rows.length > 0 && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.label}>
                Round {p.race.round} · {p.race.date}
              </Text>
              <Text style={styles.title}>🏁 {p.race.raceName}</Text>
              {!!where(p.race) && <Text style={styles.meta}>{where(p.race)}</Text>}
              <View style={{ marginTop: 6 }}>
                {p.rows.map((r) => (
                  <ResultRow key={r.pos + r.driver} r={r} />
                ))}
              </View>
              <Text style={styles.small}>🟣 fastest lap</Text>
            </Glass>
          )}
          <View style={styles.actions}>
            <Pill label="Wikipedia" icon="open-outline" variant="solid" onPress={() => WebBrowser.openBrowserAsync(item.url.split('#')[0], { toolbarColor: colors.ink, createTask: false })} />
            <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
          </View>
          {which.kind !== 'next' && next}
          {p.standings.length > 0 && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.title}>Drivers' championship</Text>
              {p.standings.map((s) => (
                <View key={s.pos + s.driver} style={styles.row}>
                  <Text style={[styles.pos, Number(s.pos) <= 3 && { color: PODIUM[Number(s.pos) - 1] }]}>{s.pos}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driver}>{s.driver}</Text>
                    <Text style={styles.small}>
                      {s.team}
                      {s.wins !== '0' ? ` · ${s.wins} win${s.wins === '1' ? '' : 's'}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.points}>{s.points}</Text>
                </View>
              ))}
            </Glass>
          )}
          <Text style={styles.small}>Data: Jolpica F1 (the Ergast API's successor).</Text>
        </>
      )}
    </View>
  );
}

function ResultRow({ r }: { r: Row }) {
  const n = Number(r.pos);
  return (
    <View style={styles.row}>
      <Text style={[styles.pos, n <= 3 && { color: PODIUM[n - 1] }]}>{r.pos}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.driver}>
          {r.driver}
          {r.fastest ? ' 🟣' : ''}
        </Text>
        <Text style={styles.small}>{r.team}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.gap}>{r.gap}</Text>
        {r.points !== '0' && <Text style={styles.small}>+{r.points} pts</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  card: { padding: 16, gap: 6 },
  label: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 19 },
  big: { color: '#FF4E4E', fontFamily: fonts.sansBold, fontSize: 30 },
  meta: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5 },
  pos: { width: 24, color: colors.muted, fontFamily: fonts.sansBold, fontSize: 15, textAlign: 'right' },
  driver: { color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 15 },
  gap: { color: colors.soft, fontFamily: mono, fontSize: 12 },
  points: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 15 },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
});
