import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from '../data/seedData'
import type {
  AppDataSnapshot,
  ExtraShoppingItem,
  IngredientCategory,
  MealSlotId,
  PantryItem,
  PlannedMealEntry,
  Recipe,
  RecipeIngredient,
  RecipeNote,
  RecipeStep,
  Unit,
  UserSettings,
  WeekPlan,
} from '../types/food'
import { sanitizeRecipe, sanitizeSnapshot } from './db'

export interface DbUserSettingsRow {
  user_id: string
  enabled_slots: MealSlotId[]
  default_servings_per_meal: number
  deduct_pantry_in_shopping: boolean
  include_optional_in_shopping: boolean
  updated_at: string
}

export interface DbRecipeRow {
  user_id: string
  id: string
  position: number
  name: string
  description: string
  servings_yield: number
  prep_time_minutes: number
  emoji: string
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  recipe_notes: RecipeNote[]
  created_at: string
  updated_at: string
}

export interface DbWeekPlanRow {
  user_id: string
  week_start: string
  entries: PlannedMealEntry[]
  batch_overrides: Record<string, number>
  checked_shopping_keys: string[]
  added_to_pantry_keys: string[]
  extra_shopping_items: ExtraShoppingItem[]
  updated_at: string
}

export interface DbPantryItemRow {
  user_id: string
  id: string
  position: number
  name: string
  quantity: number
  unit: Unit
  category: IngredientCategory
  always_available: boolean
  min_quantity: number | null
  updated_at: string
}

export interface RelationalSyncDiff {
  recipesToUpsert: DbRecipeRow[]
  recipeIdsToDelete: string[]
  weekPlansToUpsert: DbWeekPlanRow[]
  weekStartsToDelete: string[]
  pantryToUpsert: DbPantryItemRow[]
  pantryIdsToDelete: string[]
  settingsToUpsert: DbUserSettingsRow | null
  hasChanges: boolean
}

export class SupabaseSyncError extends Error {
  readonly code?: string
  readonly hint?: string

  constructor(message: string, opts?: { code?: string; hint?: string }) {
    super(message)
    this.name = 'SupabaseSyncError'
    this.code = opts?.code
    this.hint = opts?.hint
  }
}

function asNonEmptyString(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined
}

function ensureValidIsoTimestamp(val: unknown, fallbackIso: string): string {
  if (typeof val === 'string' && val.trim().length > 0 && !Number.isNaN(Date.parse(val))) {
    return val
  }
  return fallbackIso
}

/**
 * Convierte errores de PostgREST / Supabase (que suelen ser objetos planos `{ message, code, details, hint }`
 * y no instancias de `Error`) en un mensaje claro y accionable para el usuario.
 */
export function formatSupabaseError(
  err: unknown,
  fallbackMessage = 'No se pudo conectar con Supabase.',
): string {
  if (err instanceof SupabaseSyncError) {
    return err.message
  }

  if (typeof err === 'string' && err.trim()) {
    return err.trim()
  }

  if (!err || typeof err !== 'object') {
    return fallbackMessage
  }

  const record = err as Record<string, unknown>
  const code = asNonEmptyString(record.code)
  const rawMessage =
    asNonEmptyString(record.message) ?? asNonEmptyString(record.error_description)
  const hint = asNonEmptyString(record.hint)
  const details = asNonEmptyString(record.details)

  if (code === '42501') {
    return `Permiso denegado en Supabase (${rawMessage ?? 'código 42501'}). Vuelve a ejecutar supabase/schema.sql en el SQL Editor para aplicar los permisos GRANT y las políticas RLS.`
  }

  if (code === 'PGRST205' || code === '42P01') {
    return `La Data API de Supabase no encuentra las tablas (${rawMessage ?? code}). Ejecuta supabase/schema.sql en el SQL Editor (incluye recarga de caché) y verifica que "public" esté expuesto en Project Settings → Data API.`
  }

  if (code === 'PGRST106') {
    return `El esquema "public" no está expuesto en Supabase (${rawMessage ?? code}). Añade "public" en Project Settings → Data API → Exposed schemas.`
  }

  if (code === 'PGRST301' || code === 'PGRST302') {
    return `Sesión o token rechazado por Supabase (${rawMessage ?? code}). Cierra sesión y vuelve a iniciar sesión con Google.`
  }

  if (rawMessage) {
    const codeSuffix = code ? ` [${code}]` : ''
    const extraHint = hint ? ` — ${hint}` : details && !details.includes('\n') ? ` (${details})` : ''
    return `${rawMessage}${codeSuffix}${extraHint}`
  }

  if (code) {
    return `${fallbackMessage} [${code}]${hint ? ` — ${hint}` : ''}`
  }

  return fallbackMessage
}

