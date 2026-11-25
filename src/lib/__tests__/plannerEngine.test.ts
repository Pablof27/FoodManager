import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { sanitizeRecipe } from '../../storage/db'
import {
  assembleSnapshotFromDbRows,
  computeRelationalSyncDiff,
  fetchUserCloudSnapshot,
  formatSupabaseError,
} from '../../storage/supabaseSync'
import type { AppDataSnapshot, PantryItem, Recipe } from '../../types/food'
import {
  computeWeekRecipeSummaries,
  computeWeekShoppingList,
  createEmptyWeekPlan,
  getSuggestedPantryRestock,
} from '../plannerEngine'
import { normalizeIngredientKey } from '../units'

const sampleRecipes: Recipe[] = [
  {
    id: 'r-lentejas',
    name: 'Lentejas estofadas',
    description: '',
    servingsYield: 4,
    prepTimeMinutes: 42,
    emoji: '🍲',
    tags: ['Comida'],
    ingredients: [
      { id: 'i1', name: 'Lentejas pardinas', quantity: 300, unit: 'g', category: 'legumbres_cereales' },
      { id: 'i2', name: 'Patatas', quantity: 400, unit: 'g', category: 'verduras_frutas' },
      { id: 'i3', name: 'Sal', quantity: 0, unit: 'al_gusto', category: 'especias_salsas' },
      { id: 'i3b', name: 'Chorizo', quantity: 120, unit: 'g', category: 'carnes_pescados', optional: true },
    ],
    steps: [
      {
        id: 's1',
        text: 'Cocer las lentejas a fuego lento.',
        notes: [{ id: 'n1', type: 'recordatorio', text: 'Echar la sal al final.' }],
      },
    ],
    recipeNotes: [],
    createdAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
  },
  {
    id: 'r-pollo',
    name: 'Pollo asado con patata',
    description: '',
    servingsYield: 4,
    prepTimeMinutes: 48,
    emoji: '🍗',
    tags: ['Comida'],
    ingredients: [
      { id: 'i4', name: 'Pollo', quantity: 800, unit: 'g', category: 'carnes_pescados' },
      { id: 'i5', name: 'Patata', quantity: 0.8, unit: 'kg', category: 'verduras_frutas', optional: true },
      { id: 'i6', name: 'Tomate triturado', quantity: 400, unit: 'g', category: 'conservas_aceites' },
    ],
    steps: [],
    recipeNotes: [],
    createdAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
  },
]

describe('normalizeIngredientKey', () => {
  it('unifica singulares/plurales y tildes en español', () => {
    expect(normalizeIngredientKey('Patatas')).toBe(normalizeIngredientKey('patata'))
    expect(normalizeIngredientKey('Limones')).toBe(normalizeIngredientKey('Limón'))
    expect(normalizeIngredientKey('Nueces')).toBe(normalizeIngredientKey('Nuez'))
    expect(normalizeIngredientKey('Arroz redondo')).toBe('arroz redondo')
  })
})

