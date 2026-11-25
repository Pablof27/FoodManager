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

export type GenericIngredientGroup =
  | 'verdura_guarnicion'
  | 'hoja_verde'
  | 'setas_hongos'
  | 'hierba_fresca'
  | 'picante'
  | 'pasta'
  | 'arroz_grano'
  | 'legumbre'
  | 'queso_fundir'
  | 'lacteo_cremoso'
  | 'proteina'
  | 'caldo'
  | 'acido_citrico'
  | 'frutos_secos'

export interface GenericGroupMeta {
  id: GenericIngredientGroup
  label: string
  shortLabel: string
  emoji: string
  defaultName: string
  defaultCategory: IngredientCategory
  defaultUnit: Unit
  suggestedSubstitutes: readonly string[]
}

export const GENERIC_INGREDIENT_GROUPS: readonly GenericGroupMeta[] = [
  {
    id: 'verdura_guarnicion',
    label: 'Cualquier verdura u hortaliza (aprovechamiento)',
    shortLabel: 'Verdura comodín',
    emoji: '🥦',
    defaultName: 'Verdura de aprovechamiento',
    defaultCategory: 'verduras_frutas',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Espárragos verdes',
      'Brócoli',
      'Setas',
      'Calabacín',
      'Berenjena',
      'Pimiento',
      'Espinacas',
      'Zanahoria',
    ],
  },
  {
    id: 'hoja_verde',
    label: 'Cualquier hoja verde o brotes',
    shortLabel: 'Hoja verde comodín',
    emoji: '🥬',
    defaultName: 'Hojas verdes al gusto',
    defaultCategory: 'verduras_frutas',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Espinacas frescas',
      'Rúcula',
      'Brotes tiernos',
      'Canónigos',
      'Lechuga',
      'Kale',
    ],
  },
  {
    id: 'setas_hongos',
    label: 'Cualquier seta o champiñón',
    shortLabel: 'Setas comodín',
    emoji: '🍄',
    defaultName: 'Setas o champiñones',
    defaultCategory: 'verduras_frutas',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Champiñones',
      'Setas',
      'Portobello',
      'Shiitake',
      'Boletus',
    ],
  },
  {
    id: 'hierba_fresca',
    label: 'Cualquier hierba aromática fresca',
    shortLabel: 'Hierba fresca',
    emoji: '🌿',
    defaultName: 'Hierbas frescas',
    defaultCategory: 'verduras_frutas',
    defaultUnit: 'al_gusto',
    suggestedSubstitutes: [
      'Perejil fresco',
      'Cilantro fresco',
      'Albahaca fresca',
      'Menta fresca',
      'Cebollino',
    ],
  },
  {
    id: 'picante',
    label: 'Cualquier picante (pasta, salsa o especia)',
    shortLabel: 'Picante comodín',
    emoji: '🌶️',
    defaultName: 'Picante al gusto',
    defaultCategory: 'especias_salsas',
    defaultUnit: 'cucharadita',
    suggestedSubstitutes: [
      'Gochujang',
      'Cayena',
      'Tabasco',
      'Sriracha',
      'Chile en polvo',
      'Aceite de chile crujiente',
    ],
  },
  {
    id: 'pasta',
    label: 'Cualquier tipo de pasta',
    shortLabel: 'Pasta comodín',
    emoji: '🍝',
    defaultName: 'Pasta al gusto',
    defaultCategory: 'legumbres_cereales',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Macarrones',
      'Espaguetis',
      'Hélices',
      'Penne',
      'Tallarines',
      'Noodles',
    ],
  },
  {
    id: 'arroz_grano',
    label: 'Cualquier arroz o cereal en grano',
    shortLabel: 'Arroz / grano comodín',
    emoji: '🍚',
    defaultName: 'Arroz o cereal',
    defaultCategory: 'legumbres_cereales',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Arroz redondo',
      'Arroz basmati',
      'Arroz integral',
      'Quinoa',
      'Cuscús',
    ],
  },
  {
    id: 'legumbre',
    label: 'Cualquier legumbre',
    shortLabel: 'Legumbre comodín',
    emoji: '🫘',
    defaultName: 'Legumbre cocida',
    defaultCategory: 'legumbres_cereales',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Garbanzos',
      'Lentejas',
      'Alubias blancas',
      'Judías pintas',
    ],
  },
  {
    id: 'queso_fundir',
    label: 'Cualquier queso para fundir o rallar',
    shortLabel: 'Queso comodín',
    emoji: '🧀',
    defaultName: 'Queso para fundir',
    defaultCategory: 'lacteos_huevos',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Mozzarella rallada',
      'Queso parmesano rallado',
      'Queso rallado',
      'Cheddar',
      'Emmental',
    ],
  },
  {
    id: 'lacteo_cremoso',
    label: 'Cualquier lácteo o crema para ligar',
    shortLabel: 'Cremoso comodín',
    emoji: '🥛',
    defaultName: 'Nata o yogur cremoso',
    defaultCategory: 'lacteos_huevos',
    defaultUnit: 'ml',
    suggestedSubstitutes: [
      'Nata para cocinar',
      'Yogur griego',
      'Crema agria',
      'Leche evaporada',
      'Queso crema',
    ],
  },
  {
    id: 'proteina',
    label: 'Cualquier proteína de aprovechamiento',
    shortLabel: 'Proteína comodín',
    emoji: '🍗',
    defaultName: 'Proteína al gusto',
    defaultCategory: 'carnes_pescados',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Pollo',
      'Huevo',
      'Atún',
      'Bacon',
      'Tofu',
      'Carne picada',
      'Salmón',
    ],
  },
  {
    id: 'caldo',
    label: 'Cualquier caldo o pastilla',
    shortLabel: 'Caldo comodín',
    emoji: '🥣',
    defaultName: 'Caldo al gusto',
    defaultCategory: 'conservas_aceites',
    defaultUnit: 'ml',
    suggestedSubstitutes: [
      'Caldo de pollo',
      'Caldo de verduras',
      'Caldo de carne',
      'Pastilla de caldo',
    ],
  },
  {
    id: 'acido_citrico',
    label: 'Cualquier cítrico o vinagre',
    shortLabel: 'Ácido / cítrico',
    emoji: '🍋',
    defaultName: 'Limón, lima o vinagre',
    defaultCategory: 'verduras_frutas',
    defaultUnit: 'ud',
    suggestedSubstitutes: ['Limón', 'Lima', 'Vinagre de manzana', 'Vinagre de arroz'],
  },
  {
    id: 'frutos_secos',
    label: 'Cualquier fruto seco o semilla',
    shortLabel: 'Fruto seco comodín',
    emoji: '🥜',
    defaultName: 'Frutos secos o semillas',
    defaultCategory: 'conservas_aceites',
    defaultUnit: 'g',
    suggestedSubstitutes: [
      'Nueces',
      'Almendras',
      'Cacahuetes',
      'Anacardos',
      'Semillas de sésamo',
    ],
  },
] as const

export const GENERIC_GROUP_META: Record<GenericIngredientGroup, GenericGroupMeta> =
  Object.fromEntries(GENERIC_INGREDIENT_GROUPS.map((g) => [g.id, g])) as Record<
    GenericIngredientGroup,
    GenericGroupMeta
  >

export interface RecipeIngredient {
  id: string
  name: string
  quantity: number
  unit: Unit
  category: IngredientCategory
  /** Ingrediente opcional para mejorar o sofisticar la versión básica */
  optional?: boolean
  /** Lista explícita de ingredientes sustitutos válidos (p. ej. ["Brócoli", "Setas", "Bimi"]) */
  substitutes?: string[]
  /** Familia genérica / comodín para recetas flexibles o de aprovechamiento */
  genericGroup?: GenericIngredientGroup
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
