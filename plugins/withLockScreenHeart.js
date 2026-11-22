// The lock screen's heart (patches/expo-audio: the radio's "Heart" button). Media3's own heart icon looked
// big and hand-drawn on HyperOS, so the app carries its own: the Material heart, scaled to 80% so it sits
// like the ⏮ ⏯ ⏭ icons next to it. Two vector drawables, written into the generated Android project; the
// patched AudioControlsService finds them by name (lifelog_heart, lifelog_heart_filled).
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const HEART =
  'M12,21.35l-1.45,-1.32C5.4,15.36 2,12.28 2,8.5 2,5.42 4.42,3 7.5,3c1.74,0 3.41,0.81 4.5,2.09' +
  'C13.09,3.81 14.76,3 16.5,3 19.58,3 22,5.42 22,8.5c0,3.78 -3.4,6.86 -8.55,11.54L12,21.35z';

const drawable = (filled) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <group android:pivotX="12" android:pivotY="12" android:scaleX="0.8" android:scaleY="0.8">
    <path android:pathData="${HEART}"
        ${filled ? 'android:fillColor="#FFFFFFFF"' : 'android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="2.2" android:strokeLineJoin="round"'} />
  </group>
</vector>
`;

module.exports = function withLockScreenHeart(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'lifelog_heart.xml'), drawable(false));
      fs.writeFileSync(path.join(dir, 'lifelog_heart_filled.xml'), drawable(true));
      return cfg;
    },
  ]);
};
