import {
  GENERIC_GROUP_META,
  type GenericIngredientGroup,
  type PantryItem,
  type Recipe,
  type RecipeIngredient,
  type Unit,
} from '../types/food'
import {
  formatUnitLabel,
  fromBaseQuantity,
  getUnitFamily,
  normalizeIngredientKey,
  roundClean,
  toBaseQuantity,
} from './units'

export type IngredientMatchStatus = 'covered' | 'partial' | 'missing'

export type PantrySortMode = 'matches_desc' | 'coverage_desc'

export interface RecipeIngredientPantryMatch {
  ingredient: RecipeIngredient
  status: IngredientMatchStatus
  /** Ítems de despensa empleados para cubrir este ingrediente */
  matchedPantryItems: PantryItem[]
  /** Todos los ítems de despensa compatibles (directos, sustitutos o del grupo genérico) */
  allCandidatePantryItems: PantryItem[]
  /** Nombres de los productos de despensa usados como sustituto o comodín (vacío si coincide el principal) */
  usedSubstituteNames: string[]
  /** Cubierto por un básico marcado como "siempre disponible" */
  coveredByAlwaysAvailable: boolean
  /** Existe en despensa pero en una familia de unidades no convertible directamente (p. ej. latas vs g) */
  hasUnitMismatch: boolean
  /** Cantidad necesaria para los lotes indicados */
  requiredFormatted: string
  /** Cantidad disponible en despensa formateada */
  availableFormatted: string | null
  /** Cantidad faltante cuando la cobertura es parcial */
  missingFormatted: string | null
}

export interface PantrySearchOptions {
  /** Lotes de receta para comparar cantidades (por defecto 1) */
  batches?: number
  /** Incluir ingredientes opcionales en la puntuación de coincidencias (por defecto true) */
  includeOptional?: boolean
  /** Ignorar básicos marcados como alwaysAvailable en la puntuación (por defecto false) */
  ignoreAlwaysAvailable?: boolean
  /** IDs de productos concretos de la despensa que la receta debe utilizar */
  requiredPantryItemIds?: string[]
  /** Criterio principal de ordenación (por defecto 'matches_desc': más coincidencias primero) */
  sortBy?: PantrySortMode
}

export interface RecipePantryMatchResult {
  recipe: Recipe
  ingredientMatches: RecipeIngredientPantryMatch[]
  /** Total de ingredientes coincidentes según las opciones activas (métrica principal de ranking) */
  scoreMatchCount: number
  /** Total de ingredientes evaluados según las opciones activas */
  scoreTotalCount: number
  /** Proporción (0..1) de ingredientes evaluados disponibles en casa */
  scoreCoverageRatio: number
  /** Coincidencias que provienen de stock real (no básicos alwaysAvailable) */
  nonBasicMatchCount: number
  /** Métricas desglosadas de ingredientes indispensables */
  matchedEssentialCount: number
  coveredEssentialCount: number
  partialEssentialCount: number
  missingEssentialCount: number
  totalEssentialCount: number
  essentialCoverageRatio: number
  /** Métricas desglosadas de ingredientes opcionales */
  matchedOptionalCount: number
  totalOptionalCount: number
  /** Lista de ingredientes disponibles en casa (cubiertos o parciales) */
  matchedIngredients: RecipeIngredientPantryMatch[]
  /** Lista de ingredientes indispensables que faltan por completo */
  missingEssentialIngredients: RecipeIngredientPantryMatch[]
  /** Todos los ingredientes indispensables están en casa con cantidad suficiente */
  canCookFullBatchNow: boolean
  /** Todos los ingredientes indispensables están en casa (aunque alguno tenga cantidad parcial) */
  hasAllEssentialsInHouse: boolean
  /** IDs únicos de productos de despensa que coinciden en esta receta */
  matchedPantryItemIds: string[]
}

export interface PantryItemRecipeUsage {
  item: PantryItem
  matchingRecipeIds: string[]
}

const FORM_PREFIX_RE =
  /^(?:diente|cabeza|hoja|rama|ramita|manojo|manojito|pizca|chorrito|chorro) de (.+)$/

const MEAT_FISH_CUT_PREFIX_RE =
  /^(?:contramuslo|muslo|pechuga|alita|cuarto trasero|lomo|filete|solomillo|chuleta|paletilla|costilla|taco|rodaja) de (.+)$/

const LEGUME_COOKED_RE = /^(garbanzo|lenteja|alubia|judia|habichuela|frijol) cocid[oa]$/

const NON_GENERIC_BASE_HEADS = new Set([
  'salsa',
  'caldo',
  'crema',
  'pasta',
  'curry',
  'vino',
  'vinagre',
  'aceite',
])

const VARIANT_MODIFIERS = new Set([
  // Variedades, cortes o colores de un mismo ingrediente base
  'pardina',
  'pardino',
  'castellana',
  'verdina',
  'morado',
  'morada',
  'dulce',
  'tierno',
  'tierna',
  'maduro',
  'madura',
  'chino',
  'china',
  'griego',
  'griega',
  'fresco',
  'fresca',
  'seco',
  'seca',
  'molido',
  'molida',
  'rallado',
  'rallada',
  'duro',
  'dura',
  'cocido',
  'cocida',
  'casero',
  'casera',
  'fino',
  'fina',
  'grueso',
  'gruesa',
  'suave',
  'extra',
  'virgen',
  'natural',
  'mixto',
  'mixta',
  'entero',
  'entera',
  'semidesnatado',
  'semidesnatada',
  'desnatado',
  'desnatada',
  'rojo',
  'roja',
  'verde',
  'amarillo',
  'amarilla',
  'blanco',
  'blanca',
  'negro',
  'negra',
  'redondo',
  'redonda',
  'largo',
  'larga',
  'bomba',
  'basmati',
  'jazmin',
  'integral',
  'cherry',
  'pera',
  'rama',
])

