const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ensure Metro resolves the local module from the modules/ directory
config.watchFolders = [
  path.resolve(__dirname, 'modules'),
];

// The showcase deck in demo/ is a separate Vite app: never crawl or bundle it
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  new RegExp(
    `^${path
      .resolve(__dirname, 'demo')
      .replace(/[.*+?^${}()|[\]]/g, '\\$&')
      .replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`,
  ),
];

module.exports = config;
