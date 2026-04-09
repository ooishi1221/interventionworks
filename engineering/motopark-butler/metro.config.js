const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v10+ uses package.json "exports" field for subpath imports
// (e.g. "firebase/firestore"). Metro needs this flag to resolve them.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
