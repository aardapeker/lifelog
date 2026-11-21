import { useEffect, useState } from 'react';
import { Image, View, type ImageProps, type ImageSourcePropType, type StyleProp, type ImageStyle } from 'react-native';
import Ionicons from '../../components/Icon';
import { findAlbum } from '../../lib/deezer';

/*
 * Pictures from the free, public data sources need two things the plain <Image> didn't give them:
 * - Wikimedia (Wikipedia's pictures) refuses apps that don't say who they are, and Android's
 *   default "okhttp" User-Agent got the On this day pictures refused.
 * - A card without a cover (older MusicBrainz cards, or a broken link) asks Deezer for the release's cover.
 */

const AGENT = 'LifelogRadar/1.0 (https://github.com/aardapeker/lifelog)';
const NAMED = /(^|\.)(wikimedia\.org|wikipedia\.org|coverartarchive\.org|archive\.org)$/;

/** An image source that names the app where the host asks for it. */
export function withAgent(uri: string | null | undefined): ImageSourcePropType | undefined {
  if (!uri) return undefined;
  let host = '';
  try {
    host = new URL(uri).hostname;
  } catch {
    return { uri };
  }
  return NAMED.test(host) ? { uri, headers: { 'User-Agent': AGENT } } : { uri };
}

/** <Image> that names the app to Wikimedia. */
export function RemoteImage({ uri, ...rest }: Omit<ImageProps, 'source'> & { uri: string | null | undefined }) {
  return <Image source={withAgent(uri)} {...rest} />;
}

const covers = new Map<string, Promise<string | null>>();

/** The release's cover from Deezer, by artist and title (cached). */
function deezerCover(artist: string, title: string): Promise<string | null> {
  const k = `${artist}|${title}`.toLowerCase();
  if (!covers.has(k))
    covers.set(
      k,
      findAlbum(artist, title)
        .then((a) => a?.cover ?? null)
        .catch(() => null),
    );
  return covers.get(k)!;
}

/**
 * A release's cover: the card's own first, Deezer's search if it has none or it breaks, and a disc when neither works.
 * `name` is the card's "Artist – Title".
 */
export function CoverArt({ uri, name, style }: { uri: string | null; name: string; style: StyleProp<ImageStyle> }) {
  const [src, setSrc] = useState<string | null>(uri);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    setSrc(uri);
    setTried(false);
  }, [uri]);
  const fallBack = () => {
    if (tried) return setSrc(null);
    setTried(true);
    const [artist, ...rest] = name.split(' – ');
    deezerCover(artist, rest.join(' – ') || artist).then(setSrc);
  };
  useEffect(() => {
    if (!uri) fallBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);
  if (!src)
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' }]}>
        <Ionicons name="disc-outline" size={36} color="rgba(255,255,255,0.3)" />
      </View>
    );
  return <Image source={withAgent(src)} style={style} resizeMode="cover" onError={fallBack} />;
}
