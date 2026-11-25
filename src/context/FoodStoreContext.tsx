import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createSeedSnapshot, DEFAULT_SETTINGS } from '../data/seedData'
import { addWeeksIso, getMondayIso } from '../lib/dates'
import {
  computeWeekRecipeSummaries,
  computeWeekShoppingList,
  createEmptyWeekPlan,
  getSuggestedPantryRestock,
} from '../lib/plannerEngine'
import { getSupabaseClient } from '../lib/supabase'
import {
  getUnitFamily,
  mergeBaseIntoUnit,
  normalizeIngredientKey,
  roundClean,
  toBaseQuantity,
} from '../lib/units'
import {
  loadAppSnapshot,
  loadUserCachedSnapshot,
  sanitizeSnapshot,
  saveAppSnapshot,
  saveUserCachedSnapshot,
} from '../storage/db'
import {
  applyRelationalDiffToSupabase,
  computeRelationalSyncDiff,
  fetchUserCloudSnapshot,
  formatSupabaseError,
  replaceAllUserCloudData,
} from '../storage/supabaseSync'
import {
  ALL_MEAL_SLOTS,
  type AppDataSnapshot,
  type DayIndex,
  type ExtraShoppingItem,
  type IngredientCategory,
  type MealSlotId,
  type PantryItem,
  type Recipe,
  type Unit,
  type UserSettings,
  type WeekPlan,
} from '../types/food'
import { useAuth } from './useAuth'
import {
  FoodStoreContext,
  type CloudSyncStatus,
  type FoodStoreContextValue,
} from './useFoodStore'

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function FoodStoreProvider({ children }: { children: ReactNode }) {
  const { user, isAuthLoading } = useAuth()
  const activeUserId = user?.id ?? null
  const targetScope = isAuthLoading ? null : activeUserId ? `user:${activeUserId}` : 'guest'

  const [hydratedScope, setHydratedScope] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<AppDataSnapshot>(() => createSeedSnapshot())
  const [activeWeekStart, setActiveWeekStart] = useState<string>(() => getMondayIso())
  const [rawCloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('syncing')
  const [rawCloudSyncError, setCloudSyncError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const isHydrated = targetScope !== null && hydratedScope === targetScope
  const cloudSyncStatus: CloudSyncStatus = !activeUserId
    ? 'local'
    : !isHydrated
      ? 'syncing'
      : rawCloudSyncStatus
  const cloudSyncError = !activeUserId || !isHydrated ? null : rawCloudSyncError

  const hydratedScopeRef = useRef<string | null>(null)
  const lastLoadedRef = useRef<AppDataSnapshot | null>(null)
  const lastSyncedCloudRef = useRef<AppDataSnapshot | null>(null)
  const latestSnapshotRef = useRef<AppDataSnapshot>(snapshot)
  const hasPendingCloudWriteRef = useRef(false)
  const lastLocalPushEndedAtRef = useRef(0)
  const syncChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    latestSnapshotRef.current = snapshot
  }, [snapshot])

  // Hidratación inicial o cambio de usuario (Modo local <-> Cuenta Google en Supabase)
  useEffect(() => {
    if (!targetScope) {
      return
    }

    let mounted = true
    hydratedScopeRef.current = null
    hasPendingCloudWriteRef.current = false

    if (!activeUserId) {
      lastSyncedCloudRef.current = null

      loadAppSnapshot().then((loaded) => {
        if (!mounted) return
        lastLoadedRef.current = loaded
        hydratedScopeRef.current = targetScope
        setSnapshot(loaded)
        setLastSyncedAt(null)
        setCloudSyncError(null)
        setHydratedScope(targetScope)
      })

      return () => {
        mounted = false
      }
    }

    void (async () => {
      const client = getSupabaseClient()
      if (!client) {
        if (!mounted) return
        setCloudSyncStatus('error')
        setCloudSyncError('Cliente de Supabase no configurado.')
        hydratedScopeRef.current = targetScope
        setHydratedScope(targetScope)
        return
      }

      try {
        const remote = await fetchUserCloudSnapshot(client, activeUserId)
        if (!mounted) return

        let resolvedSnapshot: AppDataSnapshot
        if (remote.hasCloudData) {
          resolvedSnapshot = remote.snapshot
        } else {
          // Cuenta sin datos en Supabase: inicializamos con su caché previa o con los datos locales actuales
          resolvedSnapshot =
            (await loadUserCachedSnapshot(activeUserId)) ?? (await loadAppSnapshot())
          await replaceAllUserCloudData(client, activeUserId, resolvedSnapshot, null)
        }

        if (!mounted) return
        await saveUserCachedSnapshot(activeUserId, resolvedSnapshot)
        lastSyncedCloudRef.current = resolvedSnapshot
        lastLoadedRef.current = resolvedSnapshot
        hydratedScopeRef.current = targetScope
        setSnapshot(resolvedSnapshot)
        setCloudSyncStatus('synced')
        setCloudSyncError(null)
        setLastSyncedAt(new Date().toISOString())
        setHydratedScope(targetScope)
      } catch (err: unknown) {
        if (!mounted) return
        const message = formatSupabaseError(
          err,
          'No se pudo conectar con Supabase. Mostrando copia local.',
        )
        const fallbackSnapshot =
          (await loadUserCachedSnapshot(activeUserId)) ?? (await loadAppSnapshot())
        if (!mounted) return
        lastSyncedCloudRef.current = null
        lastLoadedRef.current = fallbackSnapshot
        hydratedScopeRef.current = targetScope
        setSnapshot(fallbackSnapshot)
        setCloudSyncStatus('error')
        setCloudSyncError(message)
        setHydratedScope(targetScope)
      }
    })()

    return () => {
      mounted = false
    }
  }, [targetScope, activeUserId])

  const pushLatestToCloud = useCallback(
    (userId: string, snapToPush: AppDataSnapshot) => {
      const client = getSupabaseClient()
      if (!client) return

      setCloudSyncStatus('syncing')
      syncChainRef.current = syncChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const diff = computeRelationalSyncDiff(
            userId,
            lastSyncedCloudRef.current,
            snapToPush,
          )
          if (diff.hasChanges) {
            await applyRelationalDiffToSupabase(client, userId, diff)
          }
          lastSyncedCloudRef.current = snapToPush
          lastLocalPushEndedAtRef.current = Date.now()
          if (latestSnapshotRef.current === snapToPush) {
            hasPendingCloudWriteRef.current = false
            setCloudSyncStatus('synced')
            setCloudSyncError(null)
            setLastSyncedAt(new Date().toISOString())
          }
        })
        .catch((err: unknown) => {
          hasPendingCloudWriteRef.current = false
          setCloudSyncStatus('error')
          setCloudSyncError(
            formatSupabaseError(err, 'Error guardando cambios en Supabase.'),
          )
        })
    },
    [],
  )

  // Guardado reactivo ante ediciones del usuario (local en modo invitado o relacional en Supabase)
  useEffect(() => {
    if (!isHydrated || !targetScope || hydratedScopeRef.current !== targetScope) {
      return
    }
    if (snapshot === lastLoadedRef.current) {
      return
    }
    lastLoadedRef.current = snapshot

    if (!activeUserId) {
      void saveAppSnapshot(snapshot)
      return
    }

    void saveUserCachedSnapshot(activeUserId, snapshot)
    hasPendingCloudWriteRef.current = true

    const timer = window.setTimeout(() => {
      pushLatestToCloud(activeUserId, snapshot)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [snapshot, isHydrated, targetScope, activeUserId, pushLatestToCloud])

  const refreshFromCloud = useCallback(async (): Promise<boolean> => {
    if (!activeUserId) return false
    const client = getSupabaseClient()
    if (!client) return false

    if (hasPendingCloudWriteRef.current) {
      pushLatestToCloud(activeUserId, latestSnapshotRef.current)
      await syncChainRef.current
      return lastSyncedCloudRef.current !== null
    }

    setCloudSyncStatus('syncing')
    setCloudSyncError(null)
    try {
      const remote = await fetchUserCloudSnapshot(client, activeUserId)
      if (remote.hasCloudData) {
        await saveUserCachedSnapshot(activeUserId, remote.snapshot)
        lastSyncedCloudRef.current = remote.snapshot
        if (JSON.stringify(remote.snapshot) !== JSON.stringify(latestSnapshotRef.current)) {
          lastLoadedRef.current = remote.snapshot
          setSnapshot(remote.snapshot)
        }
      } else {
        // Las tablas del usuario están vacías (p. ej. tras aplicar permisos en schema.sql):
        // subimos el estado local actual para poblar su cuenta en la nube.
        const initialSnapshot = latestSnapshotRef.current
        await replaceAllUserCloudData(client, activeUserId, initialSnapshot, null)
        await saveUserCachedSnapshot(activeUserId, initialSnapshot)
        lastSyncedCloudRef.current = initialSnapshot
        lastLocalPushEndedAtRef.current = Date.now()
      }
      setCloudSyncStatus('synced')
      setCloudSyncError(null)
      setLastSyncedAt(new Date().toISOString())
      return true
    } catch (err: unknown) {
      setCloudSyncStatus('error')
      setCloudSyncError(
        formatSupabaseError(err, 'Error sincronizando datos desde Supabase.'),
      )
      return false
    }
  }, [activeUserId, pushLatestToCloud])

  // Sincronización automática entre pestañas/dispositivos (Realtime + volver a la app en el móvil)
  useEffect(() => {
    if (!activeUserId || !isHydrated) return
    const client = getSupabaseClient()
    if (!client) return

    let realtimeTimer: number | undefined
    const scheduleRemotePull = () => {
      if (hasPendingCloudWriteRef.current) return
      if (Date.now() - lastLocalPushEndedAtRef.current < 1500) return
      window.clearTimeout(realtimeTimer)
      realtimeTimer = window.setTimeout(() => {
        void refreshFromCloud()
      }, 600)
    }

    const channel = client
      .channel(`foodmanager-user-${activeUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recipes', filter: `user_id=eq.${activeUserId}` },
        scheduleRemotePull,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'week_plans', filter: `user_id=eq.${activeUserId}` },
        scheduleRemotePull,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pantry_items',
          filter: `user_id=eq.${activeUserId}`,
        },
        scheduleRemotePull,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${activeUserId}`,
        },
        scheduleRemotePull,
      )
      .subscribe()

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible') {
        void refreshFromCloud()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrOnline)
    window.addEventListener('online', handleVisibilityOrOnline)

    return () => {
      window.clearTimeout(realtimeTimer)
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline)
      window.removeEventListener('online', handleVisibilityOrOnline)
      void client.removeChannel(channel)
    }
  }, [activeUserId, isHydrated, refreshFromCloud])

  const importLocalGuestDataToCloud = useCallback(async (): Promise<boolean> => {
    const localGuestSnapshot = await loadAppSnapshot()
    lastLoadedRef.current = localGuestSnapshot
    latestSnapshotRef.current = localGuestSnapshot
    setSnapshot(localGuestSnapshot)

    if (!activeUserId) {
      await saveAppSnapshot(localGuestSnapshot)
      return true
    }

    const client = getSupabaseClient()
    if (!client) return false

    await saveUserCachedSnapshot(activeUserId, localGuestSnapshot)
    hasPendingCloudWriteRef.current = true
    setCloudSyncStatus('syncing')
    setCloudSyncError(null)

    let succeeded = false
    syncChainRef.current = syncChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await replaceAllUserCloudData(client, activeUserId, localGuestSnapshot)
        lastSyncedCloudRef.current = localGuestSnapshot
        lastLocalPushEndedAtRef.current = Date.now()
        hasPendingCloudWriteRef.current = false
        setCloudSyncStatus('synced')
        setCloudSyncError(null)
        setLastSyncedAt(new Date().toISOString())
        succeeded = true
      })
      .catch((err: unknown) => {
        hasPendingCloudWriteRef.current = false
        setCloudSyncStatus('error')
        setCloudSyncError(
          formatSupabaseError(err, 'Error copiando datos locales a Supabase.'),
        )
      })

    await syncChainRef.current
    return succeeded
  }, [activeUserId])

  const currentWeekPlan = useMemo<WeekPlan>(() => {
    return snapshot.weekPlans[activeWeekStart] ?? createEmptyWeekPlan(activeWeekStart)
  }, [snapshot.weekPlans, activeWeekStart])

  const weekRecipeSummaries = useMemo(() => {
    return computeWeekRecipeSummaries(currentWeekPlan, snapshot.recipes)
  }, [currentWeekPlan, snapshot.recipes])

  const weekShopping = useMemo(() => {
    return computeWeekShoppingList(
      currentWeekPlan,
      snapshot.recipes,
      snapshot.pantry,
      snapshot.settings.deductPantryInShopping,
      snapshot.settings.includeOptionalInShopping,
    )
  }, [
    currentWeekPlan,
    snapshot.recipes,
    snapshot.pantry,
    snapshot.settings.deductPantryInShopping,
    snapshot.settings.includeOptionalInShopping,
  ])

  const updateCurrentWeek = useCallback(
    (updater: (plan: WeekPlan) => WeekPlan) => {
      setSnapshot((prev) => {
        const basePlan = prev.weekPlans[activeWeekStart] ?? createEmptyWeekPlan(activeWeekStart)
        const updatedPlan = updater(basePlan)
        return {
          ...prev,
          weekPlans: {
            ...prev.weekPlans,
            [activeWeekStart]: updatedPlan,
          },
        }
      })
    },
    [activeWeekStart],
  )

  const goToWeekOffset = useCallback((deltaWeeks: number) => {
    setActiveWeekStart((prev) => addWeeksIso(prev, deltaWeeks))
  }, [])

  const goToCurrentWeek = useCallback(() => {
    setActiveWeekStart(getMondayIso())
  }, [])

  // --- Recetas ---
  const saveRecipe = useCallback(
    (recipeInput: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Recipe => {
      const nowIso = new Date().toISOString()
      const finalId = recipeInput.id ?? makeId('rec')
      let saved!: Recipe

      setSnapshot((prev) => {
        const existing = prev.recipes.find((r) => r.id === finalId)
        saved = {
          ...recipeInput,
          id: finalId,
          servingsYield: Math.max(1, roundClean(recipeInput.servingsYield || 1)),
          prepTimeMinutes: Math.max(1, Math.round(recipeInput.prepTimeMinutes || 15)),
          createdAt: existing?.createdAt ?? nowIso,
          updatedAt: nowIso,
        }
        const nextRecipes = existing
          ? prev.recipes.map((r) => (r.id === finalId ? saved : r))
          : [saved, ...prev.recipes]
        return { ...prev, recipes: nextRecipes }
      })

      return saved
    },
    [],
  )

  const deleteRecipe = useCallback((recipeId: string) => {
    setSnapshot((prev) => {
      const nextWeekPlans: Record<string, WeekPlan> = {}
      for (const [weekKey, plan] of Object.entries(prev.weekPlans)) {
        const nextOverrides = { ...plan.batchOverrides }
        delete nextOverrides[recipeId]
        nextWeekPlans[weekKey] = {
          ...plan,
          entries: plan.entries.filter((e) => e.recipeId !== recipeId),
          batchOverrides: nextOverrides,
        }
      }
      return {
        ...prev,
        recipes: prev.recipes.filter((r) => r.id !== recipeId),
        weekPlans: nextWeekPlans,
      }
    })
  }, [])

  const duplicateRecipe = useCallback(
    (recipeId: string): Recipe | null => {
      const original = snapshot.recipes.find((r) => r.id === recipeId)
      if (!original) return null
      return saveRecipe({
        name: `${original.name} (copia)`,
        description: original.description,
        servingsYield: original.servingsYield,
        prepTimeMinutes: original.prepTimeMinutes,
        emoji: original.emoji,
        tags: [...original.tags],
        ingredients: original.ingredients.map((ing) => ({
          ...ing,
          id: makeId('ing'),
          ...(ing.substitutes ? { substitutes: [...ing.substitutes] } : {}),
        })),
        steps: original.steps.map((st) => ({
          ...st,
          id: makeId('step'),
          notes: st.notes.map((n) => ({ ...n, id: makeId('note') })),
        })),
        recipeNotes: original.recipeNotes.map((n) => ({ ...n, id: makeId('rnote') })),
      })
    },
    [snapshot.recipes, saveRecipe],
  )

  // --- Planificador semanal y gestión de lotes ---
  const addMealEntry = useCallback(
    (day: DayIndex, slot: MealSlotId, recipeId: string, servings: number, note?: string) => {
      const safeServings = Math.max(0.5, roundClean(servings))
      updateCurrentWeek((plan) => {
        // Si ya existe la misma receta en el mismo día y franja, sumamos raciones para mantener limpio el hueco
        const existingIdx = plan.entries.findIndex(
          (e) => e.day === day && e.slot === slot && e.recipeId === recipeId,
        )
        if (existingIdx >= 0) {
          const nextEntries = [...plan.entries]
          const current = nextEntries[existingIdx]
          nextEntries[existingIdx] = {
            ...current,
            servings: roundClean(current.servings + safeServings),
            note: note ?? current.note,
          }
          return { ...plan, entries: nextEntries }
        }
        return {
          ...plan,
          entries: [
            ...plan.entries,
            {
              id: makeId('ent'),
              day,
              slot,
              recipeId,
              servings: safeServings,
              note,
            },
          ],
        }
      })
    },
    [updateCurrentWeek],
  )

  const updateMealEntryServings = useCallback(
    (entryId: string, servings: number) => {
      if (servings <= 0) {
        updateCurrentWeek((plan) => ({
          ...plan,
          entries: plan.entries.filter((e) => e.id !== entryId),
        }))
        return
      }
      updateCurrentWeek((plan) => ({
        ...plan,
        entries: plan.entries.map((e) =>
          e.id === entryId ? { ...e, servings: roundClean(servings) } : e,
        ),
      }))
    },
    [updateCurrentWeek],
  )

  const removeMealEntry = useCallback(
    (entryId: string) => {
      updateCurrentWeek((plan) => ({
        ...plan,
        entries: plan.entries.filter((e) => e.id !== entryId),
      }))
    },
    [updateCurrentWeek],
  )

  const setBatchOverride = useCallback(
    (recipeId: string, batches: number | null) => {
      updateCurrentWeek((plan) => {
        const nextOverrides = { ...plan.batchOverrides }
        if (batches === null || batches <= 0) {
          delete nextOverrides[recipeId]
        } else {
          nextOverrides[recipeId] = roundClean(batches)
        }
        return { ...plan, batchOverrides: nextOverrides }
      })
    },
    [updateCurrentWeek],
  )

  const prepareRecipeBatchForWeek = useCallback(
    (recipeId: string, batches = 1) => {
      updateCurrentWeek((plan) => {
        const current = plan.batchOverrides[recipeId] ?? 0
        const nextVal = current > 0 ? roundClean(current + batches) : roundClean(batches)
        return {
          ...plan,
          batchOverrides: {
            ...plan.batchOverrides,
            [recipeId]: Math.max(0.5, nextVal),
          },
        }
      })
    },
    [updateCurrentWeek],
  )

  const removeRecipeFromWeek = useCallback(
    (recipeId: string) => {
      updateCurrentWeek((plan) => {
        const nextOverrides = { ...plan.batchOverrides }
        delete nextOverrides[recipeId]
        return {
          ...plan,
          entries: plan.entries.filter((e) => e.recipeId !== recipeId),
          batchOverrides: nextOverrides,
        }
      })
    },
    [updateCurrentWeek],
  )

  const copyFromPreviousWeek = useCallback((): boolean => {
    const prevMonday = addWeeksIso(activeWeekStart, -1)
    const prevPlan = snapshot.weekPlans[prevMonday]
    if (!prevPlan || (prevPlan.entries.length === 0 && Object.keys(prevPlan.batchOverrides).length === 0)) {
      return false
    }
    updateCurrentWeek(() => ({
      weekStart: activeWeekStart,
      entries: prevPlan.entries.map((e) => ({ ...e, id: makeId('ent') })),
      batchOverrides: { ...prevPlan.batchOverrides },
      checkedShoppingKeys: [],
      addedToPantryKeys: [],
      extraShoppingItems: [],
    }))
    return true
  }, [activeWeekStart, snapshot.weekPlans, updateCurrentWeek])

  const clearCurrentWeek = useCallback(() => {
    updateCurrentWeek(() => createEmptyWeekPlan(activeWeekStart))
  }, [activeWeekStart, updateCurrentWeek])

  // --- Lista de la compra ---
  const toggleShoppingItemChecked = useCallback(
    (itemKey: string) => {
      updateCurrentWeek((plan) => {
        const exists = plan.checkedShoppingKeys.includes(itemKey)
        const checkedShoppingKeys = exists
          ? plan.checkedShoppingKeys.filter((k) => k !== itemKey)
          : [...plan.checkedShoppingKeys, itemKey]
        return { ...plan, checkedShoppingKeys }
      })
    },
    [updateCurrentWeek],
  )

  const addExtraShoppingItem = useCallback(
    (input: { name: string; quantity: number; unit: Unit; category: IngredientCategory }) => {
      const trimmed = input.name.trim()
      if (!trimmed) return
      const safeQty = input.unit === 'al_gusto' ? 0 : Math.max(0.1, roundClean(input.quantity || 1))
      const norm = normalizeIngredientKey(trimmed)
      const fam = getUnitFamily(input.unit)

      updateCurrentWeek((plan) => {
        const existingIdx = plan.extraShoppingItems.findIndex(
          (ext) =>
            !ext.checked &&
            normalizeIngredientKey(ext.name) === norm &&
            getUnitFamily(ext.unit) === fam,
        )

        if (existingIdx >= 0) {
          const existing = plan.extraShoppingItems[existingIdx]
          const addedBase = toBaseQuantity(safeQty, input.unit)
          const merged = mergeBaseIntoUnit(existing.quantity, existing.unit, addedBase)
          const nextExtras = [...plan.extraShoppingItems]
          nextExtras[existingIdx] = {
            ...existing,
            quantity: merged.quantity,
            unit: merged.unit,
          }
          return { ...plan, extraShoppingItems: nextExtras }
        }

        const item: ExtraShoppingItem = {
          id: makeId('ext'),
          name: trimmed,
          quantity: safeQty,
          unit: input.unit,
          category: input.category,
          checked: false,
        }
        return {
          ...plan,
          extraShoppingItems: [...plan.extraShoppingItems, item],
        }
      })
    },
    [updateCurrentWeek],
  )

  const updateExtraShoppingItemQuantity = useCallback(
    (id: string, quantity: number) => {
      updateCurrentWeek((plan) => {
        const target = plan.extraShoppingItems.find((item) => item.id === id)
        if (!target) return plan
        if (target.unit !== 'al_gusto' && quantity <= 0) {
          return {
            ...plan,
            extraShoppingItems: plan.extraShoppingItems.filter((item) => item.id !== id),
          }
        }
        return {
          ...plan,
          extraShoppingItems: plan.extraShoppingItems.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity: item.unit === 'al_gusto' ? 0 : roundClean(quantity),
                }
              : item,
          ),
        }
      })
    },
    [updateCurrentWeek],
  )

  const addPantryItemsToShopping = useCallback(
    (items: PantryItem[]): number => {
      if (items.length === 0) return 0
      const autoToBuyNorms = new Set(
        weekShopping.toBuyItems.filter((i) => !i.checked).map((i) => i.normalizedName),
      )

      let addedCount = 0
      updateCurrentWeek((plan) => {
        const nextExtras = [...plan.extraShoppingItems]

        for (const pItem of items) {
          const trimmed = pItem.name.trim()
          const norm = normalizeIngredientKey(trimmed)
          if (!norm) continue

          const suggested = getSuggestedPantryRestock(pItem)
          const fam = getUnitFamily(suggested.unit)

          const existingUncheckedIdx = nextExtras.findIndex(
            (ext) =>
              !ext.checked &&
              normalizeIngredientKey(ext.name) === norm &&
              getUnitFamily(ext.unit) === fam,
          )

          // En reposición múltiple omitimos los que ya están pendientes en la cesta;
          // en adición individual (items.length === 1) sumamos otro lote sugerido si ya estaba
          if (items.length > 1) {
            const anyUnchecked = nextExtras.some(
              (ext) => !ext.checked && normalizeIngredientKey(ext.name) === norm,
            )
            if (anyUnchecked || autoToBuyNorms.has(norm)) {
              continue
            }
          }

          if (existingUncheckedIdx >= 0) {
            const existing = nextExtras[existingUncheckedIdx]
            const addedBase = toBaseQuantity(suggested.quantity, suggested.unit)
            const merged = mergeBaseIntoUnit(existing.quantity, existing.unit, addedBase)
            nextExtras[existingUncheckedIdx] = {
              ...existing,
              quantity: merged.quantity,
              unit: merged.unit,
            }
            addedCount += 1
          } else {
            nextExtras.push({
              id: makeId('ext'),
              name: trimmed,
              quantity: suggested.quantity,
              unit: suggested.unit,
              category: pItem.category,
              checked: false,
            })
            addedCount += 1
          }
        }

        return addedCount > 0 ? { ...plan, extraShoppingItems: nextExtras } : plan
      })

      return addedCount
    },
    [updateCurrentWeek, weekShopping.toBuyItems],
  )

  const toggleExtraShoppingItem = useCallback(
    (id: string) => {
      updateCurrentWeek((plan) => ({
        ...plan,
        extraShoppingItems: plan.extraShoppingItems.map((item) =>
          item.id === id ? { ...item, checked: !item.checked } : item,
        ),
      }))
    },
    [updateCurrentWeek],
  )

  const removeExtraShoppingItem = useCallback(
    (id: string) => {
      updateCurrentWeek((plan) => ({
        ...plan,
        extraShoppingItems: plan.extraShoppingItems.filter((item) => item.id !== id),
      }))
    },
    [updateCurrentWeek],
  )

  const clearCheckedExtraItems = useCallback(() => {
    updateCurrentWeek((plan) => ({
      ...plan,
      extraShoppingItems: plan.extraShoppingItems.filter((item) => !item.checked),
    }))
  }, [updateCurrentWeek])

  const transferCheckedItemsToPantry = useCallback((): number => {
    const eligibleAuto = weekShopping.toBuyItems.filter(
      (item) => item.checked && !item.addedToPantry,
    )
    const alreadyTransferredSet = new Set(currentWeekPlan.addedToPantryKeys)
    const eligibleExtras = currentWeekPlan.extraShoppingItems.filter(
      (ext) => ext.checked && !alreadyTransferredSet.has(`extra::${ext.id}`),
    )

    const totalTransferred = eligibleAuto.length + eligibleExtras.length
    if (totalTransferred === 0) return 0

    const nowIso = new Date().toISOString()

    setSnapshot((prev) => {
      const nextPantry = [...prev.pantry]

      const upsertIntoPantry = (
        displayName: string,
        addedBaseQty: number,
        unit: Unit,
        category: IngredientCategory,
      ) => {
        const norm = normalizeIngredientKey(displayName)
        const targetFamily = getUnitFamily(unit)

        const matchIdx = nextPantry.findIndex((p) => {
          const pNorm = normalizeIngredientKey(p.name)
          if (pNorm !== norm) return false
          return getUnitFamily(p.unit) === targetFamily
        })

        if (matchIdx >= 0) {
          const existing = nextPantry[matchIdx]
          const merged = mergeBaseIntoUnit(existing.quantity, existing.unit, addedBaseQty)
          nextPantry[matchIdx] = {
            ...existing,
            quantity: merged.quantity,
            unit: merged.unit,
            updatedAt: nowIso,
          }
        } else {
          const basicIdx = nextPantry.findIndex(
            (p) => normalizeIngredientKey(p.name) === norm && Boolean(p.alwaysAvailable),
          )
          if (basicIdx >= 0) {
            nextPantry[basicIdx] = {
              ...nextPantry[basicIdx],
              updatedAt: nowIso,
            }
          } else {
            const baseConverted = mergeBaseIntoUnit(0, unit, addedBaseQty)
            nextPantry.unshift({
              id: makeId('pan'),
              name: displayName,
              quantity: baseConverted.quantity,
              unit: baseConverted.unit,
              category,
              alwaysAvailable: unit === 'al_gusto',
              updatedAt: nowIso,
            })
          }
        }
      }

      for (const item of eligibleAuto) {
        upsertIntoPantry(item.displayName, item.netBaseQuantity, item.netUnit, item.category)
      }

      for (const ext of eligibleExtras) {
        const baseQty = toBaseQuantity(ext.quantity, ext.unit)
        upsertIntoPantry(ext.name, baseQty, ext.unit, ext.category)
      }

      const basePlan = prev.weekPlans[activeWeekStart] ?? createEmptyWeekPlan(activeWeekStart)
      const newlyAddedKeys = [
        ...eligibleAuto.map((i) => i.key),
        ...eligibleExtras.map((e) => `extra::${e.id}`),
      ]

      return {
        ...prev,
        pantry: nextPantry,
        weekPlans: {
          ...prev.weekPlans,
          [activeWeekStart]: {
            ...basePlan,
            addedToPantryKeys: Array.from(
              new Set([...basePlan.addedToPantryKeys, ...newlyAddedKeys]),
            ),
          },
        },
      }
    })

    return totalTransferred
  }, [activeWeekStart, currentWeekPlan, weekShopping.toBuyItems])

  // --- Despensa ---
  const savePantryItem = useCallback(
    (input: Omit<PantryItem, 'id' | 'updatedAt'> & { id?: string }) => {
      const nowIso = new Date().toISOString()
      const trimmedName = input.name.trim()
      if (!trimmedName) return

      setSnapshot((prev) => {
        if (input.id) {
          return {
            ...prev,
            pantry: prev.pantry.map((item) =>
              item.id === input.id
                ? {
                    ...item,
                    ...input,
                    name: trimmedName,
                    quantity: input.unit === 'al_gusto' ? 0 : Math.max(0, roundClean(input.quantity)),
                    updatedAt: nowIso,
                  }
                : item,
            ),
          }
        }

        // Si ya existe el mismo ingrediente en la misma familia de unidad, sumamos o actualizamos
        const norm = normalizeIngredientKey(trimmedName)
        const fam = getUnitFamily(input.unit)
        const existingIdx = prev.pantry.findIndex(
          (p) => normalizeIngredientKey(p.name) === norm && getUnitFamily(p.unit) === fam,
        )

        if (existingIdx >= 0 && !input.alwaysAvailable) {
          const existing = prev.pantry[existingIdx]
          const addedBase = toBaseQuantity(input.quantity, input.unit)
          const merged = mergeBaseIntoUnit(existing.quantity, existing.unit, addedBase)
          const nextPantry = [...prev.pantry]
          nextPantry[existingIdx] = {
            ...existing,
            quantity: merged.quantity,
            unit: merged.unit,
            category: input.category,
            minQuantity: input.minQuantity ?? existing.minQuantity,
            updatedAt: nowIso,
          }
          return { ...prev, pantry: nextPantry }
        }

        const newItem: PantryItem = {
          id: makeId('pan'),
          name: trimmedName,
          quantity: input.unit === 'al_gusto' ? 0 : Math.max(0, roundClean(input.quantity)),
          unit: input.unit,
          category: input.category,
          alwaysAvailable: input.alwaysAvailable,
          minQuantity: input.minQuantity,
          updatedAt: nowIso,
        }
        return { ...prev, pantry: [newItem, ...prev.pantry] }
      })
    },
    [],
  )

  const adjustPantryQuantity = useCallback((id: string, delta: number) => {
    const nowIso = new Date().toISOString()
    setSnapshot((prev) => ({
      ...prev,
      pantry: prev.pantry.map((item) => {
        if (item.id !== id || item.unit === 'al_gusto') return item
        const step =
          item.unit === 'g' || item.unit === 'ml'
            ? delta * 50
            : item.unit === 'kg' || item.unit === 'l'
              ? delta * 0.25
              : delta
        return {
          ...item,
          quantity: Math.max(0, roundClean(item.quantity + step)),
          updatedAt: nowIso,
        }
      }),
    }))
  }, [])

  const deletePantryItem = useCallback((id: string) => {
    setSnapshot((prev) => ({
      ...prev,
      pantry: prev.pantry.filter((item) => item.id !== id),
    }))
  }, [])

  // --- Ajustes y datos ---
  const updateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSnapshot((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...partial,
      },
    }))
  }, [])

  const toggleMealSlot = useCallback((slotId: MealSlotId) => {
    setSnapshot((prev) => {
      const current = prev.settings.enabledSlots
      const exists = current.includes(slotId)
      if (exists && current.length <= 1) {
        // Mantener siempre al menos 1 franja visible
        return prev
      }
      const nextUnordered = exists
        ? current.filter((s) => s !== slotId)
        : [...current, slotId]

      const canonicalOrder = ALL_MEAL_SLOTS.map((s) => s.id)
      const enabledSlots = canonicalOrder.filter((id) => nextUnordered.includes(id))

      return {
        ...prev,
        settings: {
          ...prev.settings,
          enabledSlots,
        },
      }
    })
  }, [])

  const knownIngredientSuggestions = useMemo(() => {
    const map = new Map<string, { name: string; unit: Unit; category: IngredientCategory }>()
    for (const p of snapshot.pantry) {
      const key = normalizeIngredientKey(p.name)
      if (key && !map.has(key)) {
        map.set(key, { name: p.name, unit: p.unit, category: p.category })
      }
    }
    for (const r of snapshot.recipes) {
      for (const ing of r.ingredients) {
        if (!ing.genericGroup) {
          const key = normalizeIngredientKey(ing.name)
          if (key && !map.has(key)) {
            map.set(key, { name: ing.name, unit: ing.unit, category: ing.category })
          }
        }
        if (ing.substitutes) {
          for (const sub of ing.substitutes) {
            const subKey = normalizeIngredientKey(sub)
            if (subKey && !map.has(subKey)) {
              map.set(subKey, { name: sub, unit: ing.unit, category: ing.category })
            }
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [snapshot.pantry, snapshot.recipes])

  const exportDataJson = useCallback((): string => {
    return JSON.stringify(snapshot, null, 2)
  }, [snapshot])

  const importDataJson = useCallback((jsonText: string) => {
    const parsed = JSON.parse(jsonText) as Partial<AppDataSnapshot>
    const sanitized = sanitizeSnapshot(parsed)
    setSnapshot(sanitized)
  }, [])

  const restoreDemoData = useCallback(() => {
    const seed = createSeedSnapshot()
    setSnapshot(seed)
    setActiveWeekStart(getMondayIso())
  }, [])

  const clearAllData = useCallback(() => {
    setSnapshot({
      version: 2,
      recipes: [],
      weekPlans: {},
      pantry: [],
      settings: DEFAULT_SETTINGS,
    })
  }, [])

  const value = useMemo<FoodStoreContextValue>(
    () => ({
      isHydrated,
      snapshot,
      cloudSyncStatus,
      cloudSyncError,
      lastSyncedAt,
      refreshFromCloud,
      importLocalGuestDataToCloud,
      activeWeekStart,
      setActiveWeekStart,
      goToWeekOffset,
      goToCurrentWeek,
      currentWeekPlan,
      weekRecipeSummaries,
      weekShopping,
      saveRecipe,
      deleteRecipe,
      duplicateRecipe,
      addMealEntry,
      updateMealEntryServings,
      removeMealEntry,
      setBatchOverride,
      prepareRecipeBatchForWeek,
      removeRecipeFromWeek,
      copyFromPreviousWeek,
      clearCurrentWeek,
      toggleShoppingItemChecked,
      addExtraShoppingItem,
      updateExtraShoppingItemQuantity,
      addPantryItemsToShopping,
      toggleExtraShoppingItem,
      removeExtraShoppingItem,
      clearCheckedExtraItems,
      transferCheckedItemsToPantry,
      savePantryItem,
      adjustPantryQuantity,
      deletePantryItem,
      updateSettings,
      toggleMealSlot,
      knownIngredientSuggestions,
      exportDataJson,
      importDataJson,
      restoreDemoData,
      clearAllData,
    }),
    [
      isHydrated,
      snapshot,
      cloudSyncStatus,
      cloudSyncError,
      lastSyncedAt,
      refreshFromCloud,
      importLocalGuestDataToCloud,
      activeWeekStart,
      goToWeekOffset,
      goToCurrentWeek,
      currentWeekPlan,
      weekRecipeSummaries,
      weekShopping,
      saveRecipe,
      deleteRecipe,
      duplicateRecipe,
      addMealEntry,
      updateMealEntryServings,
      removeMealEntry,
      setBatchOverride,
      prepareRecipeBatchForWeek,
      removeRecipeFromWeek,
      copyFromPreviousWeek,
      clearCurrentWeek,
      toggleShoppingItemChecked,
      addExtraShoppingItem,
      updateExtraShoppingItemQuantity,
      addPantryItemsToShopping,
      toggleExtraShoppingItem,
      removeExtraShoppingItem,
      clearCheckedExtraItems,
      transferCheckedItemsToPantry,
      savePantryItem,
      adjustPantryQuantity,
      deletePantryItem,
      updateSettings,
      toggleMealSlot,
      knownIngredientSuggestions,
      exportDataJson,
      importDataJson,
      restoreDemoData,
      clearAllData,
    ],
  )

  return <FoodStoreContext.Provider value={value}>{children}</FoodStoreContext.Provider>
}