export function toSupabaseSyncError(
  err: unknown,
  fallbackMessage = 'No se pudo sincronizar con Supabase.',
): SupabaseSyncError {
  if (err instanceof SupabaseSyncError) return err
  const record = err && typeof err === 'object' ? (err as Record<string, unknown>) : undefined
  const code = asNonEmptyString(record?.code)
  const hint = asNonEmptyString(record?.hint)
  return new SupabaseSyncError(formatSupabaseError(err, fallbackMessage), { code, hint })
}

export function recipeToDbRow(
  userId: string,
  recipe: Recipe,
  position: number,
  nowIso = new Date().toISOString(),
): DbRecipeRow {
  return {
    user_id: userId,
    id: recipe.id,
    position,
    name: recipe.name || 'Receta sin nombre',
    description: recipe.description ?? '',
    servings_yield:
      Number.isFinite(recipe.servingsYield) && recipe.servingsYield > 0
        ? recipe.servingsYield
        : 2,
    prep_time_minutes: Math.max(1, Math.round(Number(recipe.prepTimeMinutes) || 20)),
    emoji: recipe.emoji || '🍲',
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    recipe_notes: Array.isArray(recipe.recipeNotes) ? recipe.recipeNotes : [],
    created_at: ensureValidIsoTimestamp(recipe.createdAt, nowIso),
    updated_at: ensureValidIsoTimestamp(recipe.updatedAt, nowIso),
  }
}

export function dbRowToRecipe(row: DbRecipeRow, fallbackIdx = 0): Recipe | null {
  return sanitizeRecipe(
    {
      id: row.id,
      name: row.name,
      description: row.description,
      servingsYield: Number(row.servings_yield),
      prepTimeMinutes: Number(row.prep_time_minutes),
      emoji: row.emoji,
      tags: row.tags,
      ingredients: row.ingredients,
      steps: row.steps,
      recipeNotes: row.recipe_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    fallbackIdx,
  )
}

export function weekPlanToDbRow(
  userId: string,
  plan: WeekPlan,
  nowIso = new Date().toISOString(),
): DbWeekPlanRow {
  return {
    user_id: userId,
    week_start: plan.weekStart,
    entries: Array.isArray(plan.entries) ? plan.entries : [],
    batch_overrides:
      plan.batchOverrides && typeof plan.batchOverrides === 'object' ? plan.batchOverrides : {},
    checked_shopping_keys: Array.isArray(plan.checkedShoppingKeys) ? plan.checkedShoppingKeys : [],
    added_to_pantry_keys: Array.isArray(plan.addedToPantryKeys) ? plan.addedToPantryKeys : [],
    extra_shopping_items: Array.isArray(plan.extraShoppingItems) ? plan.extraShoppingItems : [],
    updated_at: nowIso,
  }
}

export function dbRowToWeekPlan(row: DbWeekPlanRow): WeekPlan {
  return {
    weekStart: row.week_start,
    entries: Array.isArray(row.entries) ? row.entries : [],
    batchOverrides:
      row.batch_overrides && typeof row.batch_overrides === 'object' ? row.batch_overrides : {},
    checkedShoppingKeys: Array.isArray(row.checked_shopping_keys) ? row.checked_shopping_keys : [],
    addedToPantryKeys: Array.isArray(row.added_to_pantry_keys) ? row.added_to_pantry_keys : [],
    extraShoppingItems: Array.isArray(row.extra_shopping_items) ? row.extra_shopping_items : [],
  }
}

export function pantryItemToDbRow(
  userId: string,
  item: PantryItem,
  position: number,
  nowIso = new Date().toISOString(),
): DbPantryItemRow {
  return {
    user_id: userId,
    id: item.id,
    position,
    name: item.name || 'Ingrediente',
    quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
    unit: item.unit || 'ud',
    category: item.category || 'otros',
    always_available: Boolean(item.alwaysAvailable),
    min_quantity:
      typeof item.minQuantity === 'number' && Number.isFinite(item.minQuantity)
        ? item.minQuantity
        : null,
    updated_at: ensureValidIsoTimestamp(item.updatedAt, nowIso),
  }
}

export function dbRowToPantryItem(row: DbPantryItemRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
    category: row.category,
    alwaysAvailable: Boolean(row.always_available),
    ...(row.min_quantity !== null && row.min_quantity !== undefined
      ? { minQuantity: Number(row.min_quantity) }
      : {}),
    updatedAt: row.updated_at,
  }
}