/**
 * Determina si un producto de la despensa tiene existencias reales en casa
 * (descarta ítems agotados con cantidad <= 0 que no sean básicos ni "al gusto").
 */
export function isPantryItemAvailable(item: PantryItem): boolean {
  if (item.alwaysAvailable || item.unit === 'al_gusto') return true
  return Number.isFinite(item.quantity) && item.quantity > 0
}

/**
 * Extrae las variantes/alternativas normalizadas de un nombre de ingrediente.
 * Soporta expresiones como "Espaguetis o macarrones", "Pollo, bacon o huevo duro",
 * "Salsa hoisin (o de ostras)" o "Aceite de chile crujiente (Lao Gan Ma)".
 */
export function extractIngredientCandidates(rawName: string): string[] {
  const candidates = new Set<string>()

  const innerMatches: string[] = []
  const outerRaw = rawName.replace(/\(([^)]*)\)/g, (_full, inner: string) => {
    if (inner.trim()) innerMatches.push(inner.trim())
    return ' '
  })

  const splitAlternatives = (text: string): string[] =>
    text
      .split(/,|\s+o\s+/i)
      .map((part) => normalizeIngredientKey(part))
      .filter(Boolean)

  const outerParts = splitAlternatives(outerRaw)
  for (const part of outerParts) {
    candidates.add(part)
  }

  const firstOuterHead = outerParts[0]?.split(' ')[0] ?? ''

  for (const inner of innerMatches) {
    const cleanedInner = inner.replace(/^\s*o\s+/i, '').trim()
    for (const normInner of splitAlternatives(cleanedInner)) {
      if (
        firstOuterHead &&
        (normInner.startsWith('de ') ||
          normInner.startsWith('en ') ||
          normInner.startsWith('al '))
      ) {
        candidates.add(`${firstOuterHead} ${normInner}`)
      } else {
        candidates.add(normInner)
      }
    }
  }

  if (candidates.size === 0) {
    const fallback = normalizeIngredientKey(rawName)
    if (fallback) candidates.add(fallback)
  }

  return Array.from(candidates)
}

/**
 * Normaliza sinónimos cotidianos equivalentes en cocina española sin perder especificidad
 * (p. ej. "hoja de laurel" -> "laurel", "arroz blanco"/"arroz redondo" -> "arroz",
 * "garbanzo cocido" -> "garbanzo", "aceite de oliva virgen extra" -> "aceite de oliva").
 */
function toNeutralCulinaryKey(normPhrase: string): string {
  let phrase = normPhrase.trim()
  if (!phrase) return ''

  const formMatch = FORM_PREFIX_RE.exec(phrase)
  if (formMatch) {
    phrase = formMatch[1].trim()
  }

  phrase = phrase.replace(/\s+en (?:lata|bote|conserva)$/, '')

  if (
    phrase === 'aove' ||
    phrase === 'aceite de oliva virgen extra' ||
    phrase === 'aceite de oliva virgen' ||
    phrase === 'aceite de oliva suave'
  ) {
    return 'aceite de oliva'
  }

  if (phrase === 'arroz blanco' || phrase === 'arroz redondo') {
    return 'arroz'
  }

  if (phrase === 'harina de trigo') {
    return 'harina'
  }

  if (phrase === 'tomate ensalada' || phrase === 'tomate de ensalada') {
    return 'tomate'
  }

  if (phrase === 'atun al natural') {
    return 'atun'
  }

  if (phrase === 'pan integral de hogaza') {
    return 'pan integral'
  }

  const legumeMatch = LEGUME_COOKED_RE.exec(phrase)
  if (legumeMatch) {
    return legumeMatch[1]
  }

  return phrase
}

/**
 * Obtiene el ingrediente genérico base eliminando cortes cárnicos o adjetivos de variedad
 * (sin eliminar preposiciones que cambian el producto como "de coco", "en polvo", "triturado").
 */
function toGenericBaseKey(neutralPhrase: string): string {
  let phrase = neutralPhrase

  const cutMatch = MEAT_FISH_CUT_PREFIX_RE.exec(phrase)
  if (cutMatch) {
    phrase = cutMatch[1].trim()
  }

  if (phrase === 'atun en aceite de oliva' || phrase === 'atun en aceite') {
    return 'atun'
  }

  const tokens = phrase.split(' ')
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]
    // "carne picada" nunca debe reducirse a "carne"
    if ((last === 'picado' || last === 'picada') && tokens[0] === 'carne') {
      break
    }
    if (!VARIANT_MODIFIERS.has(last)) {
      break
    }
    const candidateRemaining = tokens.slice(0, -1)
    if (
      candidateRemaining.length === 1 &&
      NON_GENERIC_BASE_HEADS.has(candidateRemaining[0])
    ) {
      break
    }
    tokens.pop()
  }

  return tokens.join(' ')
}

const STANDARD_COOKING_OILS = new Set([
  'aceite de oliva',
  'aceite vegetal',
  'aceite vegetal suave',
  'aceite de girasol',
])

function doSingleCandidatesMatch(candA: string, candB: string): boolean {
  if (!candA || !candB) return false
  if (candA === candB) return true

  const neutralA = toNeutralCulinaryKey(candA)
  const neutralB = toNeutralCulinaryKey(candB)
  if (neutralA === neutralB) return true

  if (
    (neutralA === 'aceite' && STANDARD_COOKING_OILS.has(neutralB)) ||
    (neutralB === 'aceite' && STANDARD_COOKING_OILS.has(neutralA))
  ) {
    return true
  }

  const baseA = toGenericBaseKey(neutralA)
  const baseB = toGenericBaseKey(neutralB)

  // Solo empareja por base genérica cuando al menos uno de los dos lados ES el genérico puro
  // (ej. "cebolla" <-> "cebolla morada" sí; "pimiento rojo" <-> "pimiento verde" no)
  if (baseA === baseB && (neutralA === baseA || neutralB === baseB)) {
    return true
  }

  return false
}

