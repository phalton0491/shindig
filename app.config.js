const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const defaultEasProjectId = 'ccbdeb88-21c0-4a36-9616-f0fd083e30b7';

module.exports = () => ({
  name: 'ShinDig',
  slug: 'ShinDig',
  scheme: 'shindig',
  version: '1.0.0',
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission:
          'Allow ShinDig to access your photos so you can upload a profile picture.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Allow ShinDig to use your location so it can suggest nearby places for your timeline.',
      },
    ],
    [
      'expo-contacts',
      {
        contactsPermission:
          'Allow ShinDig to access your contacts so you can invite friends to your ShinDig.',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#FF615A',
        defaultChannel: 'default',
      },
    ],
  ],
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0A0E1A',
  },
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.phalton.shindig',
  },
  android: {
    package: 'com.phalton.shindig',
    adaptiveIcon: {
      backgroundColor: '#0A0E1A',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    eas: {
      projectId: easProjectId || defaultEasProjectId,
    },
  },
});