export function settingsToDbRow(
  userId: string,
  settings: UserSettings,
  nowIso = new Date().toISOString(),
): DbUserSettingsRow {
  return {
    user_id: userId,
    enabled_slots: settings.enabledSlots,
    default_servings_per_meal: settings.defaultServingsPerMeal,
    deduct_pantry_in_shopping: settings.deductPantryInShopping,
    include_optional_in_shopping: settings.includeOptionalInShopping,
    updated_at: nowIso,
  }
}

export function dbRowToSettings(row: DbUserSettingsRow | null): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS }
  return {
    enabledSlots:
      Array.isArray(row.enabled_slots) && row.enabled_slots.length > 0
        ? row.enabled_slots
        : DEFAULT_SETTINGS.enabledSlots,
    defaultServingsPerMeal: Number(row.default_servings_per_meal) || DEFAULT_SETTINGS.defaultServingsPerMeal,
    deductPantryInShopping: Boolean(row.deduct_pantry_in_shopping),
    includeOptionalInShopping: Boolean(row.include_optional_in_shopping),
  }
}

export function assembleSnapshotFromDbRows(params: {
  recipesRows: DbRecipeRow[]
  weekPlansRows: DbWeekPlanRow[]
  pantryRows: DbPantryItemRow[]
  settingsRow: DbUserSettingsRow | null
}): { hasCloudData: boolean; snapshot: AppDataSnapshot } {
  const { recipesRows, weekPlansRows, pantryRows, settingsRow } = params

  const hasCloudData =
    settingsRow !== null ||
    recipesRows.length > 0 ||
    weekPlansRows.length > 0 ||
    pantryRows.length > 0

  const sortedRecipes = [...recipesRows].sort((a, b) => a.position - b.position)
  const recipes = sortedRecipes
    .map((r, idx) => dbRowToRecipe(r, idx))
    .filter((r): r is Recipe => r !== null)

  const weekPlans: Record<string, WeekPlan> = {}
  for (const wpRow of weekPlansRows) {
    weekPlans[wpRow.week_start] = dbRowToWeekPlan(wpRow)
  }

  const sortedPantry = [...pantryRows].sort((a, b) => a.position - b.position)
  const pantry = sortedPantry.map(dbRowToPantryItem)

  const snapshot = sanitizeSnapshot({
    version: 2,
    recipes,
    weekPlans,
    pantry,
    settings: dbRowToSettings(settingsRow),
  })

  return { hasCloudData, snapshot }
}

/**
 * Calcula únicamente las filas nuevas, modificadas o eliminadas entre dos snapshots
 * para minimizar las operaciones de red contra PostgreSQL en Supabase.
 */
