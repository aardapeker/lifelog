import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../lib/theme';
import { hslToRgb, toHsl, type Hsl } from '../lib/color';
import { haptic } from './motion';
import { PillButton } from './ui';

/*
 * Pick any colour: hue, vividness and brightness sliders, with a live preview of how the app looks
 * in it (the colour at the top, fading into black, like the playlist). Gives back "rgb(r, g, b)".
 */

const RAINBOW = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;

/** A bar you tap or drag along; reports 0..1. */
function Slider({ value, onChange, colors: grad, label }: { value: number; onChange: (v: number) => void; colors: readonly [string, string, ...string[]]; label: string }) {
  const [w, setW] = useState(0);
  const at = (e: GestureResponderEvent) => Math.max(0, Math.min(1, e.nativeEvent.locationX / Math.max(1, w)));
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.bar}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => onChange(at(e))}
        onResponderMove={(e) => onChange(at(e))}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
      >
        <LinearGradient colors={grad} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} pointerEvents="none" />
        <View pointerEvents="none" style={[styles.thumb, { left: value * Math.max(0, w - 28) }]} />
      </View>
    </View>
  );
}

export function ColorPicker({ visible, initial, onPick, onClose }: { visible: boolean; initial?: string; onPick: (rgb: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [hsl, setHsl] = useState<Hsl>({ h: 200, s: 0.6, l: 0.45 });
  useEffect(() => {
    if (visible) setHsl((initial && toHsl(initial)) || { h: 200, s: 0.6, l: 0.45 });
  }, [visible, initial]);
  const color = hslToRgb(hsl);
  const set = (p: Partial<Hsl>) => setHsl((x) => ({ ...x, ...p }));
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          {/* how the app will look: the colour at the top, fading into black */}
          <View style={styles.preview}>
            <LinearGradient colors={[color, '#0B0B0B']} locations={[0, 0.85]} style={StyleSheet.absoluteFill} />
            <Text style={styles.previewText}>Your colour</Text>
          </View>
          <Slider label="Colour" value={hsl.h / 360} onChange={(v) => set({ h: v * 359.9 })} colors={RAINBOW} />
          <Slider
            label="Vividness"
            value={hsl.s}
            onChange={(v) => set({ s: v })}
            colors={[hslToRgb({ ...hsl, s: 0 }), hslToRgb({ ...hsl, s: 1 })]}
          />
          <Slider
            label="Brightness"
            value={(hsl.l - 0.15) / 0.6}
            onChange={(v) => set({ l: 0.15 + v * 0.6 })} // 15–75%: black or white wouldn't show as a wash
            colors={[hslToRgb({ ...hsl, l: 0.15 }), hslToRgb({ ...hsl, l: 0.45 }), hslToRgb({ ...hsl, l: 0.75 })]}
          />
          <View style={styles.buttons}>
            <View style={{ flex: 1 }}>
              <PillButton label="Cancel" onPress={onClose} ghost full />
            </View>
            <View style={{ flex: 1 }}>
              <PillButton
                label="Use it"
                onPress={() => {
                  haptic.success();
                  onPick(color);
                }}
                full
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 20, gap: 18 },
  preview: { height: 120, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end', padding: 14 },
  previewText: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted },
  bar: { height: 28, borderRadius: 14, justifyContent: 'center' },
  thumb: { position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.15)', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