/**
 * Comprueba si un producto de la despensa sirve para cubrir un ingrediente de receta por nombre directo.
 */
export function doesPantryItemMatchIngredient(
  pantryName: string,
  recipeIngredientName: string,
): boolean {
  const pantryCandidates = extractIngredientCandidates(pantryName)
  const recipeCandidates = extractIngredientCandidates(recipeIngredientName)

  for (const pCand of pantryCandidates) {
    for (const rCand of recipeCandidates) {
      if (doSingleCandidatesMatch(pCand, rCand)) {
        return true
      }
    }
  }
  return false
}

const NON_VEGETABLE_PRODUCE = new Set([
  'ajo',
  'ajo en polvo',
  'jengibre',
  'perejil',
  'cilantro',
  'albahaca',
  'menta',
  'hierbabuena',
  'cebollino',
  'eneldo',
  'romero',
  'tomillo',
  'oregano',
  'laurel',
  'limon',
  'lima',
  'naranja',
  'mandarina',
  'pomelo',
  'manzana',
  'pera',
  'platano',
  'banana',
  'fresa',
  'frambuesa',
  'arandano',
  'uva',
  'melon',
  'sandia',
  'melocoton',
  'nectarina',
  'albaricoque',
  'ciruela',
  'kiwi',
  'pina',
  'mango',
  'papaya',
  'aguacate',
  'granada',
  'higo',
  'cereza',
  'fruta',
  'fruta de temporada',
])

const VEGETABLE_BASES = new Set([
  'esparrago',
  'brocoli',
  'bimi',
  'coliflor',
  'seta',
  'champinon',
  'portobello',
  'shiitake',
  'boletus',
  'niscalo',
  'calabacin',
  'berenjena',
  'pimiento',
  'zanahoria',
  'espinaca',
  'acelga',
  'judia verde',
  'guisante',
  'puerro',
  'repollo',
  'col',
  'lombarda',
  'bok choy',
  'pak choi',
  'apio',
  'calabaza',
  'boniato',
  'patata',
  'nabo',
  'alcachofa',
  'cebolla',
  'cebolleta',
  'ajete',
  'tomate',
  'maiz',
  'haba',
  'hinojo',
  'endibia',
  'tirabeque',
  'edamame',
  'menestra',
])

const LEAFY_GREEN_BASES = new Set([
  'espinaca',
  'rucula',
  'brote',
  'brote tierno',
  'lechuga',
  'canonigo',
  'escarola',
  'kale',
  'acelga',
  'bok choy',
  'pak choi',
  'berro',
  'mezclum',
  'endibia',
])

const MUSHROOM_BASES = new Set([
  'seta',
  'champinon',
  'portobello',
  'shiitake',
  'boletus',
  'niscalo',
  'girgola',
  'rebozuelo',
  'hongo',
])

const FRESH_HERB_BASES = new Set([
  'perejil',
  'cilantro',
  'albahaca',
  'menta',
  'hierbabuena',
  'cebollino',
  'eneldo',
])

const SPICY_TOKENS = new Set([
  'gochujang',
  'cayena',
  'guindilla',
  'chile',
  'chili',
  'aji',
  'tabasco',
  'sriracha',
  'valentina',
  'harissa',
  'sambal',
  'jalapeno',
  'habanero',
  'chipotle',
  'shichimi',
  'togarashi',
  'piparra',
  'picante',
])

const PASTA_BASES = new Set([
  'pasta',
  'macarron',
  'espagueti',
  'tallarin',
  'penne',
  'fusilli',
  'helice',
  'espiral',
  'lazo',
  'rigatoni',
  'fettuccine',
  'tagliatelle',
  'farfalle',
  'tortellini',
  'ravioli',
  'fideo',
  'noodle',
  'udon',
  'ramen',
  'soba',
  'lasana',
  'placa de lasana',
  'canelon',
  'noqui',
  'noqui de patata',
])

const GRAIN_BASES = new Set([
  'arroz',
  'quinoa',
  'cuscus',
  'bulgur',
  'mijo',
  'trigo tierno',
  'cebada',
  'avena',
])

const LEGUME_BASES = new Set([
  'garbanzo',
  'lenteja',
  'alubia',
  'judia',
  'judia blanca',
  'judia pinta',
  'judia negra',
  'habichuela',
  'frijol',
  'fabes',
  'azuki',
  'edamame',
  'guisante',
  'haba',
  'soja texturizada',
])

const MELTING_CHEESE_BASES = new Set([
  'mozzarella',
  'parmesano',
  'queso parmesano',
  'grana padano',
  'pecorino',
  'cheddar',
  'gouda',
  'emmental',
  'gruyere',
  'provolone',
  'manchego',
  'havarti',
  'edam',
  'raclette',
  'tetilla',
  'queso rallado',
  'queso',
])

const CREAMY_BASES = new Set([
  'nata',
  'nata para cocinar',
  'creme fraiche',
  'crema agria',
  'yogur',
  'yogur griego',
  'leche evaporada',
  'leche de coco',
  'queso crema',
  'mascarpone',
  'ricotta',
  'requeson',
])

const PROTEIN_BASES = new Set([
  'pollo',
  'pavo',
  'ternera',
  'cerdo',
  'cordero',
  'carne picada',
  'lomo',
  'solomillo',
  'jamon',
  'bacon',
  'panceta',
  'chorizo',
  'longaniza',
  'salchicha',
  'atun',
  'bonito',
  'salmon',
  'merluza',
  'bacalao',
  'dorada',
  'lubina',
  'gamba',
  'langostino',
  'pulpo',
  'calamar',
  'sepia',
  'mejillon',
  'huevo',
  'tofu',
  'seitan',
  'tempeh',
  'heura',
  'soja texturizada',
  'morcillo',
])

