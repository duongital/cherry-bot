import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "cherry-bot",
  owner: "duongital",
  slug: "bot-cherry",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "botcherry",
  icon: "./assets/images/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.botcherry.mobile",
  },
  android: {
    package: "com.botcherry.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
      backgroundColor: "#f4f3ef",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-image",
    "expo-web-browser",
    [
      "expo-share-intent",
      {
        // Text and browser links shared from other Android apps appear in the
        // system share sheet as text/plain.
        androidIntentFilters: ["text/*"],
        iosActivationRules: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#f4f3ef",
        image: "./assets/images/splash-icon.png",
        imageWidth: 96,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "336eab61-e47d-4f38-82b5-e707690873b1",
    },
  },
};

export default config;
