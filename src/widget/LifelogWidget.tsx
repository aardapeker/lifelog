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
};

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
          <TextWidget text={radio.song} maxLines={1} truncate="END" style={{ fontSize: 18, fontFamily: 'LibreCaslonText_400Regular', color: WHITE }} />
          <TextWidget text={sub} maxLines={1} truncate="END" style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: MUTED }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 'match_parent' }}>
        {controls(20)}
        <FlexWidget style={{ flexDirection: 'row', flexGap: 8 }}>
          <SmallLink label="Talk" uri="lifelog://note/new?voice=1" />
          <SmallLink label="Write" uri="lifelog://note/new" />
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
 * Home screen widget: one tap to talk, one tap to write. While Lifelog Radio is on air,
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
            style={{ fontSize: 19, fontFamily: 'LibreCaslonText_400Regular', color: WHITE, marginLeft: 8, marginRight: 4 }}
          />
        )}
        <Button label="Talk" uri="lifelog://note/new?voice=1" primary height={40} />
        <Button label="Write" uri="lifelog://note/new" height={40} />
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
        <TextWidget text="Lifelog" style={{ fontSize: 22, fontFamily: 'LibreCaslonText_400Regular', color: WHITE }} />
        <TextWidget text="How was the shift?" style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: MUTED }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: 10 }}>
        <Button label="Talk" uri="lifelog://note/new?voice=1" primary height={48} />
        <Button label="Write" uri="lifelog://note/new" height={48} />
      </FlexWidget>
    </FlexWidget>
  );
}
