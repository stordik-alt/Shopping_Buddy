import Constants from 'expo-constants'

// Backend base URL, taken from EXPO_PUBLIC_API_URL via app.config.ts. Only public values belong here.
export function getApiUrl(): string {
  const value = Constants.expoConfig?.extra?.apiUrl
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Backend URL is not configured (set EXPO_PUBLIC_API_URL).')
  }
  return value.replace(/\/+$/, '')
}
