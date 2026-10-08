'use client'

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  addPantryItemAction,
  addPantryPlaceAction,
  adjustPantryItemQuantityAction,
  autoCategorizePantryAction,
  confirmPantryItemAction,
  movePantryItemAction,
  removePantryItemAction,
  removePantryPlaceAction,
  reviewPantryAction,
  setPantryCheckinDaysAction,
  setPantryItemCategoryAction,
  setPantryItemSubcategoryAction,
  setPantrySubcategoryCheckinDaysAction,
  setPantryTrackingAction,
} from '@/app/actions/pantry'
import { addShoppingItemAction } from '@/app/actions/shopping'
import type { PantryPromptState } from '@/components/shopping/pantry-prompt'
import type { HouseholdData } from '@/lib/db/queries'
import { customPlaceIdFromKey, pantryItemAtHome, type PantryQuantityChange } from '@/lib/pantry'
import { estimatePantry } from '@/lib/pantry-estimate'
import { tabHref } from '@/lib/tab-url'
import type { Item, ItemCategory, ItemUnit, PantryArea, PantryItem, PantryLocation, PantryTracking } from '@/lib/types'

/** The pantry: its items, places and check-in settings, and everything the household does to them. */
export function usePantry({
  initialData,
  initialPantryCheck,
  items,
  purchaseHistory,
  today,
  setItems,
  setNotifications,
}: {
  initialData: HouseholdData
  initialPantryCheck: boolean
  items: Item[]
  purchaseHistory: HouseholdData['purchaseHistory']
  today: string
  setItems: Dispatch<SetStateAction<Item[]>>
  setNotifications: Dispatch<SetStateAction<HouseholdData['notifications']>>
}) {
  const [pantryItems, setPantryItems] = useState(initialData.pantryItems)
  const [pantryPlaces, setPantryPlaces] = useState(initialData.pantryPlaces)
  const [pantryCheckinDays, setPantryCheckinDays] = useState(initialData.pantryCheckinDays)
  const [pantryCheckinSubcategoryDays, setPantryCheckinSubcategoryDays] = useState(initialData.pantryCheckinSubcategoryDays)
  const [pantryCheckPending, setPantryCheckPending] = useState(initialPantryCheck)
  // Putting something on the list that the pantry says is at home: ask once whether it ran out
  // (components/shopping/pantry-prompt.tsx).
  const [pantryPrompt, setPantryPrompt] = useState<PantryPromptState | null>(null)

  // Resync whenever the server sends a fresh copy (after a user-triggered refresh or a reload).
  useEffect(() => {
    setPantryItems(initialData.pantryItems)
    setPantryPlaces(initialData.pantryPlaces)
    setPantryCheckinDays(initialData.pantryCheckinDays)
    setPantryCheckinSubcategoryDays(initialData.pantryCheckinSubcategoryDays)
  }, [initialData])

  // Matched by name with synonyms (matchKey); items the household does not track are left alone.
  function offerPantryCorrection(name: string) {
    const atHome = pantryItemAtHome(pantryItems, name)
    setPantryPrompt(atHome ? { pantryItemId: atHome.id, name: atHome.name, quantity: atHome.quantity, unit: atHome.unit } : null)
  }

  function confirmPantryItem(id: string) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, addedAt: new Date().toISOString(), askedAt: undefined } : item)))
    confirmPantryItemAction(id)
  }

  function removePantryItem(id: string) {
    setPantryItems((current) => current.filter((item) => item.id !== id))
    removePantryItemAction(id)
  }

  function movePantryItem(id: string, placeKey: string) {
    const customPlaceId = customPlaceIdFromKey(placeKey)
    setPantryItems((current) => current.map((item) => (item.id === id ? (customPlaceId ? { ...item, customPlaceId } : { ...item, location: placeKey as PantryLocation, customPlaceId: null }) : item)))
    movePantryItemAction(id, placeKey)
  }

  async function addPantryItem(input: { name: string; quantity: number; unit: ItemUnit; category: ItemCategory; subcategory: string | null; placeKey: string; selection?: { kind: 'product'; productId: string } | { kind: 'type'; productTypeKey: string } }) {
    const updated = await addPantryItemAction(input)
    setPantryItems(updated)
    return updated
  }
  async function addPantryPlace(area: PantryArea, name: string) {
    const place = await addPantryPlaceAction(area, name)
    setPantryPlaces((current) => [...current, place])
    return place
  }

  async function removePantryPlace(placeId: string) {
    await removePantryPlaceAction(placeId)
    setPantryPlaces((current) => current.filter((place) => place.id !== placeId))
  }

  async function setPantryCheckinDaysFor(category: PantryItem['category'], days: number | null) {
    const overrides = await setPantryCheckinDaysAction(category, days)
    setPantryCheckinDays(overrides)
    return overrides
  }

  async function setPantrySubcategoryCheckinDaysFor(category: PantryItem['category'], subcategory: string, days: number | null) {
    const overrides = await setPantrySubcategoryCheckinDaysAction(category, subcategory, days)
    setPantryCheckinSubcategoryDays(overrides)
    return overrides
  }

  // Bulk check (components/shopping/pantry-review.tsx). Saved first; the local pantry changes only
  // once the server accepted it, so a failed save leaves everything as it was. Items that ran out
  // are then added to the list one at a time (one revalidation in flight at a time, see the
  // shell's addIngredients), skipping names already waiting on the list.
  async function reviewPantry(reviewedIds: string[], goneIds: string[], addGoneToList: boolean, quantities: PantryQuantityChange[] = []) {
    const result = await reviewPantryAction({ reviewedIds, goneIds, quantities })
    const newQuantity = new Map(quantities.map((change) => [change.id, change.quantity]))
    const gone = new Set(goneIds)
    const kept = new Set(reviewedIds.filter((id) => !gone.has(id)))
    const goneItems = pantryItems.filter((item) => gone.has(item.id))
    const now = new Date().toISOString()
    setPantryItems((current) =>
      current
        .filter((item) => !gone.has(item.id))
        .map((item) => (kept.has(item.id) ? { ...item, addedAt: now, askedAt: undefined, quantity: newQuantity.get(item.id) ?? item.quantity } : item)),
    )

    // The check is saved at this point; a failure while adding to the list is reported as such.
    let addedToList = 0
    let listFailed = false
    if (addGoneToList) {
      const onList = new Set(items.filter((item) => !item.done).map((item) => item.name.trim().toLowerCase()))
      try {
        for (const pantryItem of goneItems) {
          const key = pantryItem.name.trim().toLowerCase()
          if (onList.has(key)) continue
          onList.add(key)
          const { item, notification } = await addShoppingItemAction(initialData.mainListId, pantryItem.name, { category: pantryItem.category, unit: pantryItem.unit, detail: 'došlo ze zásob' })
          setItems((current) => [...current, item])
          if (notification) setNotifications((current) => [...current, notification])
          addedToList += 1
        }
      } catch (error) {
        console.error('Adding pantry items to the shopping list failed', error)
        listFailed = true
      }
    }
    return { ...result, addedToList, listFailed }
  }

  // "Asi došlo" estimates from the household's own purchase rhythm (lib/pantry-estimate.ts).
  const pantryEstimates = useMemo(() => estimatePantry(pantryItems, purchaseHistory, today), [pantryItems, purchaseHistory, today])
  const likelyGonePantryIds = useMemo(() => new Set([...pantryEstimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [pantryEstimates])

  // Domů's "Zkontrolovat zásoby": the Zásoby tab opens straight into the check, the same way the
  // weekly notification's link does.
  const openPantryCheck = useCallback(() => setPantryCheckPending(true), [])

  // Consumes the check link: drops `kontrola=1` from the address so a reload does not reopen it.
  const consumePantryCheck = useCallback(() => {
    setPantryCheckPending(false)
    if (new URLSearchParams(window.location.search).has('kontrola')) window.history.replaceState(null, '', tabHref('Zásoby'))
  }, [])

  function setPantryTracking(id: string, tracking: PantryTracking) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, tracking, askedAt: undefined } : item)))
    setPantryTrackingAction(id, tracking)
  }

  // Resolves to whether the shared catalog took the choice or it waits for an administrator.
  function setPantryItemSubcategory(id: string, subcategory: string | null) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, subcategory } : item)))
    return setPantryItemSubcategoryAction(id, subcategory)
  }

  // The server decides (a locked product cannot change), so the state follows its answer.
  async function setPantryItemCategory(id: string, category: ItemCategory) {
    const outcome = await setPantryItemCategoryAction(id, category)
    if (outcome !== 'locked') setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, category, subcategory: null } : item)))
    return outcome
  }

  // Resolves to how many items the keyword rules placed; the server decides, the state follows it.
  async function autoCategorizePantry(): Promise<number> {
    const assigned = await autoCategorizePantryAction()
    const byId = new Map(assigned.map((entry) => [entry.id, entry.subcategory]))
    setPantryItems((current) => current.map((item) => (byId.has(item.id) ? { ...item, subcategory: byId.get(item.id) } : item)))
    return assigned.length
  }

  function adjustPantryItemQuantity(id: string, quantity: number) {
    setPantryItems((current) => current.map((item) => (item.id === id ? { ...item, quantity } : item)))
    adjustPantryItemQuantityAction(id, quantity)
  }

  return {
    pantryItems,
    setPantryItems,
    pantryPlaces,
    pantryCheckinDays,
    pantryCheckinSubcategoryDays,
    pantryCheckPending,
    pantryPrompt,
    setPantryPrompt,
    pantryEstimates,
    likelyGonePantryIds,
    offerPantryCorrection,
    addPantryItem,
    confirmPantryItem,
    removePantryItem,
    movePantryItem,
    addPantryPlace,
    removePantryPlace,
    setPantryCheckinDaysFor,
    setPantrySubcategoryCheckinDaysFor,
    reviewPantry,
    openPantryCheck,
    consumePantryCheck,
    setPantryTracking,
    setPantryItemSubcategory,
    setPantryItemCategory,
    autoCategorizePantry,
    adjustPantryItemQuantity,
  }
}
