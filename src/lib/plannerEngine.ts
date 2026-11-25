import type {
  IngredientCategory,
  PantryItem,
  Recipe,
  RecipeIngredient,
  Unit,
  WeekPlan,
} from '../types/food'
import { CATEGORY_ORDER } from '../types/food'
import {
  approximateSpoonRequirement,
  doesPantryItemMatchSubstituteOrGeneric,
  formatIngredientFlexibilityHint,
  isPantryItemAvailable,
  resolveEffectiveGenericGroup,
} from './pantryRecipeMatcher'
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
  /** Indicación de sustitutos válidos o familia comodín cuando el ingrediente es flexible */
  substituteHint: string | null
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
    flexIngredients: RecipeIngredient[]
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
      const hasFlex =
        Boolean(ing.substitutes && ing.substitutes.length > 0) ||
        Boolean(resolveEffectiveGenericGroup(ing))

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
        if (hasFlex) {
          existing.flexIngredients.push(ing)
        }
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
          flexIngredients: hasFlex ? [ing] : [],
        })
      }
    }
  }

  // Saldo restante de cada ítem de despensa disponible para no descontar dos veces el mismo stock
  const availablePantry = pantry.filter(isPantryItemAvailable)
  const remainingPantryBaseById = new Map<string, number>()
  for (const p of availablePantry) {
    remainingPantryBaseById.set(p.id, toBaseQuantity(p.quantity, p.unit))
  }

  interface PassOneState {
    acc: Accumulator
    compatiblePantryBase: number
    incompatiblePantryNotes: string[]
    coveredByAlwaysAvailable: boolean
    pantryDeductedBase: number
    netBase: number
    substitutedNames: string[]
  }

  const passOneStates: PassOneState[] = []

  // Pasada 1: Descuento directo por nombre normalizado (preserva prioridad del ingrediente exacto)
  for (const acc of accumulators.values()) {
    const matchingPantry = (pantryByIngredient.get(acc.normalizedName) ?? []).filter(
      isPantryItemAvailable,
    )
    const alwaysAvailableMatch = matchingPantry.some((p) => Boolean(p.alwaysAvailable))

    let compatiblePantryBase = 0
    const incompatiblePantryNotes: string[] = []
    const compatibleItems: PantryItem[] = []

    for (const p of matchingPantry) {
      if (p.alwaysAvailable) continue
      const pFamily = getUnitFamily(p.unit)
      if (pFamily === acc.family && pFamily !== 'unmeasured') {
        const rem = remainingPantryBaseById.get(p.id) ?? 0
        compatiblePantryBase = roundClean(compatiblePantryBase + rem)
        compatibleItems.push(p)
      } else if (p.quantity > 0 || p.unit === 'al_gusto') {
        incompatiblePantryNotes.push(formatUnitLabel(p.quantity, p.unit))
      }
    }

    let coveredByAlwaysAvailable = false
    let pantryDeductedBase = 0
    let netBase = acc.grossBaseQuantity

    if (deductPantry) {
      if (alwaysAvailableMatch) {
        coveredByAlwaysAvailable = true
        pantryDeductedBase = acc.grossBaseQuantity
        netBase = 0
      } else if (acc.family !== 'unmeasured' && compatiblePantryBase > 0) {
        let toDeduct = roundClean(Math.min(acc.grossBaseQuantity, compatiblePantryBase))
        pantryDeductedBase = toDeduct
        netBase = roundClean(Math.max(0, acc.grossBaseQuantity - pantryDeductedBase))
        for (const p of compatibleItems) {
          if (toDeduct <= 0) break
          const rem = remainingPantryBaseById.get(p.id) ?? 0
          const consumed = roundClean(Math.min(rem, toDeduct))
          remainingPantryBaseById.set(p.id, roundClean(rem - consumed))
          toDeduct = roundClean(toDeduct - consumed)
        }
      } else if (acc.family === 'unmeasured' && matchingPantry.length > 0) {
        coveredByAlwaysAvailable = true
        netBase = 0
      }
    }

    passOneStates.push({
      acc,
      compatiblePantryBase,
      incompatiblePantryNotes,
      coveredByAlwaysAvailable,
      pantryDeductedBase,
      netBase,
      substitutedNames: [],
    })
  }

  // Pasada 2: Si deductPantry está activo y el ingrediente admite sustitutos o es genérico,
  // aprovechamos las existencias libres en despensa que aún no hayan sido consumidas en la Pasada 1.
  if (deductPantry) {
    for (const state of passOneStates) {
      const { acc } = state
      if (acc.flexIngredients.length === 0) continue
      const needsMore =
        acc.family === 'unmeasured' ? !state.coveredByAlwaysAvailable : state.netBase > 0
      if (!needsMore) continue

      const candidateSubs = availablePantry
        .map((p) => {
          if (normalizeIngredientKey(p.name) === acc.normalizedName) return null
          let bestKind: 'substitute' | 'generic' | null = null
          for (const ing of acc.flexIngredients) {
            const k = doesPantryItemMatchSubstituteOrGeneric(p, ing)
            if (k === 'substitute') {
              bestKind = 'substitute'
              break
            }
            if (k === 'generic') {
              bestKind = 'generic'
            }
          }
          return bestKind ? { item: p, kind: bestKind } : null
        })
        .filter((x): x is { item: PantryItem; kind: 'substitute' | 'generic' } => x !== null)
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'substitute' ? -1 : 1
          return 0
        })

      for (const { item: p } of candidateSubs) {
        const stillNeeded =
          acc.family === 'unmeasured' ? !state.coveredByAlwaysAvailable : state.netBase > 0
        if (!stillNeeded) break

        if (p.alwaysAvailable || p.unit === 'al_gusto') {
          state.coveredByAlwaysAvailable = true
          state.pantryDeductedBase = acc.grossBaseQuantity
          state.netBase = 0
          state.substitutedNames.push(p.name)
          break
        }

        if (acc.family === 'unmeasured') {
          const rem = remainingPantryBaseById.get(p.id) ?? 0
          if (rem > 0) {
            state.coveredByAlwaysAvailable = true
            state.netBase = 0
            state.substitutedNames.push(p.name)
            break
          }
          continue
        }

        const pFamily = getUnitFamily(p.unit)
        const rem = remainingPantryBaseById.get(p.id) ?? 0
        if (rem <= 0) continue

        if (pFamily === acc.family) {
          const consumed = roundClean(Math.min(state.netBase, rem))
          remainingPantryBaseById.set(p.id, roundClean(rem - consumed))
          state.pantryDeductedBase = roundClean(state.pantryDeductedBase + consumed)
          state.netBase = roundClean(Math.max(0, state.netBase - consumed))
          state.substitutedNames.push(p.name)
        } else if (
          (acc.family === 'discrete:cucharada' || acc.family === 'discrete:cucharadita') &&
          (pFamily === 'mass' || pFamily === 'volume')
        ) {
          const spoonUnit =
            acc.family === 'discrete:cucharada' ? 'cucharada' : 'cucharadita'
          const perSpoon = approximateSpoonRequirement(1, spoonUnit, pFamily)
          const neededInTarget = roundClean(state.netBase * perSpoon)
          const consumedTarget = roundClean(Math.min(neededInTarget, rem))
          const spoonsCovered = roundClean(consumedTarget / perSpoon)
          remainingPantryBaseById.set(p.id, roundClean(rem - consumedTarget))
          state.pantryDeductedBase = roundClean(state.pantryDeductedBase + spoonsCovered)
          state.netBase = roundClean(Math.max(0, state.netBase - spoonsCovered))
          state.substitutedNames.push(p.name)
        } else {
          state.incompatiblePantryNotes.push(
            `${p.name} (${formatUnitLabel(p.quantity, p.unit)})`,
          )
        }
      }
    }
  }

  const allComputedItems: ComputedShoppingItem[] = []

  for (const state of passOneStates) {
    const {
      acc,
      compatiblePantryBase,
      incompatiblePantryNotes,
      coveredByAlwaysAvailable,
      pantryDeductedBase,
      netBase,
      substitutedNames,
    } = state

    const grossInfo = fromBaseQuantity(acc.grossBaseQuantity, acc.family)

    const fullyCoveredByPantry =
      deductPantry &&
      (coveredByAlwaysAvailable || (acc.family !== 'unmeasured' && netBase <= 0))

    const netInfo = fromBaseQuantity(netBase, acc.family)
    const subSuffix =
      substitutedNames.length > 0 ? ` (usando ${substitutedNames.join(' + ')})` : ''

    const deductedFormatted = coveredByAlwaysAvailable
      ? substitutedNames.length > 0
        ? `Usando ${substitutedNames.join(' + ')}`
        : 'Básico en despensa'
      : pantryDeductedBase > 0
        ? `${fromBaseQuantity(pantryDeductedBase, acc.family).formatted}${subSuffix}`
        : null

    const isPurelyOptional = acc.sources.every((s) => Boolean(s.optional))
    const optionalPortionFormatted =
      !isPurelyOptional && acc.optionalBaseQuantity > 0 && acc.family !== 'unmeasured'
        ? fromBaseQuantity(acc.optionalBaseQuantity, acc.family).formatted
        : null

    const substituteHint =
      acc.flexIngredients.length > 0
        ? formatIngredientFlexibilityHint(acc.flexIngredients[0])
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
      substituteHint,
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

/**
 * Calcula una cantidad sugerida razonable de compra al reponer un producto desde la despensa.
 * Si tiene `minQuantity` y está por debajo, sugiere la diferencia hasta alcanzar el mínimo;
 * en caso contrario usa el umbral mínimo o un tamaño de compra estándar según la unidad.
 */
export function getSuggestedPantryRestock(item: PantryItem): {
  quantity: number
  unit: Unit
  formatted: string
} {
  if (item.unit === 'al_gusto') {
    return { quantity: 0, unit: 'al_gusto', formatted: 'Al gusto' }
  }

  if (item.minQuantity !== undefined && Number.isFinite(item.minQuantity) && item.minQuantity > 0) {
    const safeCurrent = Math.max(0, Number.isFinite(item.quantity) ? item.quantity : 0)
    const targetQty =
      safeCurrent < item.minQuantity
        ? roundClean(item.minQuantity - safeCurrent)
        : roundClean(item.minQuantity)
    return {
      quantity: targetQty,
      unit: item.unit,
      formatted: formatUnitLabel(targetQty, item.unit),
    }
  }

  switch (item.unit) {
    case 'g':
      return { quantity: 500, unit: 'g', formatted: formatUnitLabel(500, 'g') }
    case 'kg':
      return { quantity: 1, unit: 'kg', formatted: formatUnitLabel(1, 'kg') }
    case 'ml':
      return { quantity: 500, unit: 'ml', formatted: formatUnitLabel(500, 'ml') }
    case 'l':
      return { quantity: 1, unit: 'l', formatted: formatUnitLabel(1, 'l') }
    case 'ud': {
      const qty = normalizeIngredientKey(item.name) === 'huevo' ? 6 : 1
      return { quantity: qty, unit: 'ud', formatted: formatUnitLabel(qty, 'ud') }
    }
    case 'diente':
      return { quantity: 6, unit: 'diente', formatted: formatUnitLabel(6, 'diente') }
    case 'lata':
      return { quantity: 1, unit: 'lata', formatted: formatUnitLabel(1, 'lata') }
    case 'sobre':
      return { quantity: 1, unit: 'sobre', formatted: formatUnitLabel(1, 'sobre') }
    case 'cucharada':
      return { quantity: 1, unit: 'cucharada', formatted: formatUnitLabel(1, 'cucharada') }
    case 'cucharadita':
      return { quantity: 1, unit: 'cucharadita', formatted: formatUnitLabel(1, 'cucharadita') }
  }
}
