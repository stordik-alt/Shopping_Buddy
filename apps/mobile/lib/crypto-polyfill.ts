import * as ExpoCrypto from 'expo-crypto'
import { Platform } from 'react-native'

type CryptoPolyfill = {
  randomUUID: typeof ExpoCrypto.randomUUID
  getRandomValues: typeof ExpoCrypto.getRandomValues
}

if (Platform.OS !== 'web') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: ExpoCrypto.randomUUID,
      getRandomValues: ExpoCrypto.getRandomValues,
    } satisfies CryptoPolyfill,
  })
}
