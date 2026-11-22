import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from './motion';

/*
 * A short list you reorder by holding a row and dragging it (like Spotify's queue): hold a row
 * (or touch its ≡ handle) and it lifts, follows your finger, and the others make room; let go to
 * drop it there. No gesture library: PanResponder, with the row heights measured as they lay out.
 * The parent's ScrollView should stop scrolling while a row is held (`onDragging`).
 */

type RowApi = {
  /** spread on a ≡ handle: touching it starts the drag straight away (no hold needed) */
  handle: { onTouchStart: () => void };
  /** the row is the one being dragged */
  lifted: boolean;
};

export function DragList<T>({
  items,
  keyOf,
  renderRow,
  onMove,
  onDragging,
  rowStyle,
  liftedStyle,
}: {
  items: T[];
  keyOf: (item: T) => string;
  renderRow: (item: T, index: number, api: RowApi) => ReactNode;
  onMove: (from: number, to: number) => void;
  onDragging?: (active: boolean) => void;
  rowStyle?: StyleProp<ViewStyle>;
  liftedStyle?: StyleProp<ViewStyle>;
}) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const heights = useRef<number[]>([]);
  const armed = useRef<number | null>(null); // the row that may start dragging (held, or its handle touched)
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const granted = useRef(false); // the held row got the touch (it's following the finger)

  const rowH = (i: number) => heights.current[i] || heights.current.find(Boolean) || 64;

  const arm = (i: number) => {
    armed.current = i;
    haptic.tick();
  };
  const finish = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const d = dragRef.current;
    armed.current = null;
    granted.current = false;
    dragRef.current = null;
    dy.setValue(0);
    setDrag(null);
    onDragging?.(false);
    if (d && d.from !== d.to) onMove(d.from, d.to);
  };

  /** Where the dragged row would land, `moved` px from where it started. */
  const target = (from: number, moved: number) => {
    let to = from;
    let left = moved;
    if (moved > 0)
      while (to < items.length - 1 && left > rowH(to + 1) / 2) {
        left -= rowH(to + 1);
        to++;
      }
    else
      while (to > 0 && -left > rowH(to - 1) / 2) {
        left += rowH(to - 1);
        to--;
      }
    return to;
  };

  const responders = useMemo(
    () =>
      items.map((_, i) =>
        PanResponder.create({
          // a hold of 300 ms arms the row; moving before that is a normal scroll
          onStartShouldSetPanResponder: () => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            holdTimer.current = setTimeout(() => {
              if (armed.current === null) {
                arm(i);
                dragRef.current = { from: i, to: i };
                setDrag({ from: i, to: i });
                onDragging?.(true);
              }
            }, 300);
            return false;
          },
          onMoveShouldSetPanResponderCapture: (_e, g) => {
            // moved before the hold was up: it's a scroll, not a drag
            if (armed.current === null && Math.abs(g.dy) + Math.abs(g.dx) > 8 && holdTimer.current) {
              clearTimeout(holdTimer.current);
              holdTimer.current = null;
            }
            return armed.current === i;
          },
          onMoveShouldSetPanResponder: () => armed.current === i,
          onPanResponderGrant: () => {
            granted.current = true;
            if (!dragRef.current) {
              dragRef.current = { from: i, to: i };
              setDrag({ from: i, to: i });
              onDragging?.(true);
            }
          },
          onPanResponderMove: (_e, g) => {
            const d = dragRef.current;
            if (!d) return;
            dy.setValue(g.dy);
            const to = target(d.from, g.dy);
            if (to !== d.to) {
              dragRef.current = { from: d.from, to };
              setDrag({ from: d.from, to });
              haptic.tick();
            }
          },
          onPanResponderRelease: finish,
          onPanResponderTerminate: finish,
          onPanResponderTerminationRequest: () => false, // the scroll view can't take a held row away
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length],
  );

  /** How far a row that isn't dragged moves to make room (the dragged one's height, up or down). */
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    const h = rowH(drag.from);
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return h;
    return 0;
  };

  return (
    <View>
      {items.map((item, i) => {
        const lifted = drag?.from === i;
        return (
          <Animated.View
            key={keyOf(item)}
            {...responders[i]?.panHandlers}
            onTouchEnd={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current); // a tap, not a hold
              if (dragRef.current && !granted.current) finish(); // held but let go without moving
              else if (armed.current === i && !dragRef.current) armed.current = null;
            }}
            onTouchCancel={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current); // the scroll view took the touch
              if (!granted.current) {
                if (dragRef.current) finish();
                else armed.current = null;
              }
            }}
            onLayout={(e) => (heights.current[i] = e.nativeEvent.layout.height)}
            style={[
              rowStyle,
              lifted
                ? [{ transform: [{ translateY: dy }, { scale: 1.02 }], zIndex: 10, elevation: 6 }, liftedStyle]
                : { transform: [{ translateY: shift(i) }] },
            ]}
          >
            {renderRow(item, i, { handle: { onTouchStart: () => arm(i) }, lifted })}
          </Animated.View>
        );
      })}
    </View>
  );
}
