import { createSeedSnapshot, DEFAULT_SETTINGS } from '../data/seedData'
import type {
  AppDataSnapshot,
  Recipe,
  RecipeIngredient,
  RecipeNote,
  RecipeStep,
} from '../types/food'

const DB_NAME = 'foodmanager_db'
const DB_VERSION = 1
const STORE_NAME = 'snapshots'
const SNAPSHOT_KEY = 'current'
const LOCAL_STORAGE_FALLBACK_KEY = 'foodmanager_snapshot_v1'
const SNAPSHOT_API_ENDPOINT = '/api/snapshot'

function sanitizeNotesList(rawNotes: unknown, idPrefix: string): RecipeNote[] {
  if (!Array.isArray(rawNotes)) return []
  const result: RecipeNote[] = []
  rawNotes.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return
    const obj = item as Record<string, unknown>
    const text = typeof obj.text === 'string' ? obj.text.trim() : ''
    if (!text) return
    const type = obj.type === 'recordatorio' ? 'recordatorio' : 'tip'
    const id = typeof obj.id === 'string' && obj.id ? obj.id : `${idPrefix}-${idx + 1}`
    result.push({ id, type, text })
  })
  return result
}

export function sanitizeRecipe(raw: unknown, fallbackIdx = 0): Recipe | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' && r.id ? r.id : `rec-migrated-${fallbackIdx}`
  const name = typeof r.name === 'string' ? r.name : 'Receta sin nombre'

  const rawIngredients = Array.isArray(r.ingredients) ? r.ingredients : []
  const ingredients: RecipeIngredient[] = rawIngredients
    .filter((ing): ing is Record<string, unknown> => Boolean(ing && typeof ing === 'object'))
    .map((ing, idx) => ({
      id: typeof ing.id === 'string' && ing.id ? ing.id : `${id}-ing-${idx + 1}`,
      name: typeof ing.name === 'string' ? ing.name : '',
      quantity: typeof ing.quantity === 'number' && Number.isFinite(ing.quantity) ? ing.quantity : 1,
      unit: (typeof ing.unit === 'string' ? ing.unit : 'ud') as RecipeIngredient['unit'],
      category: (typeof ing.category === 'string'
        ? ing.category
        : 'otros') as RecipeIngredient['category'],
      optional: Boolean(ing.optional),
    }))
    .filter((ing) => ing.name.trim().length > 0)

  const rawSteps = Array.isArray(r.steps) ? r.steps : []
  const steps: RecipeStep[] = []
  rawSteps.forEach((stepItem, idx) => {
    if (typeof stepItem === 'string') {
      const trimmed = stepItem.trim()
      if (trimmed) {
        steps.push({
          id: `${id}-step-${idx + 1}`,
          text: trimmed,
          optional: false,
          notes: [],
        })
      }
      return
    }
    if (stepItem && typeof stepItem === 'object') {
      const sObj = stepItem as Record<string, unknown>
      const text = typeof sObj.text === 'string' ? sObj.text.trim() : ''
      if (!text) return
      const stepId =
        typeof sObj.id === 'string' && sObj.id ? sObj.id : `${id}-step-${idx + 1}`
      steps.push({
        id: stepId,
        text,
        optional: Boolean(sObj.optional),
        notes: sanitizeNotesList(sObj.notes, `${stepId}-note`),
      })
    }
  })

  let recipeNotes = sanitizeNotesList(r.recipeNotes, `${id}-rnote`)
  if (recipeNotes.length === 0 && typeof r.notes === 'string' && r.notes.trim()) {
    recipeNotes = [
      {
        id: `${id}-rnote-legacy`,
        type: 'tip',
        text: r.notes.trim(),
      },
    ]
  }

  const nowIso = new Date().toISOString()

  return {
    id,
    name,
    description: typeof r.description === 'string' ? r.description : '',
    servingsYield:
      typeof r.servingsYield === 'number' && r.servingsYield >= 1 ? r.servingsYield : 2,
    prepTimeMinutes:
      typeof r.prepTimeMinutes === 'number' && r.prepTimeMinutes >= 1
        ? Math.round(r.prepTimeMinutes)
        : 20,
    emoji: typeof r.emoji === 'string' && r.emoji ? r.emoji : '🍲',
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t): t is string => typeof t === 'string')
      : [],
    ingredients,
    steps,
    recipeNotes,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : nowIso,
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Error abriendo IndexedDB'))
  })
}

