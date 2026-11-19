import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * How tall the on-screen keyboard is right now (0 when it's closed). A Modal drawn edge to edge
 * doesn't get resized for the keyboard, so a sheet in one lifts itself by this much.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
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
