import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../lib/theme';

/** Photos full screen on black: swipe between them, tap (or back) to close. */
export function PhotoViewer({
  uris,
  captions,
  start,
  onClose,
}: {
  uris: string[];
  captions?: (string | null)[];
  start: number | null; // null: closed
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const open = start !== null;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent onShow={() => setPage(start ?? 0)}>
      <View style={styles.back}>
        {open && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (start ?? 0) * width, y: 0 }}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {uris.map((u, i) => (
              <Pressable key={u} onPress={onClose} style={{ width, height }} accessibilityLabel="Close photo">
                <Image source={{ uri: u }} style={{ width, height }} resizeMode="contain" />
                {!!captions?.[i] && (
                  <Text style={[styles.caption, { bottom: insets.bottom + 28 }]}>{captions[i]}</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
        <Pressable onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top + 12 }]} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        {uris.length > 1 && (
          <Text style={[styles.count, { top: insets.top + 18 }]}>
            {page + 1} / {uris.length}
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  close: { position: 'absolute', right: 18, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  count: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.sans, fontSize: 14, color: '#fff' },
  caption: { position: 'absolute', left: 24, right: 24, textAlign: 'center', fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 22, color: colors.muted },
});
