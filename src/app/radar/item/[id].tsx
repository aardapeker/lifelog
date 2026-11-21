import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiSummary } from '../../../radar/components/AiSummary';
import { CardMeta } from '../../../radar/components/CardMeta';
import { VideoPlayer } from '../../../radar/components/VideoPlayer';
import { Header, HeaderIcon } from '../../../radar/components/Header';
import { Pill } from '../../../radar/components/Pill';
import { PostBody } from '../../../radar/components/PostBody';
import { ReaderView } from '../../../radar/components/ReaderView';
import { StoryCoverage } from '../../../radar/components/StoryCoverage';
import { AlbumPage } from '../../../radar/components/AlbumPage';
import { F1Page } from '../../../radar/components/F1Page';
import { GamePage } from '../../../radar/components/GamePage';
import { HistoryPage } from '../../../radar/components/HistoryPage';
import { MoviePage } from '../../../radar/components/MoviePage';
import { QuakePage } from '../../../radar/components/QuakePage';
import { TvPage } from '../../../radar/components/TvPage';
import { parseGeo } from '../../../radar/local/quakeInfo';
import { parseTmdbUrl } from '../../../radar/local/tmdbDetails';
import { isUsefulSnippet } from '../../../radar/format';
import { useLoad } from '../../../radar/hooks';
import { colors, ui, fonts } from '../../../radar/theme';
import type { FeedItem } from '../../../radar/types';
import { Page, usePageBottom } from '../../../components/Page';
import { useRadar } from '../../../radar/useRadar';
import { showAlert } from '../../../lib/dialog';

/** One item: TL;DR, read it here, save it, every outlet covering the story. Port of the radar app's item screen. */

const OPEN_LABEL: Partial<Record<FeedItem['type'], string>> = {
  VIDEO: 'Open on YouTube',
  SHORT: 'Open on YouTube',
  RELEASE: 'Open on GitHub',
  DISCUSSION: 'Open the discussion',
  POST: 'Open on Mastodon',
  PAPER: 'Open on arXiv',
  MOVIE: 'Open on TMDB',
  MUSIC: 'Find on Spotify',
  SPORT: 'Open on Wikipedia',
  TV: 'Open on TVmaze',
  GAME: 'Open in Steam',
};

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRadar();
  const item = useLoad(() => r.item(id), [r, id]);
  const read = item.data?.read;
  // opening an item marks it read, so its card is dimmed in the feed
  useEffect(() => {
    if (read === false) r.markRead(id).catch(() => {});
  }, [id, read, r]);

  if (!item.data) {
    return (
      <Page>
        <Header title="Radar" />
        <Text style={[ui.muted, { padding: 24 }]}>{item.isError ? `Couldn't load it: ${item.error?.message}` : item.isPending ? 'Loading…' : 'This one is gone.'}</Text>
      </Page>
    );
  }
  return <Detail item={item.data} onChange={item.setData} />;
}