export function sanitizeSnapshot(raw: Partial<AppDataSnapshot> | null | undefined): AppDataSnapshot {
  if (!raw || typeof raw !== 'object') {
    return createSeedSnapshot()
  }
  const migratedRecipes = Array.isArray(raw.recipes)
    ? raw.recipes
        .map((r, idx) => sanitizeRecipe(r, idx))
        .filter((r): r is Recipe => r !== null)
    : []

  return {
    version: 2,
    recipes: migratedRecipes,
    weekPlans: raw.weekPlans && typeof raw.weekPlans === 'object' ? raw.weekPlans : {},
    pantry: Array.isArray(raw.pantry) ? raw.pantry : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings ?? {}),
      enabledSlots:
        Array.isArray(raw.settings?.enabledSlots) && raw.settings.enabledSlots.length > 0
          ? raw.settings.enabledSlots
          : DEFAULT_SETTINGS.enabledSlots,
    },
  }
}

async function persistBrowserStores(snapshot: AppDataSnapshot): Promise<void> {
  try {
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignorar cuotas de localStorage si aplica
  }

  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(snapshot, SNAPSHOT_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Guardado ya respaldado en localStorage
  }
}

async function loadDiskSnapshot(): Promise<
  { status: 'found'; snapshot: AppDataSnapshot } | { status: 'empty' } | { status: 'unavailable' }
> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return { status: 'unavailable' }
  }
  try {
    const res = await fetch(SNAPSHOT_API_ENDPOINT, { cache: 'no-store' })
    if (res.status === 204) {
      return { status: 'empty' }
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (res.ok && contentType.includes('application/json')) {
      const raw = (await res.json()) as Partial<AppDataSnapshot>
      return { status: 'found', snapshot: sanitizeSnapshot(raw) }
    }
  } catch {
    // Servidor estático sin endpoint local
  }
  return { status: 'unavailable' }
}

async function saveDiskSnapshot(snapshot: AppDataSnapshot): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return
  try {
    await fetch(SNAPSHOT_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
  } catch {
    // Ignorar cuando se ejecuta sin backend Vite local
  }
}

export async function loadAppSnapshot(): Promise<AppDataSnapshot> {
  const diskResult = await loadDiskSnapshot()
  if (diskResult.status === 'found') {
    void persistBrowserStores(diskResult.snapshot)
    return diskResult.snapshot
  }

  try {
    const db = await openDatabase()
    const stored = await new Promise<AppDataSnapshot | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(SNAPSHOT_KEY)
      req.onsuccess = () => resolve(req.result as AppDataSnapshot | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()

    if (stored) {
      const sanitized = sanitizeSnapshot(stored)
      if (diskResult.status === 'empty') {
        void saveDiskSnapshot(sanitized)
      }
      return sanitized
    }
  } catch {
    // Fallback transparente a localStorage si IndexedDB no está disponible
  }

  try {
    const fallbackRaw = localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY)
    if (fallbackRaw) {
      const sanitized = sanitizeSnapshot(JSON.parse(fallbackRaw) as Partial<AppDataSnapshot>)
      if (diskResult.status === 'empty') {
        void saveDiskSnapshot(sanitized)
      }
      return sanitized
    }
  } catch {
    // Ignorar errores de parseo y crear semilla inicial
  }

  const seed = createSeedSnapshot()
  await saveAppSnapshot(seed)
  return seed
}

export async function saveAppSnapshot(snapshot: AppDataSnapshot): Promise<void> {
  await Promise.all([persistBrowserStores(snapshot), saveDiskSnapshot(snapshot)])
}
