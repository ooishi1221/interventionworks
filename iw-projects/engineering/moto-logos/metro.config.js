const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v10+ uses package.json "exports" field for subpath imports
// (e.g. "firebase/firestore"). Metro needs this flag to resolve them.
config.resolver.unstable_enablePackageExports = true;

// .md ファイルをアセットとして読み込めるようにする（法務ドキュメント表示用）
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'md'];

module.exports = config;
