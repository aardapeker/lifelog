import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../../components/Glass';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { istanbul } from '../local/sources/f1';
import { airsAt, channelOf, epCode, episodeIdOf, showIdOf, showPage, type Episode } from '../local/sources/tvmaze';
import { shortDate, toPlainText } from '../local/text';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';
import { RemoteImage } from './RemoteImage';

/*
 * A series page (from a TV card): poster and facts, the episode the card was about, a countdown to
 * the next one, the seasons with every episode (tap one for its summary) and the cast. From TVmaze.
 */

const browse = (url: string) => WebBrowser.openBrowserAsync(url, { toolbarColor: colors.ink, createTask: false });

/** "in 3 days", "in 5 hours", "tonight" */
function until(t: number): string {
  const h = Math.round((t - Date.now()) / 3600_000);
  if (h < 1) return 'within the hour';
  if (h < 24) return `in ${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

export function TvPage({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const id = showIdOf(item.mediaUrl);
  const page = useLoad(() => (id ? showPage(id) : Promise.reject(new Error('No TVmaze link on this one.'))), [id]);
  const s = page.data;
  const focusId = episodeIdOf(item.url);
  const episodes = s?._embedded?.episodes ?? [];
  const focus = episodes.find((e) => e.id === focusId) ?? null;
  const seasons = [...new Set(episodes.map((e) => e.season))];
  const [season, setSeason] = useState<number | null>(null);
  const shown = season ?? focus?.season ?? seasons[seasons.length - 1] ?? 1;
  const next = s?._embedded?.nextepisode;
  const cast = s?._embedded?.cast ?? [];

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <RemoteImage uri={s?.image?.original ?? s?.image?.medium ?? item.thumbnailUrl} style={styles.poster} resizeMode="cover" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>{s?.name ?? item.title}</Text>
          {s && (
            <>
              <Text style={styles.meta}>
                {[channelOf(s), s.premiered?.slice(0, 4) && `${s.premiered.slice(0, 4)}${s.ended ? `–${s.ended.slice(0, 4)}` : ''}`, s.status].filter(Boolean).join(' · ')}
              </Text>
              {!!s.rating?.average && <Text style={styles.rating}>★ {s.rating.average}</Text>}
              {!!s.genres?.length && <Text style={styles.genres}>{s.genres.join(' · ')}</Text>}
            </>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <Pill label="Open on TVmaze" icon="open-outline" variant="solid" onPress={() => browse(s?.url ?? item.url.replace(/#next$/, ''))} />
        <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
      </View>

      {next && airsAt(next) > Date.now() && (
        <Glass radius={radius.lg} style={styles.card} fill="rgba(143, 211, 255, 0.10)">
          <Text style={styles.kicker}>NEXT EPISODE · {until(airsAt(next)).toUpperCase()}</Text>
          <Text style={styles.epTitle}>
            {epCode(next)}
            {next.name && !/^episode \d+$/i.test(next.name) ? `: ${next.name}` : ''}
          </Text>
          <Text style={styles.meta}>{istanbul(airsAt(next))} (Istanbul)</Text>
        </Glass>
      )}

      {focus && (
        <Glass radius={radius.lg} style={styles.card}>
          {focus.image && <RemoteImage uri={focus.image.original ?? focus.image.medium} style={styles.still} resizeMode="cover" />}
          <Text style={styles.kicker}>
            {epCode(focus).toUpperCase()} · {shortDate(airsAt(focus))?.toUpperCase()}
          </Text>
          <Text style={styles.epTitle}>{focus.name}</Text>
          {focus.summary && <Text style={ui.body}>{toPlainText(focus.summary)}</Text>}
        </Glass>
      )}

      {!s ? (
        <Text style={ui.muted}>{page.error ? `Couldn't load the show: ${page.error.message}` : 'Loading the show…'}</Text>
      ) : (
        <>
          {s.summary && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.section}>About</Text>
              <Text style={ui.body}>{toPlainText(s.summary)}</Text>
            </Glass>
          )}

          {seasons.length > 0 && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.section}>Episodes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {seasons.map((n) => (
                  <Pill key={n} label={`Season ${n}`} variant={n === shown ? 'on' : 'plain'} onPress={() => setSeason(n)} />
                ))}
              </ScrollView>
              {episodes
                .filter((e) => e.season === shown)
                .map((e) => (
                  <EpisodeRow key={e.id} e={e} on={e.id === focusId} />
                ))}
            </Glass>
          )}

          {cast.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={styles.section}>Cast</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                {cast.slice(0, 15).map((c) => (
                  <View key={`${c.person.id}-${c.character.name}`} style={styles.person}>
                    {c.person.image ? <RemoteImage uri={c.person.image.medium ?? c.person.image.original} style={styles.face} /> : <View style={[styles.face, styles.noFace]} />}
                    <Text style={styles.name} numberOfLines={2}>
                      {c.person.name}
                    </Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {c.character.name}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          <Text style={styles.small}>Data: TVmaze (CC BY-SA).</Text>
        </>
      )}
    </View>
  );
}

/** One episode: number, title, date; tap for its summary. Not aired yet = dimmed. */
function EpisodeRow({ e, on }: { e: Episode; on: boolean }) {
  const [open, setOpen] = useState(on);
  const at = airsAt(e);
  const future = at > Date.now();
  const summary = toPlainText(e.summary ?? null);
  return (
    <Pressable onPress={() => setOpen(!open)} disabled={!summary} style={[styles.ep, future && { opacity: 0.5 }]}>
      <View style={styles.epHead}>
        <Text style={[styles.num, on && { color: colors.paper }]}>{e.number ?? '·'}</Text>
        <Text style={[styles.epName, on && { fontFamily: fonts.sansBold }]} numberOfLines={open ? undefined : 1}>
          {e.name}
        </Text>
        <Text style={styles.small}>{future ? istanbul(at) : shortDate(at)}</Text>
      </View>
      {open && summary && <Text style={styles.epSummary}>{summary}</Text>}
    </Pressable>
  );
}

const FACE = 72;

const styles = StyleSheet.create({
  page: { gap: 16 },
  top: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  poster: { width: 130, aspectRatio: 2 / 3, borderRadius: radius.md, backgroundColor: colors.line },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 29 },
  meta: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  rating: { color: '#FFD86B', fontFamily: fonts.sansBold, fontSize: 15 },
  genres: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { padding: 16, gap: 8 },
  kicker: { color: colors.muted, fontFamily: mono, fontSize: 11, letterSpacing: 1.2 },
  epTitle: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 18, lineHeight: 23 },
  still: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, marginBottom: 4 },
  section: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 16 },
  ep: { paddingVertical: 8, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  epHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: { width: 24, color: colors.muted, fontFamily: mono, fontSize: 13, textAlign: 'right' },
  epName: { flex: 1, color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 15 },
  epSummary: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, marginLeft: 34 },
  person: { width: FACE + 10, alignItems: 'center', gap: 4 },
  face: { width: FACE, height: FACE, borderRadius: FACE / 2 },
  noFace: { backgroundColor: 'rgba(255,255,255,0.1)' },
  name: { color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 12, textAlign: 'center' },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
});