const BROTH_BASES = new Set([
  'fumet',
  'pastilla de caldo',
  'avecrem',
  'demi glace',
  'bovril',
])

const CITRUS_BASES = new Set([
  'limon',
  'lima',
  'zumo de limon',
  'zumo de lima',
])

const NUT_SEED_BASES = new Set([
  'nuez',
  'almendra',
  'cacahuete',
  'anacardo',
  'avellana',
  'pistacho',
  'pinon',
  'castana',
  'sesamo',
  'semilla de sesamo',
  'pipa',
  'pipa de girasol',
  'pipa de calabaza',
])

/**
 * Detecta si el texto libre de un ingrediente ya expresa una familia genérica
 * (p. ej. "Gochujang o picante", "Verduras de aprovechamiento").
 */
export function resolveEffectiveGenericGroup(
  ingredient: Pick<RecipeIngredient, 'name' | 'genericGroup'>,
): GenericIngredientGroup | undefined {
  if (ingredient.genericGroup) return ingredient.genericGroup
  const raw = ingredient.name.trim()
  if (/\b(?:o|u)\s+(?:otro\s+)?picante\b/i.test(raw) || /^picante(?:\s+al\s+gusto)?$/i.test(raw)) {
    return 'picante'
  }
  if (/^verduras?\s+(?:al\s+gusto|de\s+aprovechamiento|de\s+temporada|de\s+nevera|variadas?)$/i.test(raw)) {
    return 'verdura_guarnicion'
  }
  if (/^setas?\s+(?:variadas?|al\s+gusto|o\s+champinones|o\s+champiñones)$/i.test(raw)) {
    return 'setas_hongos'
  }
  if (/^queso\s+para\s+(?:fundir|gratinar|rallar)$/i.test(raw)) {
    return 'queso_fundir'
  }
  if (/^prote[ií]nas?\s+(?:al\s+gusto|de\s+aprovechamiento)$/i.test(raw)) {
    return 'proteina'
  }
  return undefined
}

/**
 * Comprueba si un producto de la despensa pertenece a una familia genérica / comodín culinaria.
 */
