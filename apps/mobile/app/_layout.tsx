import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import { MobileThemeProvider, useMobileTheme } from '../lib/theme'

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

export default function RootLayout() {
  return <MobileThemeProvider><RootStack /></MobileThemeProvider>
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
