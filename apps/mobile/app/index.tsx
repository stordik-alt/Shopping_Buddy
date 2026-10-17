import { StyleSheet, Text, View } from 'react-native'
import { getApiUrl } from '../lib/config'

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shopping_Buddy</Text>
      <Text style={styles.caption}>Backend: {getApiUrl()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  caption: { marginTop: 12, fontSize: 14, color: '#666', textAlign: 'center' },
})
