module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "react" }]],
    plugins: [
      // Tamagui's optimizing compiler. It's optional (the app works without it), but it's
      // what turns styled() calls into flat StyleSheets at build time rather than at runtime.
      [
        "@tamagui/babel-plugin",
        {
          components: ["tamagui"],
          config: "./tamagui.config.ts",
          logTimings: true,
          disableExtraction: process.env.NODE_ENV === "development",
        },
      ],
      // react-native-worklets/reanimated must be LAST in the plugin list.
      "react-native-worklets/plugin",
    ],
  };
};
