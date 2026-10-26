import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins'

const withE2ECleartextTraffic: ConfigPlugin = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0]
    if (!application) throw new Error('Android manifest is missing its application element')
    application.$['android:usesCleartextTraffic'] = 'true'
    return modConfig
  })

// The backend URL is public configuration, never a secret: it is read from EXPO_PUBLIC_API_URL
// at build/start time and exposed to the app through `extra`. Do not put API keys or tokens here.
// Require an explicit value so a release build can never silently target its own localhost.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim()
if (!apiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is required. Set it in apps/mobile/.env for local development or in the EAS build profile.',
  )
}

let parsedApiUrl: URL
try {
  parsedApiUrl = new URL(apiUrl)
} catch {
  throw new Error('EXPO_PUBLIC_API_URL must be an absolute HTTP(S) URL.')
}
if (parsedApiUrl.protocol !== 'https:' && parsedApiUrl.protocol !== 'http:') {
  throw new Error('EXPO_PUBLIC_API_URL must use http:// or https://.')
}

const config: ExpoConfig = {
  name: 'ANITKA',
  slug: 'shopping-buddy',
  owner: 'mojeanitka',
  version: '0.1.0',
  icon: './assets/anitka-icon-512.png',
  scheme: 'shoppingbuddy',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  plugins: [
    'expo-router',
    'expo-notifications',
    [
      'expo-camera',
      {
        cameraPermission: 'ANITKA potřebuje přístup k fotoaparátu pro skenování čárových kódů.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'ANITKA potřebuje přístup k fotografiím pro nahrání účtenky.',
        microphonePermission: false,
      },
    ],
    ...(process.env.ANITKA_E2E_CLEAR_TEXT === '1'
      ? [withE2ECleartextTraffic as unknown as NonNullable<ExpoConfig['plugins']>[number]]
      : []),
  ],
  ios: { bundleIdentifier: 'cz.shoppingbuddy.mobile' },
  android: {
    package: 'cz.shoppingbuddy.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/anitka-icon-maskable-512.png',
      backgroundColor: '#ffffff',
    },
  },
  extra: {
    apiUrl,
    localAuth: process.env.NEXT_PUBLIC_LOCAL_DATABASE === '1',
    eas: {
      projectId: '71379d96-272a-4aa5-af0a-940a00b69b44',
    },
  },
}

export default config
