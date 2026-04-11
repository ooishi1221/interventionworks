const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Yahoo!カーナビ の URL スキームを Android の <queries> に追加するプラグイン
 * Android 11 (API 30) 以降で Linking.canOpenURL が正しく動作するために必要
 */
module.exports = function withYahooNaviAndroid(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    const schemes = ['yjnavicar', 'ynavigation'];
    for (const scheme of schemes) {
      const alreadyAdded = manifest.queries.some(
        (q) => q?.intent?.[0]?.data?.[0]?.['$']?.['android:scheme'] === scheme
      );
      if (!alreadyAdded) {
        manifest.queries.push({
          intent: [
            {
              action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
              data: [{ $: { 'android:scheme': scheme } }],
            },
          ],
        });
      }
    }

    return config;
  });
};
