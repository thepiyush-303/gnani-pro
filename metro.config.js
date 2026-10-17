const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ensure Metro resolves the local module from the modules/ directory
config.watchFolders = [
  path.resolve(__dirname, 'modules'),
];

module.exports = config;
