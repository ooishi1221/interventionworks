const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Android Release ビルド時の lintVitalAnalyzeRelease で
 * `:expo-dev-menu` の Detector が Metaspace OOM を起こすため Lint を全停止する。
 *
 * preview/production の release ビルドにのみ影響、JS/TS の品質チェックには無関係。
 */
module.exports = function withDisableLint(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('// withDisableLint')) {
      return config;
    }
    config.modResults.contents = contents.replace(
      /android\s*\{/,
      `android {
    // withDisableLint: lintVitalAnalyzeRelease の OOM 回避
    lintOptions {
        checkReleaseBuilds false
        abortOnError false
    }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }`
    );
    return config;
  });
};