function Detail({ item, onChange }: { item: FeedItem; onChange: (i: FeedItem) => void }) {
  const r = useRadar();
  const insets = useSafeAreaInsets();
  const pageBottom = usePageBottom(); // room for the docked mini player
  const isVideo = item.type === 'VIDEO' || item.type === 'SHORT';
  const movie = item.type === 'MOVIE' ? parseTmdbUrl(item.url) : null;
  // videos open in the YouTube app and music in Spotify (their links are app links); the rest in an in-app
  // browser tab inside Lifelog's own task (createTask: false), or it stayed behind as a second "Lifelog" card
  // in recent apps even after ✕
  const inApp = isVideo || item.type === 'MUSIC';
  const open = (url = item.url) => (inApp && url === item.url ? Linking.openURL(url) : WebBrowser.openBrowserAsync(url, { toolbarColor: colors.ink, createTask: false }));
  const second =
    item.mediaUrl && item.type === 'DISCUSSION'
      ? { url: item.mediaUrl, label: 'Linked article' }
      : item.mediaUrl && item.type === 'MUSIC'
        ? { url: item.mediaUrl, label: 'Deezer' }
        : null;
  const save = () => {
    r.setSaved(item.id, !item.saved).catch(() => {});
    onChange({ ...item, saved: !item.saved });
  };
  // films, quakes, releases and races get their own page; everything else the news layout below
  const saving = { saved: item.saved, toggle: save };
  const special = movie ? (
    <MoviePage kind={movie.kind} id={movie.id} save={saving} />
  ) : item.type === 'QUAKE' && parseGeo(item.mediaUrl) ? ( // older quake cards have no location: news layout
    <QuakePage item={item} save={saving} />
  ) : item.type === 'MUSIC' && item.mediaUrl ? (
    <AlbumPage item={item} save={saving} />
  ) : item.type === 'SPORT' ? (
    <F1Page item={item} save={saving} />
  ) : item.type === 'HISTORY' ? (
    <HistoryPage item={item} save={saving} />
  ) : item.type === 'TV' && item.mediaUrl ? (
    <TvPage item={item} save={saving} />
  ) : item.type === 'GAME' ? (
    <GamePage item={item} save={saving} />
  ) : null;
  const hide = () =>
    item.domain &&
    showAlert(`Never show ${item.domain}?`, 'Its articles leave your feed and the morning digest. Undo it in Radar settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hide it', style: 'destructive', onPress: () => r.setHidden(item.domain!, true).catch(() => {}) },
    ]);

  return (
    <Page>
      <Header
        title={item.topicName}
        right={
          (item.type === 'ARTICLE' || item.type === 'DISCUSSION') && item.domain ? <HeaderIcon icon="eye-off-outline" label={`Never show ${item.domain}`} onPress={hide} /> : null
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 + pageBottom }]}>
        {special ?? (
          <>
            {/* plays right here; "Open on YouTube" below still goes to the app */}
            {isVideo && <VideoPlayer item={item} />}
            {(item.type === 'ARTICLE' || item.type === 'DISCUSSION') && item.thumbnailUrl && (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.hero} resizeMode="cover" />
            )}
            {item.type === 'MOVIE' && item.thumbnailUrl && <Image source={{ uri: item.thumbnailUrl }} style={styles.poster} resizeMode="cover" />}
            {item.type === 'MUSIC' && item.thumbnailUrl && <Image source={{ uri: item.thumbnailUrl }} style={styles.cover} resizeMode="cover" />}
            {item.type === 'POST' ? (
              <PostBody item={item} large />
            ) : (
              <>
                <CardMeta item={item} showKind={false} />
                <Text style={styles.title}>{item.title}</Text>
                {item.author && <Text style={ui.muted}>{item.author}{item.type === 'MOVIE' && item.score != null ? ` · ★ ${item.score}` : ''}</Text>}
                {isUsefulSnippet(item.snippet, item.title) && <Text style={ui.body}>{item.snippet}</Text>}
                <AiSummary item={item} />
              </>
            )}
            <View style={styles.actions}>
              <Pill label={item.type === 'QUAKE' ? `Open on ${item.sourceName ?? 'AFAD'}` : (OPEN_LABEL[item.type] ?? 'Open original')} icon="open-outline" variant="solid" onPress={() => open()} />
              <Pill label={item.saved ? 'Saved' : 'Save'} icon={item.saved ? 'bookmark' : 'bookmark-outline'} variant={item.saved ? 'on' : 'plain'} onPress={save} />
              {second && <Pill label={second.label} icon="document-text-outline" onPress={() => open(second.url)} />}
            </View>
            <ReaderView item={item} />
            <StoryCoverage item={item} />
          </>
        )}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  media: { borderRadius: 16, overflow: 'hidden' },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16 },
  poster: { width: '55%', aspectRatio: 2 / 3, borderRadius: 14, alignSelf: 'center' },
  cover: { width: '70%', aspectRatio: 1, borderRadius: 14, alignSelf: 'center' },
  title: { color: colors.paper, fontSize: 26, fontFamily: fonts.sansBold, lineHeight: 32 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
