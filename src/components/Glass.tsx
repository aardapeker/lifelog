import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/*
 * Frosted glass. On Android a blur needs to know what's behind it, so screens that have
 * glass on top wrap their content in <GlassArea>; a <Glass blur> inside blurs that area (one per area).
 * Android 12+ gets the real blur; older phones get the same look without the blur.
 */

type Target = RefObject<ComponentRef<typeof View> | null>;
const Area = createContext<Target | null>(null);


/** Everything inside can show through a <Glass> panel. */
export function GlassArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  return (
    <Area.Provider value={LIVE_BLUR ? ref : null}>
      {LIVE_BLUR ? (
        <BlurTargetView ref={ref} style={[{ flex: 1 }, style]}>
          {children}
        </BlurTargetView>
      ) : (
        <View style={[{ flex: 1 }, style]}>{children}</View>
      )}
    </Area.Provider>
  );
}

/**
 * Live blur is OFF (Nov 2026): every <Glass blur> sat INSIDE the area it blurred, so the drawing tree
 * looped into itself (RenderThread: RenderNode::prepareTreeImpl recursing until SIGSEGV), which
 * crashed the radio the moment the player appeared. expo-blur wants the blur view next to its target,
 * not inside it. Over Lifelog's smooth colour gradients, tinted glass looks nearly the same anyway.
 */
const LIVE_BLUR = false;

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
  blur = false,
  fill,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  // real blur is opt-in, ONE panel per GlassArea: several blur views capturing the same area
  // capture each other, and that crashed the app when switching tabs
  blur?: boolean;
  fill?: string; // a lighter or tinted glass (the radio lets the album's colours through)
}) {
  const area = useContext(Area);
  const target = blur ? area : null;
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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill ?? (target ? glass.fill : glass.solid) }]} />
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
