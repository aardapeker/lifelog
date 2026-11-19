import * as WebBrowser from 'expo-web-browser';
import { Share, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Glass } from '../../components/Glass';
import { radius } from '../../lib/theme';
import { timeAgo } from '../format';
import { useLoad } from '../hooks';
import { mapHtml, meaning, parseGeo, type Dot } from '../local/quakeInfo';
import { ISTANBUL, kmBetween, recentQuakes } from '../local/sources/quakes';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';

/*
 * An earthquake's page: a big dark map (the quake pulsing, other quakes of the week around it,
 * a dashed line to Istanbul), then magnitude, place, time, depth, what it means, and the nearby
 * quakes of the last 7 days (aftershocks show up here).
 */

const WEEK = 7 * 86_400_000;
const NEARBY_KM = 100;

/** "14:02" in Istanbul time */
const clock = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(11, 16);

export function QuakePage({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const spot = parseGeo(item.mediaUrl);
  const mag = item.score ?? Number(item.title.match(/M ([\d.]+)/)?.[1] ?? 0);
  const place = item.title.split(' · ').slice(1).join(' · ') || item.title;
  const time = Date.parse(item.publishedAt);
  // the week around it: other quakes within 100 km (fetched when the page opens)
  const nearby = useLoad(async () => {
    if (!spot) return [];
    const list = await recentQuakes(2, Date.now() - WEEK);
    return list
      .filter((q) => kmBetween(q, spot) <= NEARBY_KM && !(Math.abs(q.time - time) < 60_000 && Math.abs(q.mag - mag) < 0.05))
      .sort((a, b) => b.time - a.time);
  }, [item.id]);

  if (!spot) return <Text style={ui.muted}>This quake came without a location, so there's no map.</Text>;
  const km = Math.round(kmBetween(spot, ISTANBUL));
  const dots: Dot[] = (nearby.data ?? []).map((q) => ({ lat: q.lat, lon: q.lon, mag: q.mag, label: `M ${q.mag.toFixed(1)} · ${q.place} · ${timeAgo(new Date(q.time).toISOString())}` }));
  const share = () => Share.share({ message: `M ${mag.toFixed(1)} earthquake · ${place} · ${clock(time)} (Istanbul time) · ${km} km from Istanbul\n${item.url}` });

  return (
    <View style={styles.page}>
      <View style={styles.map}>
        <WebView
          source={{ html: mapHtml({ lat: spot.lat, lon: spot.lon, mag }, dots, { ...ISTANBUL, label: `Istanbul · ${km} km` }) }}
          style={styles.web}
          originWhitelist={['*']}
          javaScriptEnabled
          nestedScrollEnabled
          setSupportMultipleWindows={false}
          // the map's own links (the tile credits) open in a browser tab, not inside the map
          onShouldStartLoadWithRequest={(req) => {
            if (req.url === 'about:blank' || !req.isTopFrame || req.url.startsWith('data:')) return true;
            if (req.navigationType === 'click') {
              WebBrowser.openBrowserAsync(req.url, { toolbarColor: colors.ink, createTask: false });
              return false;
            }
            return true;
          }}
        />
      </View>

      <Glass radius={radius.lg} style={styles.card}>
        <View style={styles.head}>
          <View style={[styles.badge, { backgroundColor: tone(mag) }]}>
            <Text style={styles.badgeText}>{mag.toFixed(1)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.place}>{place}</Text>
            <Text style={styles.meta}>
              {timeAgo(item.publishedAt)} · {clock(time)} · {spot.depth != null ? `${Math.round(spot.depth)} km deep` : 'depth unknown'}
            </Text>
            <Text style={styles.meta}>{km} km from Istanbul</Text>
          </View>
        </View>
        <Text style={ui.body}>{meaning(mag)}</Text>
      </Glass>

      <View style={styles.actions}>
        <Pill label={`Open on ${item.sourceName ?? 'AFAD'}`} icon="open-outline" variant="solid" onPress={() => WebBrowser.openBrowserAsync(item.url, { toolbarColor: colors.ink, createTask: false })} />
        <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
        <Pill label="Share" icon="share-outline" onPress={share} />
      </View>

      <Glass radius={radius.lg} style={styles.card}>
        <Text style={styles.title}>Nearby this week</Text>
        {nearby.isPending ? (
          <Text style={ui.muted}>Looking…</Text>
        ) : nearby.error ? (
          <Text style={ui.muted}>Couldn't load them: {nearby.error.message}</Text>
        ) : !nearby.data?.length ? (
          <Text style={ui.muted}>No other quakes (M2+) within {NEARBY_KM} km in the last 7 days.</Text>
        ) : (
          nearby.data.slice(0, 12).map((q) => (
            <View key={q.id} style={styles.row}>
              <Text style={[styles.mag, { color: tone(q.mag) }]}>{q.mag.toFixed(1)}</Text>
              <Text style={styles.rowText} numberOfLines={1}>
                {q.place}
              </Text>
              <Text style={styles.meta}>
                {Math.round(kmBetween(q, spot))} km · {timeAgo(new Date(q.time).toISOString())}
              </Text>
            </View>
          ))
        )}
      </Glass>
      <Text style={styles.credit}>Data: AFAD (USGS as backup). Map: © OpenStreetMap contributors, © CARTO.</Text>
    </View>
  );
}

/** Calm to alarming: the badge and list colours by magnitude. */
const tone = (m: number) => (m < 3 ? '#9AD8AE' : m < 4 ? '#F5C211' : m < 5 ? '#FFB347' : m < 6 ? '#FF7A45' : '#FF4E4E');

const styles = StyleSheet.create({
  page: { gap: 16 },
  map: { height: 380, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#1b1a1a' },
  web: { flex: 1, backgroundColor: '#1b1a1a' },
  card: { padding: 16, gap: 10 },
  head: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#1b1a1a', fontFamily: fonts.sansBold, fontSize: 24 },
  place: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 18 },
  meta: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mag: { fontFamily: fonts.sansBold, fontSize: 15, width: 34 },
  rowText: { flex: 1, color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 14 },
  credit: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 11 },
});
