import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/*
 * Frosted glass. On Android a blur needs to know what's behind it, so screens that have
 * glass on top wrap their content in <GlassArea>; any <Glass> inside blurs that area.
 * Android 12+ gets the real blur; older phones get the same look without the blur.
 */

type Target = RefObject<ComponentRef<typeof View> | null>;
const Area = createContext<Target | null>(null);

/** Everything inside can show through a <Glass> panel. */
export function GlassArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  return (
    <Area.Provider value={ref}>
      <BlurTargetView ref={ref} style={[{ flex: 1 }, style]}>
        {children}
      </BlurTargetView>
    </Area.Provider>
  );
}

export const glass = {
  fill: 'rgba(45, 44, 44, 0.55)', // the tint over the blur
  solid: 'rgba(51, 50, 50, 0.92)', // where there's nothing to blur (outside a GlassArea)
  edge: 'rgba(255, 255, 255, 0.14)', // hairline border catching the light
  shine: ['rgba(255, 255, 255, 0.13)', 'rgba(255, 255, 255, 0)'] as const, // light from the top edge
};

/** A frosted panel: blur + dark tint + bright hairline edge + soft top highlight. */
export function Glass({
  children,
  style,
  radius = 28,
  intensity = 60,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
}) {
  const target = useContext(Area);
  return (
    <View style={[styles.shell, { borderRadius: radius }, style]}>
      {target ? (
        <BlurView
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={intensity}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: target ? glass.fill : glass.solid }]} />
      <LinearGradient colors={glass.shine} style={[StyleSheet.absoluteFill, { height: '55%' }]} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: 'hidden' }, // rounds the blur too (borderRadius alone doesn't on Android)
  edge: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: glass.edge },
});
