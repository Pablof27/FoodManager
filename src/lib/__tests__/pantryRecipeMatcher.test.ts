import { describe, expect, it } from 'vitest'
import { sanitizeRecipe } from '../../storage/db'
import type { PantryItem, Recipe } from '../../types/food'
import {
  doesPantryItemMatchGenericGroup,
  doesPantryItemMatchIngredient,
  evaluateRecipeAgainstPantry,
  getPantryItemsRecipeUsage,
  rankRecipesByPantry,
} from '../pantryRecipeMatcher'
import { computeWeekShoppingList, createEmptyWeekPlan } from '../plannerEngine'

const ISO = '2026-11-25T10:00:00Z'

function makePantryItem(
  partial: Partial<PantryItem> & Pick<PantryItem, 'id' | 'name'>,
): PantryItem {
  return {
    quantity: 1,
    unit: 'ud',
    category: 'otros',
    updatedAt: ISO,
    ...partial,
  }
}

function makeRecipe(
  partial: Partial<Recipe> & Pick<Recipe, 'id' | 'name' | 'ingredients'>,
): Recipe {
  return {
    description: '',
    servingsYield: 4,
    prepTimeMinutes: 25,
    emoji: '🍽️',
    tags: ['Comida'],
    steps: [],
    recipeNotes: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...partial,
  }
}

describe('doesPantryItemMatchIngredient', () => {
  it('empareja variantes culinarias reales y alternativas sin falsos positivos', () => {
    // Alternativas con "o", comas y paréntesis
    expect(doesPantryItemMatchIngredient('Macarrones', 'Espaguetis o macarrones')).toBe(true)
    expect(doesPantryItemMatchIngredient('Gochujang', 'Gochujang o picante')).toBe(true)
    expect(doesPantryItemMatchIngredient('Huevos', 'Pollo, bacon o huevo duro')).toBe(true)
    expect(doesPantryItemMatchIngredient('Salsa de ostras', 'Salsa hoisin (o de ostras)')).toBe(
      true,
    )
    expect(
      doesPantryItemMatchIngredient('Lao Gan Ma', 'Aceite de chile crujiente (Lao Gan Ma)'),
    ).toBe(true)

    // Genéricos frente a variedades/cortes/estados habituales
    expect(doesPantryItemMatchIngredient('Comino', 'Comino molido')).toBe(true)
    expect(doesPantryItemMatchIngredient('Garbanzos', 'Garbanzos cocidos')).toBe(true)
    expect(doesPantryItemMatchIngredient('Arroz', 'Arroz blanco')).toBe(true)
    expect(doesPantryItemMatchIngredient('Arroz redondo', 'Arroz blanco')).toBe(true)
    expect(doesPantryItemMatchIngredient('Lentejas pardinas', 'Lentejas')).toBe(true)
    expect(doesPantryItemMatchIngredient('Pollo', 'Contramuslos de pollo')).toBe(true)
    expect(doesPantryItemMatchIngredient('Cebolla', 'Cebolla morada')).toBe(true)

    // Prevención estricta de falsos positivos
    expect(doesPantryItemMatchIngredient('Leche', 'Leche de coco')).toBe(false)
    expect(doesPantryItemMatchIngredient('Ajo', 'Ajo en polvo')).toBe(false)
    expect(doesPantryItemMatchIngredient('Pollo', 'Caldo de pollo')).toBe(false)
    expect(doesPantryItemMatchIngredient('Tomate', 'Tomate triturado')).toBe(false)
    expect(doesPantryItemMatchIngredient('Tomate', 'Tomate concentrado')).toBe(false)
    expect(doesPantryItemMatchIngredient('Pimiento rojo', 'Pimiento verde')).toBe(false)
    expect(doesPantryItemMatchIngredient('Vino blanco', 'Vino tinto')).toBe(false)
    expect(doesPantryItemMatchIngredient('Carne', 'Carne picada')).toBe(false)
    expect(
      doesPantryItemMatchIngredient('Aceite', 'Aceite de chile crujiente (Lao Gan Ma)'),
    ).toBe(false)
  })
})

