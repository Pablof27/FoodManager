export type Unit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'ud'
  | 'diente'
  | 'lata'
  | 'sobre'
  | 'cucharada'
  | 'cucharadita'
  | 'al_gusto'

export type IngredientCategory =
  | 'verduras_frutas'
  | 'carnes_pescados'
  | 'lacteos_huevos'
  | 'legumbres_cereales'
  | 'conservas_aceites'
  | 'panaderia'
  | 'congelados'
  | 'especias_salsas'
  | 'otros'

export type MealSlotId =
  | 'desayuno'
  | 'almuerzo'
  | 'comida'
  | 'merienda'
  | 'cena'

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface MealSlotMeta {
  id: MealSlotId
  label: string
  shortLabel: string
}

export const ALL_MEAL_SLOTS: readonly MealSlotMeta[] = [
  { id: 'desayuno', label: 'Desayuno', shortLabel: 'Des.' },
  { id: 'almuerzo', label: 'Almuerzo', shortLabel: 'Alm.' },
  { id: 'comida', label: 'Comida', shortLabel: 'Com.' },
  { id: 'merienda', label: 'Merienda', shortLabel: 'Mer.' },
  { id: 'cena', label: 'Cena', shortLabel: 'Cena' },
] as const

export const DAY_NAMES: readonly string[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const

export const DAY_SHORT_NAMES: readonly string[] = [
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
  'Dom',
] as const

export const CATEGORY_META: Record<
  IngredientCategory,
  { label: string; emoji: string; badgeClass: string }
> = {
  verduras_frutas: {
    label: 'Frutas y verduras',
    emoji: '🥦',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  carnes_pescados: {
    label: 'Carnes y pescados',
    emoji: '🍗',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  lacteos_huevos: {
    label: 'Lácteos y huevos',
    emoji: '🥚',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  legumbres_cereales: {
    label: 'Arroz, pasta y legumbres',
    emoji: '🌾',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
  },
  panaderia: {
    label: 'Panadería y desayuno',
    emoji: '🥖',
    badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  },
  conservas_aceites: {
    label: 'Conservas y aceites',
    emoji: '🫒',
    badgeClass: 'bg-lime-50 text-lime-800 border-lime-200',
  },
  congelados: {
    label: 'Congelados',
    emoji: '❄️',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  especias_salsas: {
    label: 'Especias y condimentos',
    emoji: '🧂',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  otros: {
    label: 'Otros / Hogar',
    emoji: '🛒',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
  },
}

export const CATEGORY_ORDER: readonly IngredientCategory[] = [
  'verduras_frutas',
  'carnes_pescados',
  'lacteos_huevos',
  'legumbres_cereales',
  'panaderia',
  'conservas_aceites',
  'congelados',
  'especias_salsas',
  'otros',
] as const

export type RecipeNoteType = 'tip' | 'recordatorio'

export interface RecipeNote {
  id: string
  type: RecipeNoteType
  text: string
}

export interface RecipeIngredient {
  id: string
  name: string
  quantity: number
  unit: Unit
  category: IngredientCategory
  /** Ingrediente opcional para mejorar o sofisticar la versión básica */
  optional?: boolean
}

export interface RecipeStep {
  id: string
  text: string
  /** Paso opcional para mejorar o sofisticar la receta básica */
  optional?: boolean
  /** Notas asociadas a este paso (ocultas por defecto en modo lectura rápida) */
  notes: RecipeNote[]
}

export interface Recipe {
  id: string
  name: string
  description: string
  /** Cantidad de raciones que salen al cocinar 1 lote de la receta */
  servingsYield: number
  prepTimeMinutes: number
  emoji: string
  tags: string[]
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  /** Notas generales de la receta clasificadas como tip o recordatorio */
  recipeNotes: RecipeNote[]
  createdAt: string
  updatedAt: string
}

export interface PlannedMealEntry {
  id: string
  day: DayIndex
  slot: MealSlotId
  recipeId: string
  /** Número de raciones consumidas en esta toma */
  servings: number
  note?: string
}

export interface ExtraShoppingItem {
  id: string
  name: string
  quantity: number
  unit: Unit
  category: IngredientCategory
  checked: boolean
}

export interface WeekPlan {
  /** Fecha ISO del lunes de la semana (YYYY-MM-DD) */
  weekStart: string
  entries: PlannedMealEntry[]
  /** Multiplicador manual de lotes por receta (ej. 1, 2, 0.5) */
  batchOverrides: Record<string, number>
  /** Claves de ingredientes calculados marcados como comprados en la semana */
  checkedShoppingKeys: string[]
  /** Claves de ítems ya transferidos a la despensa esta semana */
  addedToPantryKeys: string[]
  /** Productos manuales extra añadidos a la compra de la semana */
  extraShoppingItems: ExtraShoppingItem[]
}

export interface PantryItem {
  id: string
  name: string
  quantity: number
  unit: Unit
  category: IngredientCategory
  /** Básico siempre disponible en casa (sal, pimienta, etc.) */
  alwaysAvailable?: boolean
  /** Umbral opcional para aviso de poco stock */
  minQuantity?: number
  updatedAt: string
}

export interface UserSettings {
  enabledSlots: MealSlotId[]
  defaultServingsPerMeal: number
  deductPantryInShopping: boolean
  includeOptionalInShopping: boolean
}

export interface AppDataSnapshot {
  version: number
  recipes: Recipe[]
  weekPlans: Record<string, WeekPlan>
  pantry: PantryItem[]
  settings: UserSettings
}
