module.exports = function (api) {
  api.cache(true);
  return {
    // Make native worklet transforms explicit and avoid applying the plugin twice.
    presets: [['babel-preset-expo', { worklets: false, reanimated: false }]],
    plugins: ['react-native-worklets/plugin'],
  };
};
