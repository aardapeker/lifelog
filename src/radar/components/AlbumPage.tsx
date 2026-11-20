import * as WebBrowser from 'expo-web-browser';
import { CoverArt } from './RemoteImage';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../../components/Glass';
import { radius } from '../../lib/theme';
import { useLoad } from '../hooks';
import { albumDetails, releaseGroupId, type Album } from '../local/albumInfo';
import { shortDate } from '../local/text';
import { colors, fonts, mono, ui } from '../theme';
import type { FeedItem } from '../types';
import { Pill } from './Pill';

/*
 * A new release's page: the big cover, artist, type and date, label and length, the tracklist,
 * and the artist's other releases. Play opens it in Spotify (the item's link is a Spotify search).
 */

const spotify = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;

export function AlbumPage({ item, save }: { item: FeedItem; save: { saved: boolean; toggle: () => void } }) {
  const id = releaseGroupId(item.mediaUrl);
  const page = useLoad(() => (id ? albumDetails(id) : Promise.reject(new Error('No MusicBrainz link on this one.'))), [id]);
  const a = page.data;
  return (
    <View style={styles.page}>
      <CoverArt uri={a?.cover ?? item.thumbnailUrl} name={item.title} style={styles.cover} />
      <Glass radius={radius.lg} style={styles.card}>
        <Text style={styles.title}>{a?.title ?? item.title}</Text>
        {a && <Text style={styles.artist}>{a.artist}</Text>}
        <Text style={styles.meta}>
          {[a?.type ?? item.author, a?.date && shortDate(a.date), a?.label, a?.minutes ? `${a.minutes} min` : null, a?.tracks.length ? `${a.tracks.length} tracks` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Glass>

      <View style={styles.actions}>
        <Pill label="Play on Spotify" icon="play" variant="solid" onPress={() => Linking.openURL(item.url)} />
        <Pill label={save.saved ? 'Saved' : 'Save'} icon={save.saved ? 'bookmark' : 'bookmark-outline'} variant={save.saved ? 'on' : 'plain'} onPress={save.toggle} />
        {a && <Pill label="MusicBrainz" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(a.url, { toolbarColor: colors.ink, createTask: false })} />}
      </View>

      {!a ? (
        <Text style={ui.muted}>{page.error ? `Couldn't load the tracklist: ${page.error.message}` : 'Loading the tracklist…'}</Text>
      ) : (
        <>
          {a.tracks.length > 0 && <Tracklist album={a} />}
          {a.others.length > 0 && (
            <Glass radius={radius.lg} style={styles.card}>
              <Text style={styles.section}>More from {a.artist}</Text>
              {a.others.map((o) => (
                <Text key={o.id} style={styles.other} onPress={() => Linking.openURL(spotify(`${a.artist} ${o.title}`))}>
                  <Text style={styles.year}>{o.year ?? '—'} </Text>
                  {o.title}
                  <Text style={styles.small}> {o.type}</Text>
                </Text>
              ))}
            </Glass>
          )}
          <Text style={styles.small}>Data: MusicBrainz, covers: Cover Art Archive.</Text>
        </>
      )}
    </View>
  );
}

function Tracklist({ album }: { album: Album }) {
  return (
    <Glass radius={radius.lg} style={styles.card}>
      <Text style={styles.section}>Tracklist</Text>
      {album.tracks.map((t) => (
        <View key={t.position} style={styles.track}>
          <Text style={styles.num}>{t.position}</Text>
          <Text style={styles.trackTitle} numberOfLines={1} onPress={() => Linking.openURL(spotify(`${album.artist} ${t.title}`))}>
            {t.title}
          </Text>
          {t.length && <Text style={styles.small}>{t.length}</Text>}
        </View>
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  cover: { width: '82%', aspectRatio: 1, alignSelf: 'center', borderRadius: radius.lg, backgroundColor: colors.line },
  card: { padding: 16, gap: 8 },
  title: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 29 },
  artist: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 17 },
  meta: { color: colors.muted, fontFamily: mono, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 2 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 },
  num: { width: 22, color: colors.muted, fontFamily: mono, fontSize: 13, textAlign: 'right' },
  trackTitle: { flex: 1, color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 15 },
  other: { color: colors.soft, fontFamily: fonts.sansRegular, fontSize: 15, paddingVertical: 3 },
  year: { color: colors.muted, fontFamily: mono, fontSize: 13 },
  small: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 12 },
});
