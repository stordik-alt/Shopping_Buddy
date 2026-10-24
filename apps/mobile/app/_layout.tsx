import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { MobileThemeProvider, useMobileTheme } from '../lib/theme'

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
