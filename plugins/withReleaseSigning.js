// Google Play builds: sign the release with the upload key, and number each build.
//
// The key isn't in the repo: CI writes it to android/app/upload.keystore and passes its passwords as
// Gradle properties (LIFELOG_UPLOAD_*). Without them (a local build), release falls back to the debug
// key, as before. VERSION_CODE (CI's run number) gives every build a higher versionCode, which Play needs.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (project.hasProperty('LIFELOG_UPLOAD_STORE_FILE')) {
                storeFile file(LIFELOG_UPLOAD_STORE_FILE)
                storePassword LIFELOG_UPLOAD_STORE_PASSWORD
                keyAlias LIFELOG_UPLOAD_KEY_ALIAS
                keyPassword LIFELOG_UPLOAD_KEY_PASSWORD
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;

module.exports = function withReleaseSigning(config) {
  const code = Number(process.env.VERSION_CODE);
  if (code > 0) config.android = { ...config.android, versionCode: code };
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('LIFELOG_UPLOAD_STORE_FILE')) {
      // add a release signing config next to the template's debug one…
      g = g.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
      // …and use it for release builds (the template signs them with the debug key)
      g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
