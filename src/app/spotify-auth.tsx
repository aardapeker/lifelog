import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Spotify's login sends the browser back to dev.arda.lifelog://spotify-auth?code=…
 * The login code is picked up by connectSpotify(); this screen only steps out of the way.
 */
export default function SpotifyAuthReturn() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }, []);
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
