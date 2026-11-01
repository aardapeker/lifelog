import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { LifelogWidget } from './LifelogWidget';

/**
 * Android asks for the widget's look when it's added, resized or updated.
 * It has no live data; only its size decides the layout.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<LifelogWidget width={props.widgetInfo.width} height={props.widgetInfo.height} />);
      break;
    default:
      break; // clicks open a URI, handled by Android itself
  }
}
