// Firebase's JS SDK needs these two tweaks to resolve its React Native build
// (which provides getReactNativePersistence for staying logged in).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