describe('evaluateRecipeAgainstPantry & rankRecipesByPantry', () => {
  const pantry: PantryItem[] = [
    makePantryItem({ id: 'p-ajo', name: 'Ajo', quantity: 10, unit: 'diente', category: 'verduras_frutas' }),
    makePantryItem({ id: 'p-leche', name: 'Leche', quantity: 2, unit: 'l', category: 'lacteos_huevos' }),
    makePantryItem({ id: 'p-mac', name: 'Macarrones', quantity: 100, unit: 'g', category: 'legumbres_cereales' }),
    makePantryItem({ id: 'p-gochu', name: 'Gochujang', quantity: 100, unit: 'g', category: 'especias_salsas' }),
    makePantryItem({ id: 'p-soja', name: 'Salsa de soja', quantity: 200, unit: 'ml', category: 'especias_salsas' }),
    makePantryItem({ id: 'p-huevo', name: 'Huevos', quantity: 4, unit: 'ud', category: 'lacteos_huevos' }),
    makePantryItem({ id: 'p-aguacate', name: 'Aguacate', quantity: 2, unit: 'ud', category: 'verduras_frutas' }),
    makePantryItem({ id: 'p-pan-agotado', name: 'Pan integral de hogaza', quantity: 0, unit: 'ud', category: 'panaderia' }),
    makePantryItem({ id: 'p-sal', name: 'Sal', quantity: 0, unit: 'al_gusto', category: 'especias_salsas', alwaysAvailable: true }),
  ]

  const recMacarrones = makeRecipe({
    id: 'r-macarrones',
    name: 'Macarrones de supervivencia',
    ingredients: [
      { id: 'm1', name: 'Macarrones', quantity: 1, unit: 'kg', category: 'legumbres_cereales' },
      { id: 'm2', name: 'Carne picada', quantity: 1, unit: 'kg', category: 'carnes_pescados' },
      { id: 'm3', name: 'Ajo', quantity: 3, unit: 'diente', category: 'verduras_frutas' },
      { id: 'm4', name: 'Leche', quantity: 500, unit: 'ml', category: 'lacteos_huevos' },
      { id: 'm5', name: 'Sal', quantity: 0, unit: 'al_gusto', category: 'especias_salsas' },
      { id: 'm6', name: 'Gochujang o picante', quantity: 1, unit: 'cucharadita', category: 'especias_salsas', optional: true },
    ],
  })

  const recTostadas = makeRecipe({
    id: 'r-tostadas',
    name: 'Tostadas de aguacate y huevo',
    ingredients: [
      { id: 't1', name: 'Pan integral de hogaza', quantity: 4, unit: 'ud', category: 'panaderia' },
      { id: 't2', name: 'Aguacate', quantity: 1, unit: 'ud', category: 'verduras_frutas' },
      { id: 't3', name: 'Huevo', quantity: 2, unit: 'ud', category: 'lacteos_huevos' },
    ],
  })

  const recOyakodon = makeRecipe({
    id: 'r-oyakodon',
    name: 'Oyakodon',
    ingredients: [
      { id: 'o1', name: 'Contramuslos de pollo', quantity: 200, unit: 'g', category: 'carnes_pescados' },
      { id: 'o2', name: 'Huevo', quantity: 2, unit: 'ud', category: 'lacteos_huevos' },
      { id: 'o3', name: 'Salsa de soja', quantity: 1, unit: 'cucharada', category: 'especias_salsas' },
      { id: 'o4', name: 'Sal', quantity: 0, unit: 'al_gusto', category: 'especias_salsas' },
    ],
  })

  it('prioriza por defecto las recetas con mayor cantidad de ingredientes coincidentes en casa', () => {
    const ranked = rankRecipesByPantry([recTostadas, recOyakodon, recMacarrones], pantry)

    // Macarrones: 5 en casa (Macarrones parcial, Ajo, Leche, Sal, Gochujang opc.)
    // Oyakodon: 3 en casa (Huevo, Salsa de soja en ml->cda, Sal)
    // Tostadas: 2 en casa (Aguacate, Huevo; el pan está agotado con quantity = 0)
    expect(ranked.map((r) => r.recipe.id)).toEqual(['r-macarrones', 'r-oyakodon', 'r-tostadas'])
    expect(ranked[0].scoreMatchCount).toBe(5)
    expect(ranked[1].scoreMatchCount).toBe(3)
    expect(ranked[2].scoreMatchCount).toBe(2)
  })

  it('distingue stock cubierto, cantidad parcial escalada por lotes y productos agotados', () => {
    const evalMac = evaluateRecipeAgainstPantry(recMacarrones, pantry, { batches: 1 })
    const macMatch = evalMac.ingredientMatches.find((m) => m.ingredient.id === 'm1')
    expect(macMatch?.status).toBe('partial')
    expect(macMatch?.availableFormatted).toBe('100 g')
    expect(macMatch?.missingFormatted).toBe('900 g')

    // Gochujang (100 g en despensa vs 1 cucharadita en receta) queda cubierto gracias a la equivalencia culinaria
    const gochuMatch = evalMac.ingredientMatches.find((m) => m.ingredient.id === 'm6')
    expect(gochuMatch?.status).toBe('covered')

    // Pan agotado (quantity: 0) no cuenta como disponible en Tostadas
    const evalTostadas = evaluateRecipeAgainstPantry(recTostadas, pantry)
    expect(evalTostadas.missingEssentialIngredients.map((m) => m.ingredient.id)).toEqual(['t1'])

    // Si escalamos Tostadas a 3 lotes (6 huevos necesarios vs 4 en despensa), Huevo pasa a parcial
    const evalTostadas3Batches = evaluateRecipeAgainstPantry(recTostadas, pantry, { batches: 3 })
    const huevoMatch = evalTostadas3Batches.ingredientMatches.find((m) => m.ingredient.id === 't3')
    expect(huevoMatch?.status).toBe('partial')
    expect(huevoMatch?.missingFormatted).toBe('2 uds')
  })

  it('permite filtrar por productos concretos de la despensa, ignorar básicos/opcionales y ordenar por cobertura', () => {
    // Filtrando por Aguacate + Huevos solo devuelve Tostadas
    const filteredByItems = rankRecipesByPantry(
      [recMacarrones, recTostadas, recOyakodon],
      pantry,
      { requiredPantryItemIds: ['p-aguacate', 'p-huevo'] },
    )
    expect(filteredByItems.map((r) => r.recipe.id)).toEqual(['r-tostadas'])

    // Ordenando por cobertura ('coverage_desc'): Oyakodon y Tostadas solo tienen 1 ingrediente faltante;
    // Oyakodon tiene 3/4 (75 %) cubiertos frente a Tostadas 2/3 (66,7 %)
    const byCoverage = rankRecipesByPantry(
      [recMacarrones, recTostadas, recOyakodon],
      pantry,
      { sortBy: 'coverage_desc' },
    )
    expect(byCoverage[0].recipe.id).toBe('r-oyakodon')

    // Ignorando básicos (Sal) y opcionales (Gochujang), Macarrones pasa de 5 a 3 coincidencias
    const strictEval = evaluateRecipeAgainstPantry(recMacarrones, pantry, {
      includeOptional: false,
      ignoreAlwaysAvailable: true,
    })
    expect(strictEval.scoreMatchCount).toBe(3)

    // Uso de productos de despensa excluye agotados y cuenta recetas asociadas
    const usage = getPantryItemsRecipeUsage(pantry, [recMacarrones, recTostadas, recOyakodon])
    expect(usage.find((u) => u.item.id === 'p-pan-agotado')).toBeUndefined()
    expect(usage.find((u) => u.item.id === 'p-huevo')?.matchingRecipeIds).toEqual([
      'r-tostadas',
      'r-oyakodon',
    ])
  })
})

