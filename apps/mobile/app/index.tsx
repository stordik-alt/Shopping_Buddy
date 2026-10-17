import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ITEM_UNITS, unitLabel, type ItemUnit } from '@anitka/shared/units'
import { getAccessToken, signIn, signOut } from '../lib/auth'
import {
  addShoppingItem,
  getCurrentUser,
  getShoppingList,
  MobileApiError,
  toggleShoppingItem,
  updateShoppingItem,
  type MobileShoppingItem,
} from '../lib/shopping-list-api'

function newItemId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 3) | 8).toString(16)
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Operaci se nepodařilo dokončit. Zkuste to znovu.'
}

function LoginForm({ onSignIn, busy, error }: { onSignIn: (email: string, password: string) => void; busy: boolean; error: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <View style={styles.centered}>
      <View style={styles.card}>
        <Text style={styles.brand}>ANITKA</Text>
        <Text style={styles.title}>Přihlášení</Text>
        <Text style={styles.supporting}>Přihlaste se ke svému účtu a otevřete nákupní seznam domácnosti.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          accessibilityLabel="E-mail"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-mail"
          placeholderTextColor="#64748b"
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="Heslo"
          autoComplete="password"
          onChangeText={setPassword}
          onSubmitEditing={() => onSignIn(email.trim(), password)}
          placeholder="Heslo"
          placeholderTextColor="#64748b"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        <PrimaryButton disabled={busy || !email.trim() || !password} label="Přihlásit se" onPress={() => onSignIn(email.trim(), password)} />
      </View>
    </View>
  )
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.disabledButton]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function ShoppingRow({
  item,
  busy,
  onToggle,
  onEdit,
}: {
  item: MobileShoppingItem
  busy: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  return (
    <View style={styles.itemRow}>
      <Pressable
        accessibilityLabel={item.done ? `Označit ${item.name} jako nenakoupené` : `Označit ${item.name} jako nakoupené`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done, disabled: busy }}
        disabled={busy}
        onPress={onToggle}
        style={[styles.checkbox, item.done && styles.checkboxDone]}
      >
        {busy ? <ActivityIndicator color="#ffffff" size="small" /> : item.done ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>
      <View style={styles.itemText}>
        <Text style={[styles.itemName, item.done && styles.itemDone]}>{item.name}</Text>
        <Text style={styles.itemQuantity}>
          {item.quantity} {unitLabel(item.quantity, item.unit)}
        </Text>
      </View>
      <Pressable accessibilityLabel={`Upravit množství položky ${item.name}`} accessibilityRole="button" onPress={onEdit} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Upravit</Text>
      </Pressable>
    </View>
  )
}

export default function HomeScreen() {
  const [signedIn, setSignedIn] = useState(false)
  const [busy, setBusy] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [householdAvailable, setHouseholdAvailable] = useState(false)
  const [householdMissing, setHouseholdMissing] = useState(false)
  const [items, setItems] = useState<MobileShoppingItem[]>([])
  const [listName, setListName] = useState('Nákupní seznam')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<MobileShoppingItem | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState<ItemUnit>('ks')
  const pendingAdds = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    setHouseholdMissing(false)
    try {
      const token = await getAccessToken()
      if (!token) {
        setSignedIn(false)
        setHouseholdAvailable(false)
        return
      }
      setSignedIn(true)
      const profile = await getCurrentUser()
      setUserName(profile.user.name)
      if (!profile.household) {
        setHouseholdMissing(true)
        setHouseholdAvailable(false)
        return
      }
      const list = await getShoppingList()
      setHouseholdMissing(false)
      setHouseholdAvailable(true)
      setItems(list.items)
      setListName(list.shoppingLists[0] ?? 'Nákupní seznam')
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof MobileApiError && caught.status === 401) setSignedIn(false)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSignIn(email: string, password: string) {
    setSigningIn(true)
    setError(null)
    try {
      await signIn(email, password)
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSigningIn(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
      setSignedIn(false)
      setHouseholdAvailable(false)
      setHouseholdMissing(false)
      setItems([])
      setUserName('')
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name || busyItemId) return
    setBusyItemId('new')
    setError(null)
    try {
      const clientId = pendingAdds.current.get(name) ?? newItemId()
      pendingAdds.current.set(name, clientId)
      const result = await addShoppingItem(name, clientId)
      setItems((current) => [...current, result.item])
      pendingAdds.current.delete(name)
      setNewName('')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyItemId(null)
    }
  }

  async function handleToggle(item: MobileShoppingItem) {
    setBusyItemId(item.id)
    setError(null)
    try {
      await toggleShoppingItem(item.id, !item.done)
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyItemId(null)
    }
  }

  function openEdit(item: MobileShoppingItem) {
    setEditItem(item)
    setEditQuantity(String(item.quantity))
    setEditUnit(item.unit)
  }

  async function saveEdit() {
    if (!editItem || busyItemId) return
    const quantity = Number(editQuantity.trim().replace(',', '.'))
    setBusyItemId(editItem.id)
    setError(null)
    try {
      await updateShoppingItem(editItem.id, { quantity, unit: editUnit })
      setItems((current) => current.map((entry) => (entry.id === editItem.id ? { ...entry, quantity, unit: editUnit } : entry)))
      setEditItem(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusyItemId(null)
    }
  }

  const remaining = items.filter((item) => !item.done).length
  const completed = items.length - remaining

  if (busy && !signedIn) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color="#087e8b" size="large" />
          <Text style={styles.supporting}>Načítání účtu…</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <LoginForm onSignIn={handleSignIn} busy={signingIn} error={error} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>ANITKA</Text>
            <Text style={styles.title}>{householdAvailable ? listName : 'Nákupní seznam'}</Text>
            {userName ? <Text style={styles.supporting}>Přihlášeno: {userName}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Odhlásit</Text>
          </Pressable>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {!householdAvailable ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{householdMissing ? 'Domácnost není dostupná' : 'Seznam se nepodařilo načíst'}</Text>
            <Text style={styles.supporting}>
              {householdMissing
                ? 'Účet zatím není připojený k domácnosti. Připojte se k domácnosti a zkuste seznam obnovit.'
                : 'Zkontrolujte připojení a zkuste seznam načíst znovu.'}
            </Text>
            <PrimaryButton label={busy ? 'Načítání…' : 'Obnovit'} onPress={() => void load()} disabled={busy} />
          </View>
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{remaining} k nákupu · {completed} hotovo</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()} style={styles.refreshButton}>
                <Text style={styles.secondaryButtonText}>{busy ? 'Načítání…' : 'Obnovit'}</Text>
              </Pressable>
            </View>

            <View style={styles.addRow}>
              <TextInput
                accessibilityLabel="Nová položka"
                editable={!busyItemId}
                maxLength={300}
                onChangeText={setNewName}
                onSubmitEditing={() => void handleAdd()}
                placeholder="Co koupit?"
                placeholderTextColor="#64748b"
                returnKeyType="done"
                style={[styles.input, styles.addInput]}
                value={newName}
              />
              <PrimaryButton label={busyItemId === 'new' ? 'Ukládám…' : 'Přidat'} onPress={() => void handleAdd()} disabled={!newName.trim() || busyItemId !== null} />
            </View>

            {editItem ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Upravit: {editItem.name}</Text>
                <TextInput
                  accessibilityLabel="Množství"
                  keyboardType="decimal-pad"
                  onChangeText={setEditQuantity}
                  style={styles.input}
                  value={editQuantity}
                />
                <View style={styles.units}>
                  {ITEM_UNITS.map((unit) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: editUnit === unit }}
                      key={unit}
                      onPress={() => setEditUnit(unit)}
                      style={[styles.unitButton, editUnit === unit && styles.unitSelected]}
                    >
                      <Text style={[styles.unitText, editUnit === unit && styles.unitTextSelected]}>{unit}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => setEditItem(null)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Zrušit</Text>
                  </Pressable>
                  <PrimaryButton label={busyItemId === editItem.id ? 'Ukládám…' : 'Uložit'} onPress={() => void saveEdit()} disabled={busyItemId !== null} />
                </View>
              </View>
            ) : null}

            {busy && items.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator color="#087e8b" size="large" />
                <Text style={styles.supporting}>Načítání seznamu…</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.sectionTitle}>Seznam je zatím prázdný</Text>
                <Text style={styles.supporting}>Přidejte první položku, kterou potřebujete nakoupit.</Text>
              </View>
            ) : (
              <FlatList
                contentContainerStyle={styles.list}
                data={items}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <ShoppingRow item={item} busy={busyItemId === item.id} onEdit={() => openEdit(item)} onToggle={() => void handleToggle(item)} />
                )}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f7f8' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, gap: 12 },
  brand: { color: '#087e8b', fontSize: 14, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#122c3a', fontSize: 24, fontWeight: '700', marginTop: 4 },
  supporting: { color: '#526674', fontSize: 14, lineHeight: 20, marginTop: 5 },
  card: { backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1, margin: 16, padding: 16, gap: 12 },
  sectionTitle: { color: '#122c3a', fontSize: 18, fontWeight: '700' },
  input: { minHeight: 48, borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, backgroundColor: '#ffffff', color: '#122c3a', paddingHorizontal: 14, fontSize: 16 },
  primaryButton: { minHeight: 48, minWidth: 80, borderRadius: 12, backgroundColor: '#087e8b', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, borderColor: '#cbd8dd', borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: '#23515d', fontSize: 14, fontWeight: '600' },
  error: { color: '#a72d2d', backgroundColor: '#fff0f0', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, fontSize: 14, lineHeight: 20 },
  summary: { minHeight: 52, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { color: '#526674', fontSize: 14, fontWeight: '600' },
  refreshButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  addInput: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  itemRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  checkbox: { width: 44, height: 44, borderColor: '#9aabb2', borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#087e8b', borderColor: '#087e8b' },
  checkmark: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { color: '#122c3a', fontSize: 16, fontWeight: '600' },
  itemDone: { color: '#6a7d86', textDecorationLine: 'line-through' },
  itemQuantity: { color: '#526674', fontSize: 13, marginTop: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', margin: 16, padding: 28, backgroundColor: '#ffffff', borderColor: '#dce6e9', borderRadius: 18, borderWidth: 1, gap: 8 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitButton: { minHeight: 44, minWidth: 48, borderColor: '#cbd8dd', borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  unitSelected: { backgroundColor: '#dff4f5', borderColor: '#087e8b' },
  unitText: { color: '#526674', fontSize: 14, fontWeight: '600' },
  unitTextSelected: { color: '#075e68' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
})