describe('computeWeekRecipeSummaries', () => {
  it('calcula lotes completos y raciones sobrantes al repartir una receta en la semana', () => {
    const plan = createEmptyWeekPlan('2026-11-23')
    plan.entries = [
      { id: 'e1', day: 0, slot: 'comida', recipeId: 'r-lentejas', servings: 2 },
    ]

    const [summary] = computeWeekRecipeSummaries(plan, sampleRecipes)
    expect(summary.batchesToCook).toBe(1)
    expect(summary.producedServings).toBe(4)
    expect(summary.assignedServings).toBe(2)
    expect(summary.remainingServings).toBe(2)

    // Al colocar las otras 2 raciones el miércoles sigue siendo 1 solo lote (0 sobrantes)
    plan.entries.push({ id: 'e2', day: 2, slot: 'comida', recipeId: 'r-lentejas', servings: 2 })
    const [summaryFull] = computeWeekRecipeSummaries(plan, sampleRecipes)
    expect(summaryFull.batchesToCook).toBe(1)
    expect(summaryFull.remainingServings).toBe(0)

    // Si se planifican 5 raciones sube automáticamente a 2 lotes (8 producidas, 3 libres)
    plan.entries.push({ id: 'e3', day: 4, slot: 'comida', recipeId: 'r-lentejas', servings: 1 })
    const [summaryTwoBatches] = computeWeekRecipeSummaries(plan, sampleRecipes)
    expect(summaryTwoBatches.batchesToCook).toBe(2)
    expect(summaryTwoBatches.producedServings).toBe(8)
    expect(summaryTwoBatches.remainingServings).toBe(3)
  })

  it('permite preparar lotes sin asignar aún o multiplicar lotes manualmente', () => {
    const plan = createEmptyWeekPlan('2026-11-23')
    plan.batchOverrides = { 'r-pollo': 2 }

    const [summary] = computeWeekRecipeSummaries(plan, sampleRecipes)
    expect(summary.batchesToCook).toBe(2)
    expect(summary.producedServings).toBe(8)
    expect(summary.assignedServings).toBe(0)
    expect(summary.remainingServings).toBe(8)
  })
})

describe('computeWeekShoppingList', () => {
  it('agrupa unidades compatibles (g y kg) y descuenta existencias de la despensa', () => {
    const plan = createEmptyWeekPlan('2026-11-23')
    plan.entries = [
      { id: 'e1', day: 0, slot: 'comida', recipeId: 'r-lentejas', servings: 3 }, // 1 lote -> 400g patata, 300g lentejas
      { id: 'e2', day: 1, slot: 'comida', recipeId: 'r-pollo', servings: 4 }, // 1 lote -> 800g patata, 800g pollo, 400g tomate
    ]

    const pantry: PantryItem[] = [
      {
        id: 'p1',
        name: 'Lenteja pardina',
        quantity: 500,
        unit: 'g',
        category: 'legumbres_cereales',
        updatedAt: '2026-11-24T00:00:00Z',
      },
      {
        id: 'p2',
        name: 'Patata',
        quantity: 0.5,
        unit: 'kg',
        category: 'verduras_frutas',
        updatedAt: '2026-11-24T00:00:00Z',
      },
      {
        id: 'p3',
        name: 'Sal',
        quantity: 0,
        unit: 'al_gusto',
        category: 'especias_salsas',
        alwaysAvailable: true,
        updatedAt: '2026-11-24T00:00:00Z',
      },
      {
        id: 'p4',
        name: 'Tomate triturado',
        quantity: 2,
        unit: 'lata',
        category: 'conservas_aceites',
        updatedAt: '2026-11-24T00:00:00Z',
      },
    ]

    const result = computeWeekShoppingList(plan, sampleRecipes, pantry, true)

    // Lentejas (300g necesarias vs 500g en despensa) y Sal (básico) deben quedar cubiertas
    expect(result.coveredByPantryItems.map((i) => i.normalizedName)).toEqual(
      expect.arrayContaining(['lenteja pardina', 'sal']),
    )

    // Patata: 400g + 800g = 1200g brutas - 500g en despensa = 700g netas a comprar
    const patataItem = result.toBuyItems.find((i) => i.normalizedName === 'patata')
    expect(patataItem).toBeDefined()
    expect(patataItem?.grossBaseQuantity).toBe(1200)
    expect(patataItem?.netBaseQuantity).toBe(700)
    expect(patataItem?.netFormatted).toBe('700 g')

    // Tomate triturado: 400g en receta vs 2 latas en despensa -> no resta pero informa la nota
    const tomateItem = result.toBuyItems.find((i) => i.normalizedName === 'tomate triturado')
    expect(tomateItem?.netBaseQuantity).toBe(400)
    expect(tomateItem?.otherUnitPantryNote).toBe('En despensa: 2 latas')

    // Chorizo es 100 % opcional; Patata mezcla 400g indispensables + 800g opcionales
    const chorizoItem = result.toBuyItems.find((i) => i.normalizedName === 'chorizo')
    expect(chorizoItem?.isPurelyOptional).toBe(true)
    expect(patataItem?.isPurelyOptional).toBe(false)
    expect(patataItem?.optionalPortionFormatted).toBe('800 g')

    // Al desactivar includeOptional en la compra: desaparece chorizo y patata queda cubierta por los 500g de despensa (solo pide 400g indispensables)
    const withoutOptionals = computeWeekShoppingList(plan, sampleRecipes, pantry, true, false)
    expect(withoutOptionals.toBuyItems.find((i) => i.normalizedName === 'chorizo')).toBeUndefined()
    expect(withoutOptionals.toBuyItems.find((i) => i.normalizedName === 'patata')).toBeUndefined()
    expect(
      withoutOptionals.coveredByPantryItems.some((i) => i.normalizedName === 'patata'),
    ).toBe(true)
  })

  it('sugiere cantidades razonables de reposición desde la despensa según minQuantity o unidad', () => {
    // Con minQuantity definido y stock inferior -> sugiere la diferencia exacta hasta el mínimo
    expect(
      getSuggestedPantryRestock({
        id: 'p1',
        name: 'Arroz redondo',
        quantity: 100,
        unit: 'g',
        category: 'legumbres_cereales',
        minQuantity: 300,
        updatedAt: '2026-11-25T00:00:00Z',
      }),
    ).toEqual({ quantity: 200, unit: 'g', formatted: '200 g' })

    // Sin minQuantity en gramos -> sugiere paquete estándar (500 g) en lugar de 1 g
    expect(
      getSuggestedPantryRestock({
        id: 'p2',
        name: 'Macarrones',
        quantity: 0,
        unit: 'g',
        category: 'legumbres_cereales',
        updatedAt: '2026-11-25T00:00:00Z',
      }),
    ).toEqual({ quantity: 500, unit: 'g', formatted: '500 g' })

    // Huevos por unidades sin mínimo -> sugiere media docena (6 uds)
    expect(
      getSuggestedPantryRestock({
        id: 'p3',
        name: 'Huevos',
        quantity: 1,
        unit: 'ud',
        category: 'lacteos_huevos',
        updatedAt: '2026-11-25T00:00:00Z',
      }),
    ).toEqual({ quantity: 6, unit: 'ud', formatted: '6 uds' })
  })
})

