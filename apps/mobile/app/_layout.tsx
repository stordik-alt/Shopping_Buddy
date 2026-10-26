import { Stack } from 'expo-router'
import { Observe, ObserveRoot } from 'expo-observe'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import { Text, View } from 'react-native'
import { MobileThemeProvider, useMobileTheme } from '../lib/theme'

Observe.configure({
  integrations: {
    'expo-router': {
      // Verification and password-reset links can carry credentials in query parameters.
      filteredParams: ['token', 'email', 'code', 'otp', 'auth'],
    },
  },
})

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

export default function RootLayout() {
  return (
    <ObserveRoot errorBoundaryFallback={<ObserveFallback />}>
      <MobileThemeProvider><RootStack /></MobileThemeProvider>
    </ObserveRoot>
  )
}

function ObserveFallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text>ANITKA se nepodařilo otevřít. Restartujte aplikaci.</Text>
    </View>
  )
}

function RootStack() {
  const { theme } = useMobileTheme()
  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </>
  )
}
