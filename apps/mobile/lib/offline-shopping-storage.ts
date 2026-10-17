import { Directory, File, Paths } from 'expo-file-system'
import {
  parseOfflineSnapshot,
  type OfflineContext,
  type OfflineShoppingSnapshot,
} from './offline-shopping-list'

const offlineDirectory = new Directory(Paths.document, 'anitka-offline-v1')
const lastContextFile = new File(offlineDirectory, 'last-context.json')

function snapshotFile(userId: string, householdId: string): File {
  return new File(
    offlineDirectory,
    `list-${encodeURIComponent(userId).replace(/\./g, '%2E')}-${encodeURIComponent(householdId).replace(/\./g, '%2E')}.json`,
  )
}

function ensureDirectory() {
  offlineDirectory.create({ idempotent: true, intermediates: true })
}

export async function readOfflineSnapshot(
  userId: string,
  householdId: string,
): Promise<OfflineShoppingSnapshot | null> {
  const file = snapshotFile(userId, householdId)
  if (!file.exists) return null
  const snapshot = parseOfflineSnapshot(await file.text(), userId, householdId)
  if (!snapshot) file.delete()
  return snapshot
}

export async function saveOfflineSnapshot(snapshot: OfflineShoppingSnapshot): Promise<void> {
  ensureDirectory()
  snapshotFile(snapshot.userId, snapshot.householdId).write(JSON.stringify(snapshot))
}

export async function saveLastOfflineContext(context: OfflineContext): Promise<void> {
  ensureDirectory()
  lastContextFile.write(JSON.stringify(context))
}

export async function readLastOfflineContext(): Promise<OfflineContext | null> {
  if (!lastContextFile.exists) return null
  try {
    const value: unknown = JSON.parse(await lastContextFile.text())
    if (!value || typeof value !== 'object') return null
    const context = value as Partial<OfflineContext>
    if (
      typeof context.userId !== 'string' ||
      typeof context.householdId !== 'string' ||
      typeof context.userName !== 'string'
    ) return null
    return {
      userId: context.userId,
      householdId: context.householdId,
      userName: context.userName,
    }
  } catch {
    return null
  }
}

export async function clearLastOfflineContext(): Promise<void> {
  if (lastContextFile.exists) lastContextFile.delete()
}
