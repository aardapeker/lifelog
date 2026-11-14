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
  // videos open in the YouTube app; pages in an in-app browser tab
  const open = (url = item.url) => (isVideo && url === item.url ? Linking.openURL(url) : WebBrowser.openBrowserAsync(url, { toolbarColor: colors.ink }));
  const second = item.mediaUrl && item.type === 'DISCUSSION' ? { url: item.mediaUrl, label: 'Linked article' } : null;
  const save = () => {
    r.setSaved(item.id, !item.saved).catch(() => {});
    onChange({ ...item, saved: !item.saved });
  };
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
        {/* plays right here; "Open on YouTube" below still goes to the app */}
        {isVideo && <VideoPlayer item={item} />}
        {(item.type === 'ARTICLE' || item.type === 'DISCUSSION') && item.thumbnailUrl && (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.hero} resizeMode="cover" />
        )}
        {item.type === 'POST' ? (
          <PostBody item={item} large />
        ) : (
          <>
            <CardMeta item={item} showKind={false} />
            <Text style={styles.title}>{item.title}</Text>
            {item.author && <Text style={ui.muted}>{item.author}</Text>}
            {isUsefulSnippet(item.snippet, item.title) && <Text style={ui.body}>{item.snippet}</Text>}
            <AiSummary item={item} />
          </>
        )}
        <View style={styles.actions}>
          <Pill label={OPEN_LABEL[item.type] ?? 'Open original'} icon="open-outline" variant="solid" onPress={() => open()} />
          <Pill label={item.saved ? 'Saved' : 'Save'} icon={item.saved ? 'bookmark' : 'bookmark-outline'} variant={item.saved ? 'on' : 'plain'} onPress={save} />
          {second && <Pill label={second.label} icon="document-text-outline" onPress={() => open(second.url)} />}
        </View>
        <ReaderView item={item} />
        <StoryCoverage item={item} />
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  media: { borderRadius: 16, overflow: 'hidden' },
  hero: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16 },
  title: { color: colors.paper, fontSize: 26, fontFamily: fonts.sansBold, lineHeight: 32 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
