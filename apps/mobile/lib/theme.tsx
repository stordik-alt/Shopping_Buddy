import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import * as SecureStore from 'expo-secure-store'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ThemeColors = {
  background: string
  primary: string
  primaryForeground: string
  accent: string
  accentSubtle: string
  accentText: string
  foreground: string
  secondaryText: string
  mutedText: string
  border: string
  inputBorder: string
  card: string
  elevated: string
  muted: string
  navyOverlay: string
  destructive: string
  destructiveSubtle: string
  warning: string
  success: string
}

const LIGHT: ThemeColors = {
  background: '#faf9f6',
  primary: '#0a1a3f',
  primaryForeground: '#ffffff',
  accent: '#03bcdb',
  accentSubtle: '#e3f8fb',
  accentText: '#045a68',
  foreground: '#0a1a3f',
  secondaryText: '#565e6f',
  mutedText: '#707786',
  border: '#e7e5df',
  inputBorder: '#d9d7cf',
  card: '#ffffff',
  elevated: '#ffffff',
  muted: '#f0efeb',
  navyOverlay: '#0a1a3fcc',
  destructive: '#a72d2d',
  destructiveSubtle: '#fff0f0',
  warning: '#8a631c',
  success: '#17623b',
}

const DARK: ThemeColors = {
  background: '#151d35',
  primary: '#03bcdb',
  primaryForeground: '#0a1a3f',
  accent: '#03bcdb',
  accentSubtle: '#113947',
  accentText: '#7fe6f5',
  foreground: '#f2f1ed',
  secondaryText: '#c2cadb',
  mutedText: '#a0abc1',
  border: '#ffffff1a',
  inputBorder: '#ffffff24',
  card: '#1d2948',
  elevated: '#263353',
  muted: '#202d4c',
  navyOverlay: '#020817cc',
  destructive: '#ff9990',
  destructiveSubtle: '#542c39',
  warning: '#ffd27a',
  success: '#8ee0a4',
}

const STORAGE_KEY = 'shopping-buddy:theme'
type ThemeContextValue = { preference: ThemePreference; theme: 'light' | 'dark'; colors: ThemeColors; setPreference: (value: ThemePreference) => void }
const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', theme: 'light', colors: LIGHT, setPreference: () => undefined })

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    let active = true
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((value) => {
        if (active && (value === 'light' || value === 'dark')) setPreferenceState(value)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value)
    void (value === 'system' ? SecureStore.deleteItemAsync(STORAGE_KEY) : SecureStore.setItemAsync(STORAGE_KEY, value)).catch(() => undefined)
  }, [])
  const theme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference
  const value = useMemo(() => ({ preference, theme, colors: theme === 'dark' ? DARK : LIGHT, setPreference }), [preference, theme, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useMobileTheme() {
  return useContext(ThemeContext)
}

/** Light palette kept as a migration aid for static, non-interactive assets. Interactive screens should use useMobileTheme(). */
export const colors = LIGHT