export function computeRelationalSyncDiff(
  userId: string,
  prev: AppDataSnapshot | null,
  next: AppDataSnapshot,
  nowIso = new Date().toISOString(),
): RelationalSyncDiff {
  // 1. Recetas
  const prevRecipeById = new Map<string, { recipe: Recipe; pos: number }>()
  prev?.recipes.forEach((r, idx) => prevRecipeById.set(r.id, { recipe: r, pos: idx }))

  const nextRecipeIds = new Set<string>()
  const recipesToUpsert: DbRecipeRow[] = []

  next.recipes.forEach((recipe, idx) => {
    nextRecipeIds.add(recipe.id)
    const prevEntry = prevRecipeById.get(recipe.id)
    if (
      !prevEntry ||
      prevEntry.pos !== idx ||
      JSON.stringify(prevEntry.recipe) !== JSON.stringify(recipe)
    ) {
      recipesToUpsert.push(recipeToDbRow(userId, recipe, idx, nowIso))
    }
  })

  const recipeIdsToDelete: string[] = []
  for (const prevId of prevRecipeById.keys()) {
    if (!nextRecipeIds.has(prevId)) {
      recipeIdsToDelete.push(prevId)
    }
  }

  // 2. Planes semanales
  const prevWeeks = prev?.weekPlans ?? {}
  const nextWeekKeys = new Set(Object.keys(next.weekPlans))
  const weekPlansToUpsert: DbWeekPlanRow[] = []

  for (const [weekStart, plan] of Object.entries(next.weekPlans)) {
    const prevPlan = prevWeeks[weekStart]
    if (!prevPlan || JSON.stringify(prevPlan) !== JSON.stringify(plan)) {
      weekPlansToUpsert.push(
        weekPlanToDbRow(userId, { ...plan, weekStart: plan.weekStart || weekStart }, nowIso),
      )
    }
  }

  const weekStartsToDelete: string[] = []
  for (const prevWeekStart of Object.keys(prevWeeks)) {
    if (!nextWeekKeys.has(prevWeekStart)) {
      weekStartsToDelete.push(prevWeekStart)
    }
  }

  // 3. Despensa
  const prevPantryById = new Map<string, { item: PantryItem; pos: number }>()
  prev?.pantry.forEach((item, idx) => prevPantryById.set(item.id, { item, pos: idx }))

  const nextPantryIds = new Set<string>()
  const pantryToUpsert: DbPantryItemRow[] = []

  next.pantry.forEach((item, idx) => {
    nextPantryIds.add(item.id)
    const prevEntry = prevPantryById.get(item.id)
    if (
      !prevEntry ||
      prevEntry.pos !== idx ||
      JSON.stringify(prevEntry.item) !== JSON.stringify(item)
    ) {
      pantryToUpsert.push(pantryItemToDbRow(userId, item, idx, nowIso))
    }
  })

  const pantryIdsToDelete: string[] = []
  for (const prevId of prevPantryById.keys()) {
    if (!nextPantryIds.has(prevId)) {
      pantryIdsToDelete.push(prevId)
    }
  }

  // 4. Ajustes
  const settingsChanged =
    !prev || JSON.stringify(prev.settings) !== JSON.stringify(next.settings)
  const settingsToUpsert = settingsChanged
    ? settingsToDbRow(userId, next.settings, nowIso)
    : null

  const hasChanges =
    recipesToUpsert.length > 0 ||
    recipeIdsToDelete.length > 0 ||
    weekPlansToUpsert.length > 0 ||
    weekStartsToDelete.length > 0 ||
    pantryToUpsert.length > 0 ||
    pantryIdsToDelete.length > 0 ||
    settingsToUpsert !== null

  return {
    recipesToUpsert,
    recipeIdsToDelete,
    weekPlansToUpsert,
    weekStartsToDelete,
    pantryToUpsert,
    pantryIdsToDelete,
    settingsToUpsert,
    hasChanges,
  }
}

