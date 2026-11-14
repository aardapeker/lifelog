import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { FeedItem } from '../types';
import { VideoThumb } from './FeedCard';

/*
 * A YouTube video playing inside Radar: the thumbnail first, and the real player only once you tap it
 * (the radar repo's rule: "thumbnail first, iframe only on click"), so nothing loads or plays by
 * itself. YouTube's embed refuses to play without a page origin ("Error 153"), so the player sits in
 * a tiny page with one, instead of loading the embed URL directly. Links inside the player (the
 * YouTube logo, "Watch on YouTube") open the YouTube app.
 */

const ORIGIN = 'https://lifelog.app';

/** watch?v=ID, /shorts/ID, youtu.be/ID, /embed/ID → ID */
export function videoId(url: string): string | null {
  return url.match(/(?:[?&]v=|\/shorts\/|youtu\.be\/|\/embed\/)([\w-]{11})/)?.[1] ?? null;
}

const page = (id: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(ORIGIN)}"
allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;

export function VideoPlayer({ item }: { item: FeedItem }) {
  const [playing, setPlaying] = useState(false);
  const id = videoId(item.url);
  const short = item.type === 'SHORT';
  if (!id) return null;
  if (!playing) {
    return (
      <Pressable onPress={() => setPlaying(true)} accessibilityRole="button" accessibilityLabel="Play the video" style={styles.box}>
        <VideoThumb item={item} />
      </Pressable>
    );
  }
  return (
    <View style={[styles.box, short ? styles.short : styles.wide]}>
      <WebView
        source={{ html: page(id), baseUrl: ORIGIN }}
        style={styles.web}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        // only the player itself loads here; anything you tap inside it opens in the YouTube app
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith(ORIGIN) || req.url.includes('youtube-nocookie.com/embed') || req.url === 'about:blank' || !req.isTopFrame) return true;
          Linking.openURL(req.url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  wide: { aspectRatio: 16 / 9 },
  short: { aspectRatio: 9 / 16, maxHeight: 560, alignSelf: 'center', width: '75%' },
  web: { flex: 1, backgroundColor: '#000' },
});
