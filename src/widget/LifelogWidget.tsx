import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Widgets can't read the app's theme file at render time, so the palette is repeated here.
const BG = '#1D1C1C';
const RAISED = '#333232';
const WHITE = '#FFFFFF';
const MUTED = '#999898';

function Button({ label, uri, primary }: { label: string; uri: string; primary?: boolean }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 24,
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

/** Home screen widget: one tap to talk, one tap to write. */
export function LifelogWidget() {
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
        <Button label="Talk" uri="lifelog://note/new?voice=1" primary />
        <Button label="Write" uri="lifelog://note/new" />
      </FlexWidget>
    </FlexWidget>
  );
}
