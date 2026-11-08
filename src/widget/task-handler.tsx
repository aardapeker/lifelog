import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { LifelogWidget } from './LifelogWidget';
import { sendRadioCommand, widgetRadio, type RadioCommand } from './radioBridge';

const COMMANDS: Record<string, RadioCommand> = { RADIO_PREV: 'prev', RADIO_TOGGLE: 'toggle', RADIO_NEXT: 'next' };

/**
 * Android asks for the widget's look when it's added, resized or updated, and passes taps on
 * the radio buttons here. While a show is on, the app is running, so the taps reach the radio.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const render = () =>
    props.renderWidget(
      <LifelogWidget width={props.widgetInfo.width} height={props.widgetInfo.height} radio={widgetRadio()} />,
    );
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      render();
      break;
    case 'WIDGET_CLICK': {
      const command = props.clickAction ? COMMANDS[props.clickAction] : undefined;
      if (command) sendRadioCommand(command); // the radio answers by publishing its new state
      render();
      break;
    }
    default:
      break; // other clicks open a URI, handled by Android itself
  }
}
