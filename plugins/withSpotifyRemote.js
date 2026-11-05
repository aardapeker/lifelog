// Spotify's App Remote SDK isn't on Maven, so modules/spotify-remote carries it as a tiny local
// Maven repository. The app has to see that repository too, so it goes into the root build.gradle.
const { withProjectBuildGradle } = require('expo/config-plugins');

const REPO = 'maven { url = uri("$rootDir/../modules/spotify-remote/android/maven") }';

module.exports = function withSpotifyRemote(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(REPO)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        (m) => `${m}\n    ${REPO}`,
      );
    }
    return cfg;
  });
};
