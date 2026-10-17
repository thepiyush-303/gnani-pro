module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            'indic-context': './modules/indic-context/src/index.ts',
          },
        },
      ],
    ],
  };
};
