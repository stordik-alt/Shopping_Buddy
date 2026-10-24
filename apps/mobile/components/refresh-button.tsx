import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../lib/theme'

type Props = {
  loading: boolean
  onPress: () => void
  disabled?: boolean
  variant?: 'plain' | 'outlined'
}

export function RefreshButton({ loading, onPress, disabled = false, variant = 'plain' }: Props) {
  const unavailable = loading || disabled

  return (
    <Pressable
      accessibilityLabel={loading ? 'Načítám' : 'Obnovit'}
      accessibilityRole="button"
      disabled={unavailable}
      onPress={onPress}
      style={[styles.button, variant === 'outlined' && styles.outlined, unavailable && styles.disabled]}
    >
      <View style={styles.content}>
        <View style={styles.indicatorSlot}>
          {loading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
        </View>
        <Text numberOfLines={1} style={styles.label}>Obnovit</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { width: 104, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  outlined: { borderColor: colors.inputBorder, borderRadius: 12, borderWidth: 1, backgroundColor: '#ffffff' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  indicatorSlot: { width: 18, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.55 },
})
