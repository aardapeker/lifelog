import { router, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getSetting } from '../lib/db';
import { unreadCount } from '../lib/notify';
import { photoUri } from '../lib/photos';
import { colors, fonts } from '../lib/theme';
import { PressScale } from './motion';
import { IconButton } from './ui';

export const UNREAD = '#FF5A5F'; // the 🔴 on anything new

/** Your name and photo (Settings → You), refreshed whenever a screen comes into focus. */
export function useProfile(): { name: string; photo: string | null } {
  const db = useSQLiteContext();
  const [p, setP] = useState<{ name: string; photo: string | null }>({ name: '', photo: null });
  useFocusEffect(
    useCallback(() => {
      Promise.all([getSetting(db, 'name'), getSetting(db, 'profile.photo')])
        .then(([name, photo]) => setP({ name, photo: photo ? photoUri(photo) : null }))
        .catch(() => {});
    }, [db]),
  );
  return p;
}

/** Your photo (or your initial). Tapping it opens You: your profile and every setting. */
export function Avatar({ size = 46, onPress }: { size?: number; onPress?: () => void }) {
  const { name, photo } = useProfile();
  return (
    <PressScale onPress={onPress ?? (() => router.push('/you'))} scaleTo={0.9} hitSlop={6} accessibilityLabel="You and settings">
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.raised }} />
      ) : (
        <View style={[styles.letter, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.letterText, { fontSize: size * 0.43 }]}>{(name.trim()[0] ?? '✎').toUpperCase()}</Text>
        </View>
      )}
    </PressScale>
  );
}

/** 🔔 with a red dot while something unread is waiting. Opens the inbox. */
export function Bell() {
  const db = useSQLiteContext();
  const [unread, setUnread] = useState(0);
  const check = useCallback(() => {
    unreadCount(db).then(setUnread).catch(() => {});
  }, [db]);
  useFocusEffect(check);
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(check); // one arriving while you're in the app
    const timer = setInterval(check, 60_000); // scheduled ones becoming due
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [check]);
  return (
    <View>
      <IconButton icon="notifications-outline" label={unread ? `Notifications, ${unread} new` : 'Notifications'} onPress={() => router.push('/inbox')} />
      {unread > 0 && <View style={styles.dot} pointerEvents="none" />}
    </View>
  );
}

/** The bar on top of every tab: your photo on the left, the page's title, its own buttons, and the bell. */
export function TopBar({ kicker, title, right }: { kicker?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.bar}>
      <Avatar />
      <View style={{ flex: 1 }}>
        {!!kicker && <Text style={styles.kicker}>{kicker}</Text>}
        {typeof title === 'string' ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
      </View>
      {right}
      <Bell />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  letter: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: fonts.serif, color: colors.text },
  kicker: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 26, color: colors.text, marginTop: 1 },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: UNREAD,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
