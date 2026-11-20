import { useEffect, useState } from 'react';
import { Dimensions, Keyboard } from 'react-native';

/**
 * How tall the on-screen keyboard is right now (0 when it's closed). A Modal drawn edge to edge
 * doesn't get resized for the keyboard, so a sheet in one lifts itself by this much.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // on edge-to-edge screens the reported height can leave out the navigation bar under the keyboard
    // (the song picker's search box stayed hidden by just that much), so the keyboard's top edge is
    // measured from the bottom of the screen too, and the larger one wins
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setHeight(Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** True while the on-screen keyboard is open. */
export function useKeyboardVisible(): boolean {
  return useKeyboardHeight() > 0;
}
