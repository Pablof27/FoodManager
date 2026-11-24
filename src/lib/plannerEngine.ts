import type {
  IngredientCategory,
  PantryItem,
  Recipe,
  Unit,
  WeekPlan,
} from '../types/food'
import { CATEGORY_ORDER } from '../types/food'
import {
  formatNumberEs,
  formatUnitLabel,
  fromBaseQuantity,
  getUnitFamily,
  normalizeIngredientKey,
  roundClean,
  toBaseQuantity,
  type UnitFamily,
} from './units'

export interface WeekRecipeBatchSummary {
  recipe: Recipe
  /** Raciones totales colocadas en huecos del calendario esta semana */
  assignedServings: number
  /** Lotes recomendados automáticamente para cubrir las raciones asignadas */
  recommendedBatches: number
  /** Lotes efectivos que se cocinarán y comprarán (manual si hay override, si no recomendado) */
  batchesToCook: number
  hasManualOverride: boolean
  /** Raciones totales que salen al cocinar `batchesToCook` lotes */
  producedServings: number
  /** Positivo = sobran raciones por asignar/guardar; 0 = cuadrado; negativo = faltan raciones */
  remainingServings: number
}

export interface ShoppingItemSource {
  recipeId: string
  recipeName: string
  batches: number
  formattedAmount: string
  optional?: boolean
}

export interface ComputedShoppingItem {
  /** Clave estable por ingrediente + familia de unidad */
  key: string
  normalizedName: string
  displayName: string
  category: IngredientCategory
  family: UnitFamily
  grossBaseQuantity: number
  grossFormatted: string
  /** Verdadero cuando todos los usos de este ingrediente en la semana son opcionales */
  isPurelyOptional: boolean
  /** Cantidad parcial opcional formateada cuando mezcla usos indispensables y opcionales */
  optionalPortionFormatted: string | null
  pantryAvailableBaseQuantity: number
  pantryDeductedBaseQuantity: number
  pantryDeductedFormatted: string | null
  coveredByAlwaysAvailable: boolean
  /** Nota informativa si el producto existe en despensa pero en otra unidad no convertible */
  otherUnitPantryNote: string | null
  netBaseQuantity: number
  netQuantity: number
  netUnit: Unit
  netFormatted: string
  fullyCoveredByPantry: boolean
  checked: boolean
  addedToPantry: boolean
  sources: ShoppingItemSource[]
}

export interface WeekShoppingResult {
  toBuyItems: ComputedShoppingItem[]
  coveredByPantryItems: ComputedShoppingItem[]
  allComputedItems: ComputedShoppingItem[]
}

export function createEmptyWeekPlan(weekStart: string): WeekPlan {
  return {
    weekStart,
    entries: [],
    batchOverrides: {},
    checkedShoppingKeys: [],
    addedToPantryKeys: [],
    extraShoppingItems: [],
  }
}

/**
 * Calcula los lotes a cocinar y el balance de raciones de cada receta activa en la semana.
 */
export function computeWeekRecipeSummaries(
  weekPlan: WeekPlan,
  recipes: Recipe[],
): WeekRecipeBatchSummary[] {
  const recipeMap = new Map(recipes.map((r) => [r.id, r]))
  const assignedByRecipe = new Map<string, number>()

  for (const entry of weekPlan.entries) {
    if (!recipeMap.has(entry.recipeId)) continue
    const prev = assignedByRecipe.get(entry.recipeId) ?? 0
    assignedByRecipe.set(entry.recipeId, roundClean(prev + Math.max(0, entry.servings)))
  }

  const activeRecipeIds = new Set<string>([...assignedByRecipe.keys()])
  for (const [recipeId, override] of Object.entries(weekPlan.batchOverrides)) {
    if (recipeMap.has(recipeId) && override > 0) {
      activeRecipeIds.add(recipeId)
    }
  }

  const summaries: WeekRecipeBatchSummary[] = []
  for (const recipeId of activeRecipeIds) {
    const recipe = recipeMap.get(recipeId)
    if (!recipe) continue

    const yieldPerBatch = Math.max(1, recipe.servingsYield)
    const assignedServings = assignedByRecipe.get(recipeId) ?? 0
    const recommendedBatches =
      assignedServings > 0 ? Math.ceil(assignedServings / yieldPerBatch) : 0

    const rawOverride = weekPlan.batchOverrides[recipeId]
    const hasManualOverride = rawOverride !== undefined && rawOverride > 0
    const batchesToCook = hasManualOverride ? roundClean(rawOverride) : recommendedBatches

    if (batchesToCook <= 0 && assignedServings <= 0) continue

    const producedServings = roundClean(batchesToCook * yieldPerBatch)
    const remainingServings = roundClean(producedServings - assignedServings)

    summaries.push({
      recipe,
      assignedServings,
      recommendedBatches,
      batchesToCook,
      hasManualOverride,
      producedServings,
      remainingServings,
    })
  }

  return summaries.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name, 'es'))
}

