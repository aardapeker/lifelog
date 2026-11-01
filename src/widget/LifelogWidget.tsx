import { FlexWidget, TextWidget } from 'react-native-android-widget';

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

/**
 * Home screen widget: one tap to talk, one tap to write.
 * It adapts to its size: a slim row of buttons when it's one cell tall,
 * the full card with title when there's room.
 */
export function LifelogWidget({ width, height }: { width: number; height: number }) {
  const tall = height >= 110;
  const wide = width >= 260;

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