describe('ingredientes genéricos (comodín) e ingredientes de sustitución', () => {
  it('cubre ingredientes mediante sustitutos explícitos o familias genéricas sin falsos positivos', () => {
    const pantry: PantryItem[] = [
      makePantryItem({ id: 'p-setas', name: 'Setas', quantity: 150, unit: 'g', category: 'verduras_frutas' }),
      makePantryItem({ id: 'p-calabacin', name: 'Calabacín', quantity: 150, unit: 'g', category: 'verduras_frutas' }),
      makePantryItem({ id: 'p-ajo', name: 'Ajo', quantity: 12, unit: 'diente', category: 'verduras_frutas' }),
      makePantryItem({ id: 'p-aguacate', name: 'Aguacate', quantity: 2, unit: 'ud', category: 'verduras_frutas' }),
      makePantryItem({ id: 'p-sriracha', name: 'Sriracha', quantity: 150, unit: 'ml', category: 'especias_salsas' }),
      makePantryItem({ id: 'p-tahini', name: 'Tahini', quantity: 200, unit: 'g', category: 'conservas_aceites' }),
    ]

    // Ajo y Aguacate NO deben contar como verdura de guarnición aunque estén en verduras_frutas
    expect(doesPantryItemMatchGenericGroup(pantry[2], 'verdura_guarnicion')).toBe(false)
    expect(doesPantryItemMatchGenericGroup(pantry[3], 'verdura_guarnicion')).toBe(false)
    expect(doesPantryItemMatchGenericGroup(pantry[0], 'verdura_guarnicion')).toBe(true)
    expect(doesPantryItemMatchGenericGroup(pantry[4], 'picante')).toBe(true)

    const recSalteado = makeRecipe({
      id: 'r-aprovechamiento',
      name: 'Arroz salteado de aprovechamiento',
      ingredients: [
        {
          id: 's1',
          name: 'Espárragos verdes',
          quantity: 250,
          unit: 'g',
          category: 'verduras_frutas',
          substitutes: ['Brócoli', 'Setas'],
          genericGroup: 'verdura_guarnicion',
        },
        {
          id: 's2',
          name: 'Crema de cacahuete',
          quantity: 2,
          unit: 'cucharada',
          category: 'conservas_aceites',
          substitutes: ['Tahini'],
        },
        {
          id: 's3',
          name: 'Gochujang',
          quantity: 1,
          unit: 'cucharadita',
          category: 'especias_salsas',
          optional: true,
          genericGroup: 'picante',
        },
      ],
    })

    const res = evaluateRecipeAgainstPantry(recSalteado, pantry)

    // 150g Setas (sustituto explícito) + 150g Calabacín (comodín verdura_guarnicion) = 300g >= 250g -> cubierto
    const vegMatch = res.ingredientMatches.find((m) => m.ingredient.id === 's1')
    expect(vegMatch?.status).toBe('covered')
    expect(vegMatch?.usedSubstituteNames).toEqual(['Setas', 'Calabacín'])

    // Crema de cacahuete cubierta por su sustituto Tahini (200g >= ~24g)
    const peanutMatch = res.ingredientMatches.find((m) => m.ingredient.id === 's2')
    expect(peanutMatch?.status).toBe('covered')
    expect(peanutMatch?.usedSubstituteNames).toEqual(['Tahini'])

    // Gochujang cubierto por comodín picante (Sriracha)
    const spicyMatch = res.ingredientMatches.find((m) => m.ingredient.id === 's3')
    expect(spicyMatch?.status).toBe('covered')
    expect(spicyMatch?.usedSubstituteNames).toEqual(['Sriracha'])

    expect(res.canCookFullBatchNow).toBe(true)
    expect(res.scoreMatchCount).toBe(3)
  })

  it('descuenta sustitutos libres en la lista de la compra sin reutilizar stock ya reservado por otra receta', () => {
    const recConBrocoliDirecto = makeRecipe({
      id: 'r-brocoli',
      name: 'Salmón con brócoli',
      servingsYield: 2,
      ingredients: [
        { id: 'b1', name: 'Brócoli', quantity: 250, unit: 'g', category: 'verduras_frutas' },
      ],
    })

    const recConSustituto = makeRecipe({
      id: 'r-esparragos',
      name: 'Arroz con contramuslos',
      servingsYield: 2,
      ingredients: [
        {
          id: 'e1',
          name: 'Espárragos verdes',
          quantity: 250,
          unit: 'g',
          category: 'verduras_frutas',
          substitutes: ['Brócoli', 'Setas'],
        },
      ],
    })

    const pantry: PantryItem[] = [
      makePantryItem({ id: 'p-broc', name: 'Brócoli', quantity: 400, unit: 'g', category: 'verduras_frutas' }),
    ]

    const plan = createEmptyWeekPlan('2026-11-23')
    plan.entries = [
      { id: 'w1', day: 0, slot: 'comida', recipeId: 'r-brocoli', servings: 2 },
      { id: 'w2', day: 1, slot: 'comida', recipeId: 'r-esparragos', servings: 2 },
    ]

    const shopping = computeWeekShoppingList(
      plan,
      [recConBrocoliDirecto, recConSustituto],
      pantry,
      true,
    )

    // Brócoli directo consume 250g de los 400g -> queda cubierto
    expect(
      shopping.coveredByPantryItems.some((i) => i.normalizedName === 'brocoli'),
    ).toBe(true)

    // Los 150g sobrantes de Brócoli se descuentan de los 250g de Espárragos verdes -> solo faltan 100g
    const esparragosToBuy = shopping.toBuyItems.find(
      (i) => i.normalizedName === 'esparrago verde',
    )
    expect(esparragosToBuy?.netBaseQuantity).toBe(100)
    expect(esparragosToBuy?.pantryDeductedFormatted).toBe('150 g (usando Brócoli)')
    expect(esparragosToBuy?.substituteHint).toContain('Brócoli')
  })

  it('persiste y sanea substitutes y genericGroup en sanitizeRecipe', () => {
    const clean = sanitizeRecipe({
      id: 'r-flex',
      name: 'Wok rápido',
      servingsYield: 2,
      prepTimeMinutes: 15,
      ingredients: [
        {
          id: 'i1',
          name: 'Verdura de aprovechamiento',
          quantity: 300,
          unit: 'g',
          category: 'verduras_frutas',
          genericGroup: 'verdura_guarnicion',
          substitutes: [' Brócoli ', 'Setas', 'brócoli', ''],
        },
        {
          id: 'i2',
          name: 'Salsa',
          quantity: 1,
          unit: 'cucharada',
          category: 'especias_salsas',
          genericGroup: 'grupo_inexistente',
        },
      ],
      steps: [],
    })

    expect(clean?.ingredients[0].genericGroup).toBe('verdura_guarnicion')
    expect(clean?.ingredients[0].substitutes).toEqual(['Brócoli', 'Setas'])
    expect(clean?.ingredients[1].genericGroup).toBeUndefined()
  })
})

