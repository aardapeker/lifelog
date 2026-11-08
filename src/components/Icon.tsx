import Ionicons from '@expo/vector-icons/Ionicons';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore, type ComponentProps } from 'react';
import { DB_NAME, getSetting, setSetting } from '../lib/db';

/*
 * Every icon in the app goes through here, so one setting (You → Me → Icons) restyles them all:
 * outline (thin lines), filled (solid) or sharp (angular). Same names everywhere: an icon written
 * as "mic-outline" becomes "mic" or "mic-sharp" when those exist.
 */

export type IconStyle = 'outline' | 'filled' | 'sharp';
export const ICON_STYLES: { key: IconStyle; label: string }[] = [
  { key: 'outline', label: 'Outline' },
  { key: 'filled', label: 'Filled' },
  { key: 'sharp', label: 'Sharp' },
];

let current: IconStyle = 'outline';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Your saved style, read once when the app starts (the first icons may draw a blink earlier in outline). */
async function loadIconStyle(db: SQLiteDatabase): Promise<void> {
  const s = (await getSetting(db, 'iconStyle', 'outline')) as IconStyle;
  if (s !== current && ICON_STYLES.some((x) => x.key === s)) {
    current = s;
    listeners.forEach((l) => l());
  }
}

openDatabaseAsync(DB_NAME)
  .then(loadIconStyle)
  .catch(() => {}); // a brand-new install has nothing saved yet

export async function setIconStyle(db: SQLiteDatabase, s: IconStyle): Promise<void> {
  current = s;
  listeners.forEach((l) => l());
  await setSetting(db, 'iconStyle', s);
}

export const useIconStyle = () => useSyncExternalStore(subscribe, () => current);

type Name = ComponentProps<typeof Ionicons>['name'];
const has = (n: string): n is Name => n in Ionicons.glyphMap;
// icons whose filled / outline look MEANS something (a hearted song vs not): never restyled
const MEANINGFUL = new Set(['heart', 'heart-outline']);

export function styled(name: Name, style: IconStyle): Name {
  // outline is the app as designed: thin icons, with solid play / pause / skip where they were drawn solid
  if (style === 'outline' || MEANINGFUL.has(name)) return name;
  const base = name.replace(/-(outline|sharp)$/, '');
  const want = style === 'sharp' ? `${base}-sharp` : base;
  return has(want) ? want : has(base) ? base : name;
}

/** Ionicons, in the chosen style. Drop-in: same props, same glyphMap. */
function Icon(props: ComponentProps<typeof Ionicons>) {
  const style = useIconStyle();
  return <Ionicons {...props} name={styled(props.name, style)} />;
}
Icon.glyphMap = Ionicons.glyphMap;

export default Icon;