/**
 * Genera la lista de la compra agrupando ingredientes compatibles de todos los lotes de la semana
 * y descontando opcionalmente las existencias disponibles en la despensa.
 */
export function computeWeekShoppingList(
  weekPlan: WeekPlan,
  recipes: Recipe[],
  pantry: PantryItem[],
  deductPantry: boolean,
  includeOptional = true,
): WeekShoppingResult {
  const summaries = computeWeekRecipeSummaries(weekPlan, recipes)
  const checkedSet = new Set(weekPlan.checkedShoppingKeys)
  const addedSet = new Set(weekPlan.addedToPantryKeys)

  // Indexar despensa por clave normalizada de ingrediente
  const pantryByIngredient = new Map<string, PantryItem[]>()
  for (const pItem of pantry) {
    const norm = normalizeIngredientKey(pItem.name)
    if (!norm) continue
    const list = pantryByIngredient.get(norm) ?? []
    list.push(pItem)
    pantryByIngredient.set(norm, list)
  }

  interface Accumulator {
    key: string
    normalizedName: string
    displayName: string
    category: IngredientCategory
    family: UnitFamily
    grossBaseQuantity: number
    essentialBaseQuantity: number
    optionalBaseQuantity: number
    sources: ShoppingItemSource[]
  }

  const accumulators = new Map<string, Accumulator>()

  for (const summary of summaries) {
    if (summary.batchesToCook <= 0) continue

    for (const ing of summary.recipe.ingredients) {
      const isOpt = Boolean(ing.optional)
      if (isOpt && !includeOptional) continue

      const normalizedName = normalizeIngredientKey(ing.name)
      if (!normalizedName) continue

      const family = getUnitFamily(ing.unit)
      const groupKey = `${normalizedName}::${family}`
      const scaledQuantity = roundClean(ing.quantity * summary.batchesToCook)
      const baseAdded = toBaseQuantity(scaledQuantity, ing.unit)
      const formattedSource =
        ing.unit === 'al_gusto' ? 'Al gusto' : formatUnitLabel(scaledQuantity, ing.unit)

      const existing = accumulators.get(groupKey)
      if (existing) {
        existing.grossBaseQuantity = roundClean(existing.grossBaseQuantity + baseAdded)
        if (isOpt) {
          existing.optionalBaseQuantity = roundClean(existing.optionalBaseQuantity + baseAdded)
        } else {
          existing.essentialBaseQuantity = roundClean(existing.essentialBaseQuantity + baseAdded)
        }
        existing.sources.push({
          recipeId: summary.recipe.id,
          recipeName: summary.recipe.name,
          batches: summary.batchesToCook,
          formattedAmount: formattedSource,
          optional: isOpt,
        })
      } else {
        accumulators.set(groupKey, {
          key: groupKey,
          normalizedName,
          displayName: ing.name.trim(),
          category: ing.category,
          family,
          grossBaseQuantity: baseAdded,
          essentialBaseQuantity: isOpt ? 0 : baseAdded,
          optionalBaseQuantity: isOpt ? baseAdded : 0,
          sources: [
            {
              recipeId: summary.recipe.id,
              recipeName: summary.recipe.name,
              batches: summary.batchesToCook,
              formattedAmount: formattedSource,
              optional: isOpt,
            },
          ],
        })
      }
    }
  }

  const allComputedItems: ComputedShoppingItem[] = []

  for (const acc of accumulators.values()) {
    const matchingPantry = pantryByIngredient.get(acc.normalizedName) ?? []
    const alwaysAvailableMatch = matchingPantry.some((p) => Boolean(p.alwaysAvailable))

    let compatiblePantryBase = 0
    const incompatiblePantryNotes: string[] = []

    for (const p of matchingPantry) {
      if (p.alwaysAvailable) continue
      const pFamily = getUnitFamily(p.unit)
      if (pFamily === acc.family && pFamily !== 'unmeasured') {
        compatiblePantryBase = roundClean(compatiblePantryBase + toBaseQuantity(p.quantity, p.unit))
      } else if (p.quantity > 0 || p.unit === 'al_gusto') {
        incompatiblePantryNotes.push(formatUnitLabel(p.quantity, p.unit))
      }
    }

    const grossInfo = fromBaseQuantity(acc.grossBaseQuantity, acc.family)

    let coveredByAlwaysAvailable = false
    let pantryDeductedBase = 0
    let netBase = acc.grossBaseQuantity

    if (deductPantry) {
      if (alwaysAvailableMatch) {
        coveredByAlwaysAvailable = true
        pantryDeductedBase = acc.grossBaseQuantity
        netBase = 0
      } else if (acc.family !== 'unmeasured' && compatiblePantryBase > 0) {
        pantryDeductedBase = roundClean(Math.min(acc.grossBaseQuantity, compatiblePantryBase))
        netBase = roundClean(Math.max(0, acc.grossBaseQuantity - pantryDeductedBase))
      } else if (acc.family === 'unmeasured' && matchingPantry.length > 0) {
        coveredByAlwaysAvailable = true
        netBase = 0
      }
    }

    const fullyCoveredByPantry =
      deductPantry &&
      (coveredByAlwaysAvailable || (acc.family !== 'unmeasured' && netBase <= 0))

    const netInfo = fromBaseQuantity(netBase, acc.family)
    const deductedFormatted =
      coveredByAlwaysAvailable
        ? 'Básico en despensa'
        : pantryDeductedBase > 0
          ? fromBaseQuantity(pantryDeductedBase, acc.family).formatted
          : null

    const isPurelyOptional = acc.sources.every((s) => Boolean(s.optional))
    const optionalPortionFormatted =
      !isPurelyOptional && acc.optionalBaseQuantity > 0 && acc.family !== 'unmeasured'
        ? fromBaseQuantity(acc.optionalBaseQuantity, acc.family).formatted
        : null

    allComputedItems.push({
      key: acc.key,
      normalizedName: acc.normalizedName,
      displayName: acc.displayName,
      category: acc.category,
      family: acc.family,
      grossBaseQuantity: acc.grossBaseQuantity,
      grossFormatted: grossInfo.formatted,
      isPurelyOptional,
      optionalPortionFormatted,
      pantryAvailableBaseQuantity: compatiblePantryBase,
      pantryDeductedBaseQuantity: pantryDeductedBase,
      pantryDeductedFormatted: deductedFormatted,
      coveredByAlwaysAvailable,
      otherUnitPantryNote:
        incompatiblePantryNotes.length > 0
          ? `En despensa: ${incompatiblePantryNotes.join(', ')}`
          : null,
      netBaseQuantity: netBase,
      netQuantity: netInfo.quantity,
      netUnit: netInfo.unit,
      netFormatted: netInfo.formatted,
      fullyCoveredByPantry,
      checked: checkedSet.has(acc.key),
      addedToPantry: addedSet.has(acc.key),
      sources: acc.sources,
    })
  }

  const categoryIndex = new Map(CATEGORY_ORDER.map((c, idx) => [c, idx]))
  allComputedItems.sort((a, b) => {
    const catDiff = (categoryIndex.get(a.category) ?? 99) - (categoryIndex.get(b.category) ?? 99)
    if (catDiff !== 0) return catDiff
    return a.displayName.localeCompare(b.displayName, 'es')
  })

  const rawCovered = allComputedItems.filter((item) => item.fullyCoveredByPantry)
  const coveredMergedMap = new Map<string, ComputedShoppingItem>()

  for (const item of rawCovered) {
    const mergeKey = item.coveredByAlwaysAvailable ? `always::${item.normalizedName}` : item.key
    const prev = coveredMergedMap.get(mergeKey)
    if (prev) {
      coveredMergedMap.set(mergeKey, {
        ...prev,
        grossFormatted: `${prev.grossFormatted} + ${item.grossFormatted}`,
        sources: [...prev.sources, ...item.sources],
      })
    } else {
      coveredMergedMap.set(mergeKey, item)
    }
  }

  return {
    toBuyItems: allComputedItems.filter((item) => !item.fullyCoveredByPantry),
    coveredByPantryItems: Array.from(coveredMergedMap.values()),
    allComputedItems,
  }
}

export function formatBatchesLabel(batches: number): string {
  const num = formatNumberEs(batches)
  return `${num} ${roundClean(batches) === 1 ? 'lote' : 'lotes'}`
}
