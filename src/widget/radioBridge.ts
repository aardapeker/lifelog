import { createElement } from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

/*
 * The bridge between the radio (running inside the app) and the home screen widget.
 * While a show is on, the app's JS keeps running (the radio's keep-alive), and widget taps are
 * handled in that same JS: so a module-level "now playing" and a command channel are enough.
 * If the app isn't running, there's no show, and the widget shows its usual Talk / Write.
 */

export type WidgetRadio = {
  song: string;
  artist: string;
  station: string; // "🌴 Neon FM 98.3"
  cover: string | null;
  paused: boolean;
  talking: string | null; // "Candy Starr & Rico on the mic" while the hosts talk
  position: string; // "4/8"
  liked: boolean; // the song is hearted in Lifelog
};

export type RadioCommand = 'prev' | 'toggle' | 'next' | 'like';

let now: WidgetRadio | null = null;
const listeners = new Set<(c: RadioCommand) => void>();

export const widgetRadio = () => now;

/** The engine tells the widget what's on (null = off air) and the widget redraws. */
let drawn = false; // redraw once per app start, so a widget placed before an update gets the new look

export function publishToWidget(state: WidgetRadio | null): void {
  const same = JSON.stringify(state) === JSON.stringify(now);
  now = state;
  if (same && drawn) return;
  drawn = true;
  // imported lazily: the widget file imports this one
  const { LifelogWidget } = require('./LifelogWidget') as typeof import('./LifelogWidget');
  requestWidgetUpdate({
    widgetName: 'Lifelog',
    renderWidget: (info) => createElement(LifelogWidget, { width: info.width, height: info.height, radio: now }),
  }).catch(() => {});
}

/** Widget taps → the radio engine. */
export function onRadioCommand(f: (c: RadioCommand) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function sendRadioCommand(c: RadioCommand): void {
  listeners.forEach((f) => f(c));
}
