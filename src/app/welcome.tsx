import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton } from '../components/ui';
import { setSetting } from '../lib/db';
import { colors, fonts } from '../lib/theme';

/** First-launch screen. Shown once, then never again. */
export default function WelcomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const start = async () => {
    await setSetting(db, 'welcomed', '1');
    router.back();
  };

  return (
    <LinearGradient
      colors={['#8C9BB8', '#4A5470', '#262838', colors.bg]}
      locations={[0, 0.38, 0.72, 1]}
      style={[styles.screen, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.title}>{'Your Life,\nWritten\nDown'}</Text>
      <Text style={styles.subtitle}>
        Write about your days. A friend who has read every page will talk back.
      </Text>

      <View style={styles.moon} />

      <View style={{ flex: 1 }} />
      <PillButton label="Start writing" onPress={start} full />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24 },
  title: { fontFamily: fonts.serif, fontSize: 62, lineHeight: 66, color: colors.accentText, letterSpacing: -1 },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: '#1D1C1C',
    marginTop: 18,
    maxWidth: 290,
  },
  moon: {
    alignSelf: 'flex-end',
    marginTop: 64,
    marginRight: 20,
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#F2EFE6',
    shadowColor: '#F2EFE6',
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
});