export async function fetchUserCloudSnapshot(
  client: SupabaseClient,
  userId: string,
): Promise<{ hasCloudData: boolean; snapshot: AppDataSnapshot }> {
  const [recipesRes, weekPlansRes, pantryRes, settingsRes] = await Promise.all([
    client.from('recipes').select('*').eq('user_id', userId).order('position', { ascending: true }),
    client.from('week_plans').select('*').eq('user_id', userId),
    client
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
    client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])

  if (recipesRes.error) throw toSupabaseSyncError(recipesRes.error)
  if (weekPlansRes.error) throw toSupabaseSyncError(weekPlansRes.error)
  if (pantryRes.error) throw toSupabaseSyncError(pantryRes.error)
  if (settingsRes.error) throw toSupabaseSyncError(settingsRes.error)

  // PostgREST convierte respuestas 404 con cuerpo vacío (p. ej. Data API desactivada) en data=null sin error
  if (
    !Array.isArray(recipesRes.data) ||
    !Array.isArray(weekPlansRes.data) ||
    !Array.isArray(pantryRes.data)
  ) {
    throw new SupabaseSyncError(
      'La Data API de Supabase no devolvió datos válidos (/rest/v1 respondió 404 o vacío). Verifica que "Enable Data API" esté activado y el esquema "public" expuesto en Project Settings → Data API.',
      { code: 'DATA_API_UNAVAILABLE' },
    )
  }

  return assembleSnapshotFromDbRows({
    recipesRows: recipesRes.data as DbRecipeRow[],
    weekPlansRows: weekPlansRes.data as DbWeekPlanRow[],
    pantryRows: pantryRes.data as DbPantryItemRow[],
    settingsRow: (settingsRes.data as DbUserSettingsRow | null) ?? null,
  })
}

export async function applyRelationalDiffToSupabase(
  client: SupabaseClient,
  userId: string,
  diff: RelationalSyncDiff,
): Promise<void> {
  if (!diff.hasChanges) return

  const operations: PromiseLike<{ error: unknown }>[] = []

  if (diff.recipeIdsToDelete.length > 0) {
    operations.push(
      client
        .from('recipes')
        .delete()
        .eq('user_id', userId)
        .in('id', diff.recipeIdsToDelete),
    )
  }

  if (diff.recipesToUpsert.length > 0) {
    operations.push(
      client.from('recipes').upsert(diff.recipesToUpsert, { onConflict: 'user_id,id' }),
    )
  }

  if (diff.weekStartsToDelete.length > 0) {
    operations.push(
      client
        .from('week_plans')
        .delete()
        .eq('user_id', userId)
        .in('week_start', diff.weekStartsToDelete),
    )
  }

  if (diff.weekPlansToUpsert.length > 0) {
    operations.push(
      client
        .from('week_plans')
        .upsert(diff.weekPlansToUpsert, { onConflict: 'user_id,week_start' }),
    )
  }

  if (diff.pantryIdsToDelete.length > 0) {
    operations.push(
      client
        .from('pantry_items')
        .delete()
        .eq('user_id', userId)
        .in('id', diff.pantryIdsToDelete),
    )
  }

  if (diff.pantryToUpsert.length > 0) {
    operations.push(
      client
        .from('pantry_items')
        .upsert(diff.pantryToUpsert, { onConflict: 'user_id,id' }),
    )
  }

  if (diff.settingsToUpsert) {
    operations.push(
      client
        .from('user_settings')
        .upsert(diff.settingsToUpsert, { onConflict: 'user_id' }),
    )
  }

  const results = await Promise.all(operations)
  const failed = results.find((r) => Boolean(r.error))
  if (failed?.error) {
    throw toSupabaseSyncError(failed.error, 'Error guardando cambios en Supabase.')
  }
}

/**
 * Reemplaza por completo los datos en la nube del usuario por `targetSnapshot`
 * (útil al inicializar una cuenta nueva o al importar un backup/datos locales).
 */
export async function replaceAllUserCloudData(
  client: SupabaseClient,
  userId: string,
  targetSnapshot: AppDataSnapshot,
  knownRemoteSnapshot?: AppDataSnapshot | null,
): Promise<void> {
  let prevSnapshot: AppDataSnapshot | null
  if (knownRemoteSnapshot !== undefined) {
    prevSnapshot = knownRemoteSnapshot
  } else {
    const currentRemote = await fetchUserCloudSnapshot(client, userId)
    prevSnapshot = currentRemote.hasCloudData ? currentRemote.snapshot : null
  }
  const diff = computeRelationalSyncDiff(userId, prevSnapshot, targetSnapshot)
  await applyRelationalDiffToSupabase(client, userId, diff)
}
