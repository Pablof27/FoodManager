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

export function recipeToDbRow(userId: string, recipe: Recipe, position: number): DbRecipeRow {
  return {
    user_id: userId,
    id: recipe.id,
    position,
    name: recipe.name,
    description: recipe.description,
    servings_yield: recipe.servingsYield,
    prep_time_minutes: recipe.prepTimeMinutes,
    emoji: recipe.emoji,
    tags: recipe.tags,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    recipe_notes: recipe.recipeNotes,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
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
    entries: plan.entries,
    batch_overrides: plan.batchOverrides,
    checked_shopping_keys: plan.checkedShoppingKeys,
    added_to_pantry_keys: plan.addedToPantryKeys,
    extra_shopping_items: plan.extraShoppingItems,
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
): DbPantryItemRow {
  return {
    user_id: userId,
    id: item.id,
    position,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    always_available: Boolean(item.alwaysAvailable),
    min_quantity: item.minQuantity ?? null,
    updated_at: item.updatedAt,
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
      recipesToUpsert.push(recipeToDbRow(userId, recipe, idx))
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
      weekPlansToUpsert.push(weekPlanToDbRow(userId, plan, nowIso))
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
      pantryToUpsert.push(pantryItemToDbRow(userId, item, idx))
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

  if (recipesRes.error) throw recipesRes.error
  if (weekPlansRes.error) throw weekPlansRes.error
  if (pantryRes.error) throw pantryRes.error
  if (settingsRes.error) throw settingsRes.error

  return assembleSnapshotFromDbRows({
    recipesRows: (recipesRes.data ?? []) as DbRecipeRow[],
    weekPlansRows: (weekPlansRes.data ?? []) as DbWeekPlanRow[],
    pantryRows: (pantryRes.data ?? []) as DbPantryItemRow[],
    settingsRow: (settingsRes.data as DbUserSettingsRow | null) ?? null,
  })
}

export async function applyRelationalDiffToSupabase(
  client: SupabaseClient,
  userId: string,
  diff: RelationalSyncDiff,
): Promise<void> {
  if (!diff.hasChanges) return

  const operations: PromiseLike<{ error: { message: string } | null }>[] = []

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
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    throw new Error(failed.error.message)
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
): Promise<void> {
  const currentRemote = await fetchUserCloudSnapshot(client, userId)
  const diff = computeRelationalSyncDiff(
    userId,
    currentRemote.hasCloudData ? currentRemote.snapshot : null,
    targetSnapshot,
  )
  await applyRelationalDiffToSupabase(client, userId, diff)
}
