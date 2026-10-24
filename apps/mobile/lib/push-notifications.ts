import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { getDevicePushStatus, registerDevicePush, removeDevicePush } from './shopping-list-api'

export type DevicePushState = { permissionGranted: boolean; registered: boolean; token: string | null }
const TOKEN_KEY = 'anitka.expo-push-token'

async function prepareNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Upozornění ANITKA',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#03bcdb',
    })
  }
}

async function pushToken(): Promise<string> {
  if (Platform.OS === 'web') throw new Error('Upozornění do telefonu jsou dostupná v nainstalované aplikaci.')
  await prepareNotificationChannel()
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) throw new Error('Registrace upozornění není nakonfigurovaná pro tuto aplikaci.')
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data
}

function permissionAllowed(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
}

export async function readDevicePushState(): Promise<DevicePushState> {
  if (Platform.OS === 'web') return { permissionGranted: false, registered: false, token: null }
  const savedToken = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null)
  const permission = await Notifications.getPermissionsAsync()
  if (!permissionAllowed(permission)) return { permissionGranted: false, registered: false, token: savedToken }
  const token = await pushToken()
  const registration = await getDevicePushStatus(token)
  if (registration.enabled) await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined)
  return { permissionGranted: true, registered: registration.enabled, token }
}

export async function enableDevicePush(): Promise<DevicePushState> {
  if (Platform.OS === 'web') throw new Error('Upozornění do telefonu jsou dostupná v nainstalované aplikaci.')
  await prepareNotificationChannel()
  let permission = await Notifications.getPermissionsAsync()
  if (!permissionAllowed(permission)) permission = await Notifications.requestPermissionsAsync()
  if (!permissionAllowed(permission)) throw new Error('Povolte upozornění ANITKA v nastavení zařízení a zkuste to znovu.')
  const token = await pushToken()
  await registerDevicePush(token)
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined)
  return { permissionGranted: true, registered: true, token }
}

export async function disableDevicePush(token: string) {
  await removeDevicePush(token)
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined)
}

export async function unregisterDevicePushForSignOut() {
  if (Platform.OS === 'web') return
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null)
  if (token) await disableDevicePush(token)
}
