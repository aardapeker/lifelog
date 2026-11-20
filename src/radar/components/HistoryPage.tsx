import * as WebBrowser from 'expo-web-browser';
import { RemoteImage } from './RemoteImage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../../components/Glass';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { momentsOf, type Moment } from '../local/sources/onThisDay';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';

/*
 * An "On this day" card's page: the moment you tapped, big, then the whole day as a timeline
 * (newest year first) with each event's picture. Tapping one opens its Wikipedia article.
 */

const browse = (url: string) => WebBrowser.openBrowserAsync(url, { toolbarColor: colors.ink, createTask: false });

/** "11-20" → "20 November" */
const dayName = (md: string) => new Date(`2000-${md}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export function HistoryPage({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const md = item.url.match(/#onthisday-(\d\d-\d\d)$/)?.[1] ?? null;
  const day = useLoad(() => (md ? momentsOf(md) : Promise.resolve([] as Moment[])), [md]);
  const year = Number(item.title.match(/^(\d+):/)?.[1]);
  const article = item.url.split('#')[0];
  const years = (y: number) => new Date().getFullYear() - y;
  return (
    <View style={styles.page}>
      {item.thumbnailUrl && <RemoteImage uri={item.thumbnailUrl} style={styles.hero} resizeMode="cover" />}
      <Glass radius={radius.lg} style={styles.card}>
        <Text style={styles.kicker}>
          ON THIS DAY{md ? ` · ${dayName(md).toUpperCase()}` : ''}
        </Text>
        {!!year && (
          <Text style={styles.year}>
            {year} <Text style={styles.ago}>· {years(year)} years ago</Text>
          </Text>
        )}
        <Text style={styles.text}>{item.title.replace(/^\d+:\s*/, '')}</Text>
        {item.snippet && <Text style={ui.body}>{item.snippet}</Text>}
      </Glass>
      <View style={styles.actions}>
        <Pill label="Wikipedia" icon="open-outline" variant="solid" onPress={() => browse(article)} />
        <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
      </View>

      {(day.data?.length ?? 0) > 1 && (
        <Glass radius={radius.lg} style={styles.card}>
          <Text style={styles.section}>The whole day</Text>
          {day.data!.map((m, i) => (
            <Pressable key={`${m.year}${i}`} style={styles.row} onPress={() => m.url && browse(m.url)} disabled={!m.url}>
              {/* the timeline: a dot per year on a thin line */}
              <View style={styles.rail}>
                <View style={[styles.dot, m.year === year && styles.dotOn]} />
                {i < day.data!.length - 1 && <View style={styles.line} />}
              </View>
              <View style={{ flex: 1, gap: 2, paddingBottom: 16 }}>
                <Text style={[styles.rowYear, m.year === year && { color: colors.paper }]}>{m.year}</Text>
                <Text style={styles.rowText}>{m.text}</Text>
              </View>
              {m.image && <RemoteImage uri={m.image} style={styles.thumb} />}
            </Pressable>
          ))}
        </Glass>
      )}
      <Text style={styles.credit}>From Wikipedia's "On this day" (CC BY-SA).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  hero: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.lg, backgroundColor: colors.line },
  card: { padding: 16, gap: 8 },
  kicker: { color: colors.muted, fontFamily: mono, fontSize: 11, letterSpacing: 1.2 },
  year: { color: '#E8C07A', fontFamily: fonts.sansBold, fontSize: 34 },
  ago: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 15 },
  text: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 19, lineHeight: 25 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12 },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#E8C07A', boxShadow: '0 0 10px 2px rgba(232,192,122,0.6)' },
  line: { flex: 1, width: 2, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  rowYear: { color: colors.muted, fontFamily: mono, fontSize: 13 },
  rowText: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20 },
  thumb: { width: 56, height: 56, borderRadius: 10, marginTop: 4 },
  credit: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 11 },
});
