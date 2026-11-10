import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetRadio } from './radioBridge';

// Widgets can't read the app's theme file at render time, so the palette is repeated here.
const BG = '#1D1C1C';
const RAISED = '#333232';
const WHITE = '#FFFFFF';
const MUTED = '#999898';

function Button({ label, uri, primary, height }: { label: string; uri: string; primary?: boolean; height: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height,
        borderRadius: height / 2,
        backgroundColor: primary ? WHITE : RAISED,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget
        text={label}
        style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: primary ? BG : WHITE }}
      />
    </FlexWidget>
  );
}

// player icons as SVG (widgets can't use the app's icon font)
const svg = (path: string, size: number, color = WHITE) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="${color}" d="${path}"/></svg>`;
const ICON = {
  prev: 'M6 5h2v14H6zM9.5 12 19 5v14z',
  next: 'M16 5h2v14h-2zM5 5l9.5 7L5 19z',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h3.5v14H7zm6.5 0H17v14h-3.5z',
  heart: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  heartOn: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  // an old radio: body, speaker grille, dial and antenna
  radio:
    'M20 6H8.3l8.26-3.34L15.88 1 3.24 6.15C2.51 6.43 2 7.17 2 8v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM7 20a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm13-8h-2v-2h-2v2H4V8h16v4z',
};

/** Off air: a round radio button that opens Lifelog Radio (the player shows here once a show is on). */
function RadioButton({ size }: { size: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'lifelog://radio' }}
      accessibilityLabel="Lifelog Radio"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: RAISED, alignItems: 'center', justifyContent: 'center' }}
    >
      <SvgWidget svg={svg(ICON.radio, Math.round(size * 0.45))} style={{ width: Math.round(size * 0.45), height: Math.round(size * 0.45) }} />
    </FlexWidget>
  );
}

function Control({ action, icon, size, primary }: { action: string; icon: keyof typeof ICON; size: number; primary?: boolean }) {
  const box = size + 18;
  return (
    <FlexWidget
      clickAction={action}
      accessibilityLabel={icon}
      style={{
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: primary ? WHITE : RAISED,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgWidget svg={svg(ICON[icon], size, primary ? BG : WHITE)} style={{ width: size, height: size }} />
    </FlexWidget>
  );
}

/** While a radio show is on: cover, song, who's on, ⏮ ⏯ ⏭ (and Talk / Write when there's room). */
function RadioWidget({ radio, tall }: { radio: WidgetRadio; tall: boolean }) {
  const controls = (size: number) => (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
      <Control action="RADIO_PREV" icon="prev" size={size} />
      <Control action="RADIO_TOGGLE" icon={radio.paused ? 'play' : 'pause'} size={size + 4} primary />
      <Control action="RADIO_NEXT" icon="next" size={size} />
      {/* ♥ the song: it comes back more often in later shows */}
      <Control action="RADIO_LIKE" icon={radio.liked ? 'heartOn' : 'heart'} size={size} />
    </FlexWidget>
  );
  const cover = (size: number) =>
    radio.cover?.startsWith('https:') ? (
      <ImageWidget image={radio.cover as `https:${string}`} imageWidth={size} imageHeight={size} radius={12} />
    ) : null;
  const sub = radio.talking ?? radio.artist;

  if (!tall) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'lifelog://radio' }}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: BG,
          borderRadius: 24,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 10,
        }}
      >
        {cover(40)}
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={radio.song} maxLines={1} truncate="END" style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: WHITE }} />
          <TextWidget text={sub} maxLines={1} truncate="END" style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED }} />
        </FlexWidget>
        {controls(16)}
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'lifelog://radio' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 28,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 12, width: 'match_parent' }}>
        {cover(56)}
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={`${radio.station} · ${radio.position}`} maxLines={1} truncate="END" style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED }} />
          <TextWidget text={radio.song} maxLines={1} truncate="END" style={{ fontSize: 18, fontFamily: 'Inter_500Medium', color: WHITE }} />
          <TextWidget text={sub} maxLines={1} truncate="END" style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: MUTED }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}>
        {controls(20)}
        <FlexWidget style={{ flexDirection: 'row', flexGap: 8 }}>
          <SmallLink label="Talk" uri="lifelog://write?voice=1" />
          <SmallLink label="Write" uri="lifelog://write" />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function SmallLink({ label, uri }: { label: string; uri: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: RAISED, alignItems: 'center', justifyContent: 'center' }}
    >
      <TextWidget text={label} style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: WHITE }} />
    </FlexWidget>
  );
}

/**
 * Home screen widget: one tap to talk, one tap to write, one to the radio. While Lifelog Radio is on air,
 * it turns into the show's player.
 * It adapts to its size: a slim row of buttons when it's one cell tall,
 * the full card with title when there's room.
 */
export function LifelogWidget({ width, height, radio }: { width: number; height: number; radio?: WidgetRadio | null }) {
  const tall = height >= 110;
  const wide = width >= 260;
  if (radio) return <RadioWidget radio={radio} tall={tall} />;

  if (!tall) {
    // one row: [Lifelog] [Talk] [Write], or just the buttons when it's narrow
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: BG,
          borderRadius: 24,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 8,
        }}
      >
        {wide && (
          <TextWidget
            text="Lifelog"
            style={{ fontSize: 19, fontFamily: 'Inter_500Medium', color: WHITE, marginLeft: 8, marginRight: 4 }}
          />
        )}
        <Button label="Talk" uri="lifelog://write?voice=1" primary height={40} />
        <Button label="Write" uri="lifelog://write" height={40} />
        <RadioButton size={40} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 28,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text="Lifelog" style={{ fontSize: 22, fontFamily: 'Inter_500Medium', color: WHITE }} />
        <TextWidget text="How was the shift?" style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: MUTED }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: 10 }}>
        <Button label="Talk" uri="lifelog://write?voice=1" primary height={48} />
        <Button label="Write" uri="lifelog://write" height={48} />
        <RadioButton size={48} />
      </FlexWidget>
    </FlexWidget>
  );
}