export function doesPantryItemMatchGenericGroup(
  item: PantryItem,
  group: GenericIngredientGroup,
): boolean {
  const candidates = extractIngredientCandidates(item.name)

  for (const cand of candidates) {
    const neutral = toNeutralCulinaryKey(cand)
    const base = toGenericBaseKey(neutral)
    const tokens = neutral.split(' ')

    switch (group) {
      case 'verdura_guarnicion': {
        if (NON_VEGETABLE_PRODUCE.has(neutral) || NON_VEGETABLE_PRODUCE.has(base)) {
          break
        }
        if (
          NON_GENERIC_BASE_HEADS.has(tokens[0]) ||
          neutral.startsWith('tomate triturado') ||
          neutral.startsWith('tomate concentrado') ||
          neutral.startsWith('tomate frito') ||
          tokens.includes('polvo')
        ) {
          break
        }
        if (
          VEGETABLE_BASES.has(base) ||
          VEGETABLE_BASES.has(neutral) ||
          item.category === 'verduras_frutas'
        ) {
          return true
        }
        break
      }

      case 'hoja_verde': {
        if (LEAFY_GREEN_BASES.has(base) || LEAFY_GREEN_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'setas_hongos': {
        if (MUSHROOM_BASES.has(base) || MUSHROOM_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'hierba_fresca': {
        if (
          tokens.includes('polvo') ||
          tokens.includes('molido') ||
          tokens.includes('molida') ||
          tokens.includes('seco') ||
          tokens.includes('seca')
        ) {
          break
        }
        if (FRESH_HERB_BASES.has(base) || FRESH_HERB_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'picante': {
        if (
          tokens.some((t) => SPICY_TOKENS.has(t)) ||
          neutral.includes('lao gan ma') ||
          neutral.includes('aceite de chile') ||
          neutral === 'pimienta de sichuan'
        ) {
          return true
        }
        break
      }

      case 'pasta': {
        if (
          neutral.startsWith('pasta de ') &&
          neutral !== 'pasta de trigo' &&
          neutral !== 'pasta de lenteja' &&
          neutral !== 'pasta de garbanzo'
        ) {
          break
        }
        if (PASTA_BASES.has(base) || PASTA_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'arroz_grano': {
        if (
          neutral.startsWith('vinagre de ') ||
          neutral.startsWith('leche de ') ||
          neutral.startsWith('harina de ') ||
          neutral.startsWith('papel de ') ||
          neutral.startsWith('vino de ')
        ) {
          break
        }
        if (GRAIN_BASES.has(base) || GRAIN_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'legumbre': {
        if (
          neutral.startsWith('salsa de ') ||
          neutral.startsWith('leche de ') ||
          neutral.startsWith('brote de ') ||
          neutral.startsWith('harina de ')
        ) {
          break
        }
        if (LEGUME_BASES.has(base) || LEGUME_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'queso_fundir': {
        if (
          neutral === 'queso batido' ||
          neutral === 'queso crema' ||
          neutral === 'queso fresco'
        ) {
          break
        }
        if (
          MELTING_CHEESE_BASES.has(base) ||
          MELTING_CHEESE_BASES.has(neutral) ||
          tokens[0] === 'queso'
        ) {
          return true
        }
        break
      }

      case 'lacteo_cremoso': {
        if (CREAMY_BASES.has(base) || CREAMY_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'proteina': {
        if (
          tokens[0] === 'caldo' ||
          tokens[0] === 'hueso' ||
          tokens[0] === 'pastilla' ||
          tokens[0] === 'salsa'
        ) {
          break
        }
        if (PROTEIN_BASES.has(base) || PROTEIN_BASES.has(neutral)) {
          return true
        }
        break
      }

      case 'caldo': {
        if (tokens[0] === 'caldo' || BROTH_BASES.has(neutral) || BROTH_BASES.has(base)) {
          return true
        }
        break
      }

      case 'acido_citrico': {
        if (
          tokens[0] === 'vinagre' ||
          CITRUS_BASES.has(base) ||
          CITRUS_BASES.has(neutral)
        ) {
          return true
        }
        break
      }

      case 'frutos_secos': {
        if (
          neutral === 'nuez moscada' ||
          neutral.startsWith('crema de ') ||
          neutral.startsWith('mantequilla de ') ||
          neutral.startsWith('leche de ') ||
          neutral.startsWith('aceite de ')
        ) {
          break
        }
        if (NUT_SEED_BASES.has(base) || NUT_SEED_BASES.has(neutral)) {
          return true
        }
        break
      }
    }
  }

  return false
}

/**
 * Comprueba si un ítem de despensa cubre un ingrediente de receta como sustituto explícito o comodín.
 */
export function doesPantryItemMatchSubstituteOrGeneric(
  item: PantryItem,
  ingredient: Pick<RecipeIngredient, 'name' | 'substitutes' | 'genericGroup'>,
): 'substitute' | 'generic' | null {
  if (ingredient.substitutes && ingredient.substitutes.length > 0) {
    for (const sub of ingredient.substitutes) {
      if (doesPantryItemMatchIngredient(item.name, sub)) {
        return 'substitute'
      }
    }
  }

  const effectiveGroup = resolveEffectiveGenericGroup(ingredient)
  if (effectiveGroup && doesPantryItemMatchGenericGroup(item, effectiveGroup)) {
    return 'generic'
  }

  return null
}

/**
 * Devuelve un texto breve describiendo los sustitutos o carácter comodín de un ingrediente,
 * útil tanto en tarjetas/modales como en la lista de la compra.
 */
export function formatIngredientFlexibilityHint(
  ingredient: Pick<RecipeIngredient, 'name' | 'substitutes' | 'genericGroup'>,
): string | null {
  const subs = ingredient.substitutes?.filter((s) => s.trim().length > 0) ?? []
  const group = resolveEffectiveGenericGroup(ingredient)
  const groupMeta = group ? GENERIC_GROUP_META[group] : undefined

  if (groupMeta && subs.length > 0) {
    return `${groupMeta.shortLabel} · Ej: ${subs.slice(0, 4).join(', ')}${subs.length > 4 ? '…' : ''}`
  }
  if (subs.length > 0) {
    return `Sustituible por: ${subs.slice(0, 4).join(', ')}${subs.length > 4 ? '…' : ''}`
  }
  if (groupMeta) {
    return `${groupMeta.shortLabel}: ${groupMeta.suggestedSubstitutes.slice(0, 4).join(', ')}…`
  }
  return null
}

/**
 * Conversión aproximada de cucharadas/cucharaditas cuando la despensa guarda el bote en g o ml.
 */
export function approximateSpoonRequirement(
  quantity: number,
  spoonUnit: 'cucharada' | 'cucharadita',
  targetFamily: 'mass' | 'volume',
): number {
  const safeQty = Math.max(0, quantity)
  if (spoonUnit === 'cucharada') {
    return safeQty * (targetFamily === 'volume' ? 15 : 12)
  }
  return safeQty * 5
}

interface PoolCoverageEvaluation {
  status: IngredientMatchStatus
  coveredByAlwaysAvailable: boolean
  hasUnitMismatch: boolean
  availableFormatted: string | null
  missingFormatted: string | null
}

function evaluatePantryPoolForIngredient(
  ingredient: RecipeIngredient,
  matchedPantryItems: PantryItem[],
  scaledQty: number,
  requiredFormatted: string,
): PoolCoverageEvaluation {
  if (matchedPantryItems.length === 0) {
    return {
      status: 'missing',
      coveredByAlwaysAvailable: false,
      hasUnitMismatch: false,
      availableFormatted: null,
      missingFormatted: ingredient.unit === 'al_gusto' ? null : requiredFormatted,
    }
  }

  const coveredByAlwaysAvailable = matchedPantryItems.some((p) => Boolean(p.alwaysAvailable))
  if (coveredByAlwaysAvailable) {
    return {
      status: 'covered',
      coveredByAlwaysAvailable: true,
      hasUnitMismatch: false,
      availableFormatted: 'Básico en casa',
      missingFormatted: null,
    }
  }

  if (matchedPantryItems.some((p) => p.unit === 'al_gusto')) {
    return {
      status: 'covered',
      coveredByAlwaysAvailable: false,
      hasUnitMismatch: false,
      availableFormatted: 'En despensa',
      missingFormatted: null,
    }
  }

  const ingFamily = getUnitFamily(ingredient.unit)

  if (ingFamily === 'unmeasured') {
    const summary = matchedPantryItems
      .map((p) => formatUnitLabel(p.quantity, p.unit))
      .join(' + ')
    return {
      status: 'covered',
      coveredByAlwaysAvailable: false,
      hasUnitMismatch: false,
      availableFormatted: summary || 'En despensa',
      missingFormatted: null,
    }
  }

  let compatibleBase = 0
  let pantryMassBase = 0
  let pantryVolumeBase = 0
  const incompatibleLabels: string[] = []

  for (const p of matchedPantryItems) {
    const pFamily = getUnitFamily(p.unit)
    if (pFamily === ingFamily) {
      compatibleBase = roundClean(compatibleBase + toBaseQuantity(p.quantity, p.unit))
    } else {
      if (pFamily === 'mass') {
        pantryMassBase = roundClean(pantryMassBase + toBaseQuantity(p.quantity, p.unit))
      } else if (pFamily === 'volume') {
        pantryVolumeBase = roundClean(pantryVolumeBase + toBaseQuantity(p.quantity, p.unit))
      }
      incompatibleLabels.push(formatUnitLabel(p.quantity, p.unit))
    }
  }

  const requiredBase = toBaseQuantity(scaledQty, ingredient.unit)

  if (compatibleBase > 0) {
    const availableInfo = fromBaseQuantity(compatibleBase, ingFamily)
    if (compatibleBase >= requiredBase || requiredBase <= 0) {
      return {
        status: 'covered',
        coveredByAlwaysAvailable: false,
        hasUnitMismatch: false,
        availableFormatted: availableInfo.formatted,
        missingFormatted: null,
      }
    }

    if (incompatibleLabels.length > 0) {
      return {
        status: 'covered',
        coveredByAlwaysAvailable: false,
        hasUnitMismatch: true,
        availableFormatted: `${availableInfo.formatted} + ${incompatibleLabels.join(', ')}`,
        missingFormatted: null,
      }
    }

    const missingInfo = fromBaseQuantity(
      roundClean(Math.max(0, requiredBase - compatibleBase)),
      ingFamily,
    )
    return {
      status: 'partial',
      coveredByAlwaysAvailable: false,
      hasUnitMismatch: false,
      availableFormatted: availableInfo.formatted,
      missingFormatted: missingInfo.formatted,
    }
  }

  if (ingredient.unit === 'cucharada' || ingredient.unit === 'cucharadita') {
    if (pantryVolumeBase > 0) {
      const approxMl = approximateSpoonRequirement(scaledQty, ingredient.unit, 'volume')
      const availFormatted = fromBaseQuantity(pantryVolumeBase, 'volume').formatted
      if (pantryVolumeBase >= approxMl) {
        return {
          status: 'covered',
          coveredByAlwaysAvailable: false,
          hasUnitMismatch: false,
          availableFormatted: availFormatted,
          missingFormatted: null,
        }
      }
      const missingMl = fromBaseQuantity(
        roundClean(Math.max(0, approxMl - pantryVolumeBase)),
        'volume',
      ).formatted
      return {
        status: 'partial',
        coveredByAlwaysAvailable: false,
        hasUnitMismatch: false,
        availableFormatted: availFormatted,
        missingFormatted: missingMl,
      }
    }

    if (pantryMassBase > 0) {
      const approxGrams = approximateSpoonRequirement(scaledQty, ingredient.unit, 'mass')
      const availFormatted = fromBaseQuantity(pantryMassBase, 'mass').formatted
      if (pantryMassBase >= approxGrams) {
        return {
          status: 'covered',
          coveredByAlwaysAvailable: false,
          hasUnitMismatch: false,
          availableFormatted: availFormatted,
          missingFormatted: null,
        }
      }
      const missingGrams = fromBaseQuantity(
        roundClean(Math.max(0, approxGrams - pantryMassBase)),
        'mass',
      ).formatted
      return {
        status: 'partial',
        coveredByAlwaysAvailable: false,
        hasUnitMismatch: false,
        availableFormatted: availFormatted,
        missingFormatted: missingGrams,
      }
    }
  }

  return {
    status: 'covered',
    coveredByAlwaysAvailable: false,
    hasUnitMismatch: true,
    availableFormatted: incompatibleLabels.join(' + ') || 'En despensa',
    missingFormatted: null,
  }
}

/**
 * Evalúa un ingrediente concreto de receta frente a los productos disponibles en despensa,
 * considerando primero coincidencia directa, luego sustitutos explícitos y por último su familia genérica.
 */
export function matchRecipeIngredientWithPantry(
  ingredient: RecipeIngredient,
  availablePantry: PantryItem[],
  batches = 1,
  preferredPantryIds: readonly string[] = [],
): RecipeIngredientPantryMatch {
  const safeBatches = Math.max(0.25, batches)
  const scaledQty = roundClean(ingredient.quantity * safeBatches)
  const requiredFormatted =
    ingredient.unit === 'al_gusto'
      ? 'Al gusto'
      : formatUnitLabel(scaledQty, ingredient.unit)

  const directItems: PantryItem[] = []
  const explicitSubItems: PantryItem[] = []
  const genericItems: PantryItem[] = []

  for (const p of availablePantry) {
    if (doesPantryItemMatchIngredient(p.name, ingredient.name)) {
      directItems.push(p)
      continue
    }
    const flexKind = doesPantryItemMatchSubstituteOrGeneric(p, ingredient)
    if (flexKind === 'substitute') {
      explicitSubItems.push(p)
    } else if (flexKind === 'generic') {
      genericItems.push(p)
    }
  }

  const allCandidatePantryItems = [...directItems, ...explicitSubItems, ...genericItems]

  if (allCandidatePantryItems.length === 0) {
    return {
      ingredient,
      status: 'missing',
      matchedPantryItems: [],
      allCandidatePantryItems: [],
      usedSubstituteNames: [],
      coveredByAlwaysAvailable: false,
      hasUnitMismatch: false,
      requiredFormatted,
      availableFormatted: null,
      missingFormatted: ingredient.unit === 'al_gusto' ? null : requiredFormatted,
    }
  }

  const preferredSet = new Set(preferredPantryIds)
  const sortedAltItems = [...explicitSubItems, ...genericItems].sort((a, b) => {
    const aPref = preferredSet.has(a.id) ? 1 : 0
    const bPref = preferredSet.has(b.id) ? 1 : 0
    return bPref - aPref
  })

  const userExplicitlyFilteredAlt =
    preferredSet.size > 0 &&
    !directItems.some((d) => preferredSet.has(d.id)) &&
    sortedAltItems.some((alt) => preferredSet.has(alt.id))

  if (directItems.length > 0 && !userExplicitlyFilteredAlt) {
    const directEval = evaluatePantryPoolForIngredient(
      ingredient,
      directItems,
      scaledQty,
      requiredFormatted,
    )
    if (directEval.status === 'covered' || sortedAltItems.length === 0) {
      return {
        ingredient,
        matchedPantryItems: directItems,
        allCandidatePantryItems,
        usedSubstituteNames: [],
        requiredFormatted,
        ...directEval,
      }
    }

    const chosenItems = [...directItems]
    const usedSubs: string[] = []
    let combinedEval = directEval

    for (const alt of sortedAltItems) {
      chosenItems.push(alt)
      usedSubs.push(alt.name)
      combinedEval = evaluatePantryPoolForIngredient(
        ingredient,
        chosenItems,
        scaledQty,
        requiredFormatted,
      )
      if (combinedEval.status === 'covered') break
    }

    return {
      ingredient,
      matchedPantryItems: chosenItems,
      allCandidatePantryItems,
      usedSubstituteNames: usedSubs,
      requiredFormatted,
      ...combinedEval,
    }
  }

  for (const singleAlt of sortedAltItems) {
    const singleEval = evaluatePantryPoolForIngredient(
      ingredient,
      [singleAlt],
      scaledQty,
      requiredFormatted,
    )
    if (singleEval.status === 'covered') {
      return {
        ingredient,
        matchedPantryItems: [singleAlt],
        allCandidatePantryItems,
        usedSubstituteNames: [singleAlt.name],
        requiredFormatted,
        ...singleEval,
      }
    }
  }

  const chosenAltItems: PantryItem[] = []
  let multiAltEval = evaluatePantryPoolForIngredient(
    ingredient,
    [],
    scaledQty,
    requiredFormatted,
  )

  for (const alt of sortedAltItems) {
    chosenAltItems.push(alt)
    multiAltEval = evaluatePantryPoolForIngredient(
      ingredient,
      chosenAltItems,
      scaledQty,
      requiredFormatted,
    )
    if (multiAltEval.status === 'covered') break
  }

  return {
    ingredient,
    matchedPantryItems: chosenAltItems,
    allCandidatePantryItems,
    usedSubstituteNames: chosenAltItems.map((i) => i.name),
    requiredFormatted,
    ...multiAltEval,
  }
}

function countsForScore(
  match: RecipeIngredientPantryMatch,
  includeOptional: boolean,
  ignoreAlwaysAvailable: boolean,
): boolean {
  if (match.ingredient.optional && !includeOptional) return false
  if (ignoreAlwaysAvailable && match.coveredByAlwaysAvailable) return false
  return true
}

/**
 * Evalúa todos los ingredientes de una receta frente a la despensa actual.
 */
export function evaluateRecipeAgainstPantry(
  recipe: Recipe,
  pantry: PantryItem[],
  options: PantrySearchOptions = {},
): RecipePantryMatchResult {
  const {
    batches = 1,
    includeOptional = true,
    ignoreAlwaysAvailable = false,
    requiredPantryItemIds = [],
  } = options

  const availablePantry = pantry.filter(isPantryItemAvailable)
  const ingredientMatches = recipe.ingredients.map((ing) =>
    matchRecipeIngredientWithPantry(ing, availablePantry, batches, requiredPantryItemIds),
  )

  const essentialMatches = ingredientMatches.filter((m) => !m.ingredient.optional)
  const optionalMatches = ingredientMatches.filter((m) => Boolean(m.ingredient.optional))

  const coveredEssentialCount = essentialMatches.filter((m) => m.status === 'covered').length
  const partialEssentialCount = essentialMatches.filter((m) => m.status === 'partial').length
  const matchedEssentialCount = coveredEssentialCount + partialEssentialCount
  const totalEssentialCount = essentialMatches.length
  const missingEssentialCount = totalEssentialCount - matchedEssentialCount
  const essentialCoverageRatio =
    totalEssentialCount > 0 ? matchedEssentialCount / totalEssentialCount : 1

  const matchedOptionalCount = optionalMatches.filter((m) => m.status !== 'missing').length
  const totalOptionalCount = optionalMatches.length

  const scoredPool = ingredientMatches.filter((m) =>
    countsForScore(m, includeOptional, ignoreAlwaysAvailable),
  )
  const scoreMatchCount = scoredPool.filter((m) => m.status !== 'missing').length
  const scoreTotalCount = scoredPool.length
  const scoreCoverageRatio = scoreTotalCount > 0 ? scoreMatchCount / scoreTotalCount : 0

  const nonBasicMatchCount = ingredientMatches.filter(
    (m) =>
      m.status !== 'missing' &&
      !m.coveredByAlwaysAvailable &&
      (includeOptional || !m.ingredient.optional),
  ).length

  const matchedIngredients = ingredientMatches.filter((m) => m.status !== 'missing')
  const missingEssentialIngredients = essentialMatches.filter((m) => m.status === 'missing')

  const pantryIdSet = new Set<string>()
  for (const m of matchedIngredients) {
    for (const p of m.allCandidatePantryItems) {
      pantryIdSet.add(p.id)
    }
  }

  const canCookFullBatchNow =
    totalEssentialCount > 0 &&
    missingEssentialCount === 0 &&
    partialEssentialCount === 0

  const hasAllEssentialsInHouse =
    totalEssentialCount > 0 && missingEssentialCount === 0

  return {
    recipe,
    ingredientMatches,
    scoreMatchCount,
    scoreTotalCount,
    scoreCoverageRatio,
    nonBasicMatchCount,
    matchedEssentialCount,
    coveredEssentialCount,
    partialEssentialCount,
    missingEssentialCount,
    totalEssentialCount,
    essentialCoverageRatio,
    matchedOptionalCount,
    totalOptionalCount,
    matchedIngredients,
    missingEssentialIngredients,
    canCookFullBatchNow,
    hasAllEssentialsInHouse,
    matchedPantryItemIds: Array.from(pantryIdSet),
  }
}

/**
 * Busca y ordena las recetas en función de los ingredientes disponibles en la despensa.
 * Por defecto prioriza las recetas con MAYOR CANTIDAD de ingredientes coincidentes en casa,
 * desempatando por coincidencias indispensables, stock no básico, porcentaje cubierto y menos faltantes.
 */
export function rankRecipesByPantry(
  recipes: Recipe[],
  pantry: PantryItem[],
  options: PantrySearchOptions = {},
): RecipePantryMatchResult[] {
  const { requiredPantryItemIds = [], sortBy = 'matches_desc' } = options

  const evaluated = recipes.map((recipe) =>
    evaluateRecipeAgainstPantry(recipe, pantry, options),
  )

  const filtered =
    requiredPantryItemIds.length > 0
      ? evaluated.filter((res) =>
          requiredPantryItemIds.every((reqId) =>
            res.matchedPantryItemIds.includes(reqId),
          ),
        )
      : evaluated

  return filtered.sort((a, b) => {
    if (sortBy === 'coverage_desc') {
      const aHasAny = a.scoreMatchCount > 0 ? 1 : 0
      const bHasAny = b.scoreMatchCount > 0 ? 1 : 0
      if (bHasAny !== aHasAny) return bHasAny - aHasAny

      // Cuántos ingredientes indispensables faltan o están incompletos para cocinar 1 lote entero
      const aUncoveredEssentials = a.missingEssentialCount + a.partialEssentialCount
      const bUncoveredEssentials = b.missingEssentialCount + b.partialEssentialCount
      if (aUncoveredEssentials !== bUncoveredEssentials) {
        return aUncoveredEssentials - bUncoveredEssentials
      }
      if (a.missingEssentialCount !== b.missingEssentialCount) {
        return a.missingEssentialCount - b.missingEssentialCount
      }
      const aFullRatio =
        a.totalEssentialCount > 0 ? a.coveredEssentialCount / a.totalEssentialCount : 1
      const bFullRatio =
        b.totalEssentialCount > 0 ? b.coveredEssentialCount / b.totalEssentialCount : 1
      if (bFullRatio !== aFullRatio) {
        return bFullRatio - aFullRatio
      }
      if (b.essentialCoverageRatio !== a.essentialCoverageRatio) {
        return b.essentialCoverageRatio - a.essentialCoverageRatio
      }
      if (b.scoreMatchCount !== a.scoreMatchCount) {
        return b.scoreMatchCount - a.scoreMatchCount
      }
      return a.recipe.name.localeCompare(b.recipe.name, 'es')
    }

    // Ordenación principal por defecto ('matches_desc'):
    // 1. Mayor número total de ingredientes coincidentes en casa
    if (b.scoreMatchCount !== a.scoreMatchCount) {
      return b.scoreMatchCount - a.scoreMatchCount
    }
    // 2. A igualdad de coincidencias, priorizar más ingredientes indispensables en casa
    if (b.matchedEssentialCount !== a.matchedEssentialCount) {
      return b.matchedEssentialCount - a.matchedEssentialCount
    }
    // 3. Priorizar ingredientes reales de despensa frente a básicos (sal, aceite...)
    if (b.nonBasicMatchCount !== a.nonBasicMatchCount) {
      return b.nonBasicMatchCount - a.nonBasicMatchCount
    }
    // 4. Mayor porcentaje de indispensables cubiertos
    if (b.essentialCoverageRatio !== a.essentialCoverageRatio) {
      return b.essentialCoverageRatio - a.essentialCoverageRatio
    }
    // 5. Más indispensables con cantidad 100 % cubierta (frente a parcial)
    if (b.coveredEssentialCount !== a.coveredEssentialCount) {
      return b.coveredEssentialCount - a.coveredEssentialCount
    }
    // 6. Menos ingredientes indispensables faltantes
    if (a.missingEssentialCount !== b.missingEssentialCount) {
      return a.missingEssentialCount - b.missingEssentialCount
    }
    return a.recipe.name.localeCompare(b.recipe.name, 'es')
  })
}

/**
 * Devuelve los productos disponibles en despensa junto con las recetas en las que se pueden aprovechar.
 */
export function getPantryItemsRecipeUsage(
  pantry: PantryItem[],
  recipes: Recipe[],
): PantryItemRecipeUsage[] {
  const available = pantry.filter(isPantryItemAvailable)

  return available
    .map((item) => {
      const matchingRecipeIds = recipes
        .filter((recipe) =>
          recipe.ingredients.some(
            (ing) =>
              doesPantryItemMatchIngredient(item.name, ing.name) ||
              doesPantryItemMatchSubstituteOrGeneric(item, ing) !== null,
          ),
        )
        .map((r) => r.id)

      return {
        item,
        matchingRecipeIds,
      }
    })
    .sort((a, b) => {
      // Primero ingredientes con más recetas asociadas (dejando básicos al final para no saturar)
      const aBasic = a.item.alwaysAvailable ? 1 : 0
      const bBasic = b.item.alwaysAvailable ? 1 : 0
      if (aBasic !== bBasic) return aBasic - bBasic
      if (b.matchingRecipeIds.length !== a.matchingRecipeIds.length) {
        return b.matchingRecipeIds.length - a.matchingRecipeIds.length
      }
      return a.item.name.localeCompare(b.item.name, 'es')
    })
}

export type { Unit }
