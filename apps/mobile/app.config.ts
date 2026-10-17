import type { ExpoConfig } from 'expo/config'

// The backend URL is public configuration, never a secret: it is read from EXPO_PUBLIC_API_URL
// at build/start time and exposed to the app through `extra`. Do not put API keys or tokens here.
const config: ExpoConfig = {
  name: 'ANITKA',
  slug: 'shopping-buddy',
  version: '0.1.0',
  scheme: 'shoppingbuddy',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission: 'ANITKA potřebuje přístup k fotoaparátu pro skenování čárových kódů.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
  ],
  ios: { bundleIdentifier: 'cz.shoppingbuddy.mobile' },
  android: { package: 'cz.shoppingbuddy.mobile' },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
}

export default config
