import { createContext, useContext } from 'react'
import type { WeekRecipeBatchSummary, WeekShoppingResult } from '../lib/plannerEngine'
import type {
  AppDataSnapshot,
  DayIndex,
  IngredientCategory,
  MealSlotId,
  PantryItem,
  Recipe,
  Unit,
  UserSettings,
  WeekPlan,
} from '../types/food'

export interface FoodStoreContextValue {
  isHydrated: boolean
  snapshot: AppDataSnapshot
  activeWeekStart: string
  setActiveWeekStart: (mondayIso: string) => void
  goToWeekOffset: (deltaWeeks: number) => void
  goToCurrentWeek: () => void
  currentWeekPlan: WeekPlan
  weekRecipeSummaries: WeekRecipeBatchSummary[]
  weekShopping: WeekShoppingResult

  // Recetas
  saveRecipe: (
    recipeInput: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ) => Recipe
  deleteRecipe: (recipeId: string) => void
  duplicateRecipe: (recipeId: string) => Recipe | null

  // Planificador y lotes
  addMealEntry: (
    day: DayIndex,
    slot: MealSlotId,
    recipeId: string,
    servings: number,
    note?: string,
  ) => void
  updateMealEntryServings: (entryId: string, servings: number) => void
  removeMealEntry: (entryId: string) => void
  setBatchOverride: (recipeId: string, batches: number | null) => void
  prepareRecipeBatchForWeek: (recipeId: string, batches?: number) => void
  removeRecipeFromWeek: (recipeId: string) => void
  copyFromPreviousWeek: () => boolean
  clearCurrentWeek: () => void

  // Lista de la compra
  toggleShoppingItemChecked: (itemKey: string) => void
  addExtraShoppingItem: (input: {
    name: string
    quantity: number
    unit: Unit
    category: IngredientCategory
  }) => void
  toggleExtraShoppingItem: (id: string) => void
  removeExtraShoppingItem: (id: string) => void
  clearCheckedExtraItems: () => void
  transferCheckedItemsToPantry: () => number

  // Despensa
  savePantryItem: (input: Omit<PantryItem, 'id' | 'updatedAt'> & { id?: string }) => void
  adjustPantryQuantity: (id: string, delta: number) => void
  deletePantryItem: (id: string) => void

  // Ajustes y copias de seguridad
  updateSettings: (partial: Partial<UserSettings>) => void
  toggleMealSlot: (slotId: MealSlotId) => void
  knownIngredientSuggestions: {
    name: string
    unit: Unit
    category: IngredientCategory
  }[]
  exportDataJson: () => string
  importDataJson: (jsonText: string) => void
  restoreDemoData: () => void
  clearAllData: () => void
}

export const FoodStoreContext = createContext<FoodStoreContextValue | null>(null)

export function useFoodStore(): FoodStoreContextValue {
  const ctx = useContext(FoodStoreContext)
  if (!ctx) {
    throw new Error('useFoodStore debe usarse dentro de FoodStoreProvider')
  }
  return ctx
}
