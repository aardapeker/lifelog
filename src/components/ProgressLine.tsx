import { useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { clock, type Skin } from '../lib/skins';
import { colors } from '../lib/theme';
import Ionicons from './Icon';

/*
 * The song's progress, honestly: one line in the station's look (Tuzla Arabesk's gold thread, Neon's
 * glowing tube, Gebze Rock's thick square bar, Şemistan's paw), with the time on both sides. It replaced
 * the "waveform", which was made-up bars from the song's id. Tap or drag along it to jump in the song
 * (`onSeek` gets 0…1 when you let go). One line and a thumb: nothing to redraw but two widths.
 */

export function ProgressLine({
  progress,
  durationMs,
  onSeek,
  skin,
  disabled,
}: {
  progress: number;
  durationMs: number;
  onSeek: (frac: number) => void;
  skin: Skin;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [drag, setDragState] = useState<number | null>(null); // where your finger is, while dragging
  const dragRef = useRef<number | null>(null); // the same, for the release (state may not have caught up)
  const setDrag = (v: number | null) => {
    dragRef.current = v;
    setDragState(v);
  };
  const at = (x: number) => Math.max(0, Math.min(1, x / Math.max(1, width)));
  const shown = drag ?? Math.max(0, Math.min(1, progress));
  const h = skin.lineHeight;
  const r = skin.round ? h / 2 : 0;
  const thumb = drag !== null ? 18 : 14;
  const glow = skin.glow ? { boxShadow: `0 0 8px ${skin.glow}` } : null;
  // the line sits on the player's dark glass (and the dark full-screen lyrics) in every skin: light times
  const time = { color: drag !== null ? colors.text : colors.muted, fontSize: 12, fontFamily: skin.promptFont.startsWith('JetBrains') ? skin.promptFont : 'Inter_500Medium' };
  return (
    <View style={{ marginTop: 18 }}>
      <View
        style={{ height: 28, justifyContent: 'center' }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false} // keep the drag even if the page wants to scroll
        onResponderGrant={(e) => setDrag(at(e.nativeEvent.locationX))}
        onResponderMove={(e) => setDrag(at(e.nativeEvent.locationX))}
        onResponderRelease={() => {
          if (dragRef.current !== null) onSeek(dragRef.current);
          setDrag(null);
        }}
        onResponderTerminate={() => setDrag(null)}
        accessibilityRole="adjustable"
        accessibilityLabel="Song position"
        accessibilityValue={{ min: 0, max: Math.round(durationMs / 1000), now: Math.round((shown * durationMs) / 1000), text: clock(shown * durationMs) }}
      >
        <View pointerEvents="none" style={{ height: h, borderRadius: r, backgroundColor: skin.todo, opacity: disabled ? 0.5 : 1 }}>
          <View style={[{ height: h, borderRadius: r, width: `${shown * 100}%`, backgroundColor: skin.accent }, glow]} />
        </View>
        {width > 0 && !disabled && <Thumb skin={skin} size={thumb} left={shown * width} />}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={time}>{clock(shown * durationMs)}</Text>
        <Text style={[time, { color: colors.muted }]}>{clock(durationMs)}</Text>
      </View>
    </View>
  );
}

/** The thumb, in the skin's marker shape. */
function Thumb({ skin, size, left }: { skin: Skin; size: number; left: number }) {
  const box = { position: 'absolute' as const, left: left - size / 2, width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (skin.marker === 'paw') {
    return (
      <View pointerEvents="none" style={box}>
        <Ionicons name="paw" size={size + 2} color={skin.accent} />
      </View>
    );
  }
  const shape =
    skin.marker === 'diamond'
      ? { width: size * 0.72, height: size * 0.72, transform: [{ rotate: '45deg' }] }
      : skin.marker === 'cursor' || skin.marker === 'bar'
        ? { width: size * 0.5, height: size + 2, borderRadius: skin.marker === 'bar' ? 2 : 0 }
        : skin.marker === 'square'
          ? { width: size, height: size }
          : { width: size, height: size, borderRadius: size / 2 };
  return (
    <View pointerEvents="none" style={box}>
      <View style={[shape, { backgroundColor: skin.marker === 'dot' ? skin.text : skin.second }, skin.glow ? { boxShadow: `0 0 8px ${skin.second}` } : null]} />
    </View>
  );
}