describe('sanitizeRecipe migration', () => {
  it('migra recetas antiguas con steps en texto plano y notes como string', () => {
    const migrated = sanitizeRecipe({
      id: 'legacy-1',
      name: 'Tortilla rápida',
      servingsYield: 2,
      prepTimeMinutes: 14,
      ingredients: [{ id: 'i1', name: 'Huevo', quantity: 3, unit: 'ud', category: 'lacteos_huevos' }],
      steps: ['Batir los huevos', 'Cuajar en sartén'],
      notes: 'Usar sartén antiadherente caliente.',
    })

    expect(migrated).not.toBeNull()
    expect(migrated?.prepTimeMinutes).toBe(14)
    expect(migrated?.steps).toHaveLength(2)
    expect(migrated?.steps[0]).toMatchObject({
      text: 'Batir los huevos',
      optional: false,
      notes: [],
    })
    expect(migrated?.recipeNotes).toEqual([
      expect.objectContaining({
        type: 'tip',
        text: 'Usar sartén antiadherente caliente.',
      }),
    ])
  })
})

describe('supabaseSync relational mapping & diff', () => {
  const baseSnapshot: AppDataSnapshot = {
    version: 2,
    recipes: sampleRecipes,
    weekPlans: {
      '2026-11-23': {
        weekStart: '2026-11-23',
        entries: [{ id: 'e1', day: 0, slot: 'comida', recipeId: 'r-lentejas', servings: 2 }],
        batchOverrides: {},
        checkedShoppingKeys: ['patata::mass'],
        addedToPantryKeys: [],
        extraShoppingItems: [],
      },
    },
    pantry: [
      {
        id: 'p1',
        name: 'Sal',
        quantity: 0,
        unit: 'al_gusto',
        category: 'especias_salsas',
        alwaysAvailable: true,
        updatedAt: '2026-11-24T00:00:00Z',
      },
    ],
    settings: {
      enabledSlots: ['comida', 'cena'],
      defaultServingsPerMeal: 2,
      deductPantryInShopping: true,
      includeOptionalInShopping: true,
    },
  }

  it('reconstruye un snapshot idéntico desde filas relacionales y detecta solo cambios reales en el diff', () => {
    const userId = 'user-123'
    const initialDiff = computeRelationalSyncDiff(userId, null, baseSnapshot, '2026-11-24T12:00:00Z')

    expect(initialDiff.hasChanges).toBe(true)
    expect(initialDiff.recipesToUpsert).toHaveLength(2)
    expect(initialDiff.weekPlansToUpsert).toHaveLength(1)
    expect(initialDiff.pantryToUpsert).toHaveLength(1)
    expect(initialDiff.settingsToUpsert?.user_id).toBe(userId)

    const reassembled = assembleSnapshotFromDbRows({
      recipesRows: initialDiff.recipesToUpsert,
      weekPlansRows: initialDiff.weekPlansToUpsert,
      pantryRows: initialDiff.pantryToUpsert,
      settingsRow: initialDiff.settingsToUpsert,
    })

    expect(reassembled.hasCloudData).toBe(true)
    expect(reassembled.snapshot.recipes.map((r) => r.id)).toEqual(['r-lentejas', 'r-pollo'])
    expect(reassembled.snapshot.weekPlans['2026-11-23'].checkedShoppingKeys).toEqual([
      'patata::mass',
    ])

    // Sin cambios no debe emitir operaciones de red
    const noOpDiff = computeRelationalSyncDiff(userId, reassembled.snapshot, reassembled.snapshot)
    expect(noOpDiff.hasChanges).toBe(false)

    // Al borrar 1 receta y reordenar/editar nada más, solo marca ese borrado y el nuevo orden
    const afterDelete: AppDataSnapshot = {
      ...reassembled.snapshot,
      recipes: [reassembled.snapshot.recipes[1]],
    }
    const deleteDiff = computeRelationalSyncDiff(userId, reassembled.snapshot, afterDelete)
    expect(deleteDiff.recipeIdsToDelete).toEqual(['r-lentejas'])
    expect(deleteDiff.recipesToUpsert).toHaveLength(1)
    expect(deleteDiff.recipesToUpsert[0]).toMatchObject({ id: 'r-pollo', position: 0 })
    expect(deleteDiff.weekPlansToUpsert).toHaveLength(0)
    expect(deleteDiff.pantryToUpsert).toHaveLength(0)
    expect(deleteDiff.settingsToUpsert).toBeNull()
  })

  it('convierte errores planos de PostgREST (42501 / PGRST205) en instancias Error descriptivas', async () => {
    const permissionDenied = {
      code: '42501',
      message: 'permission denied for table recipes',
      details: null,
      hint: 'Grant the required privileges to the current role',
    }

    expect(formatSupabaseError(permissionDenied)).toContain('Permiso denegado')
    expect(formatSupabaseError(permissionDenied)).toContain('supabase/schema.sql')

    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: permissionDenied }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(fetchUserCloudSnapshot(mockClient, 'user-123')).rejects.toThrow(
      /Permiso denegado en Supabase/,
    )
  })

  it('detecta respuestas vacías (404 silencioso con Data API desactivada) en fetchUserCloudSnapshot', async () => {
    const mockDisabledApiClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: null, status: 204 }),
            maybeSingle: () => Promise.resolve({ data: null, error: null, status: 204 }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null, status: 204 }).then(resolve),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    await expect(fetchUserCloudSnapshot(mockDisabledApiClient, 'user-123')).rejects.toThrow(
      /Data API de Supabase/,
    )
  })
})
