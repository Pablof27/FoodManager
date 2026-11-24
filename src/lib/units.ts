import type { Unit } from '../types/food'

export type UnitFamily =
  | 'mass'
  | 'volume'
  | 'unmeasured'
  | `discrete:${Exclude<Unit, 'g' | 'kg' | 'ml' | 'l' | 'al_gusto'>}`

export const UNIT_OPTIONS: readonly { value: Unit; label: string }[] = [
  { value: 'g', label: 'g (gramos)' },
  { value: 'kg', label: 'kg (kilos)' },
  { value: 'ml', label: 'ml (mililitros)' },
  { value: 'l', label: 'l (litros)' },
  { value: 'ud', label: 'ud (unidades)' },
  { value: 'diente', label: 'dientes' },
  { value: 'lata', label: 'latas / botes' },
  { value: 'sobre', label: 'sobres / paquetes' },
  { value: 'cucharada', label: 'cucharadas (cda)' },
  { value: 'cucharadita', label: 'cucharaditas (cdta)' },
  { value: 'al_gusto', label: 'al gusto / pizca' },
] as const

const INVARIANT_SPANISH_WORDS = new Set([
  'cuscus',
  'humus',
  'hummus',
  'anis',
  'avena',
  'sal',
  'miel',
  'col',
  'pan',
  'arroz',
  'maiz',
  'atun',
  'salmon',
])

const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'con', 'sin', 'en', 'al'])

function singularizeWord(word: string): string {
  if (word.length <= 3 || STOP_WORDS.has(word) || INVARIANT_SPANISH_WORDS.has(word)) {
    return word
  }
  if (word.endsWith('ces') && word.length > 4) {
    return `${word.slice(0, -3)}z`
  }
  if (/[lrndj]es$/.test(word) && word.length > 4) {
    return word.slice(0, -2)
  }
  if (/[aeiou]s$/.test(word)) {
    return word.slice(0, -1)
  }
  return word
}

/**
 * Genera una clave normalizada para agrupar ingredientes equivalentes
 * (p. ej. "Tomates pera" y "tomate pera" -> "tomate pera").
 */
export function normalizeIngredientKey(rawName: string): string {
  const cleaned = rawName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .map(singularizeWord)
    .join(' ')
}

export function getUnitFamily(unit: Unit): UnitFamily {
  if (unit === 'g' || unit === 'kg') return 'mass'
  if (unit === 'ml' || unit === 'l') return 'volume'
  if (unit === 'al_gusto') return 'unmeasured'
  return `discrete:${unit}`
}

/** Convierte una cantidad a la unidad base de su familia (g para masa, ml para volumen). */
export function toBaseQuantity(quantity: number, unit: Unit): number {
  if (unit === 'al_gusto') return 0
  const safe = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
  switch (unit) {
    case 'kg':
      return safe * 1000
    case 'l':
      return safe * 1000
    default:
      return safe
  }
}

export function roundClean(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatNumberEs(value: number): string {
  const rounded = roundClean(value)
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function formatUnitLabel(quantity: number, unit: Unit): string {
  if (unit === 'al_gusto') return 'Al gusto'
  const rounded = roundClean(quantity)
  const numStr = formatNumberEs(rounded)
  const plural = rounded !== 1

  switch (unit) {
    case 'g':
      return `${numStr} g`
    case 'kg':
      return `${numStr} kg`
    case 'ml':
      return `${numStr} ml`
    case 'l':
      return `${numStr} l`
    case 'ud':
      return `${numStr} ${plural ? 'uds' : 'ud'}`
    case 'diente':
      return `${numStr} ${plural ? 'dientes' : 'diente'}`
    case 'lata':
      return `${numStr} ${plural ? 'latas' : 'lata'}`
    case 'sobre':
      return `${numStr} ${plural ? 'sobres' : 'sobre'}`
    case 'cucharada':
      return `${numStr} ${plural ? 'cdas' : 'cda'}`
    case 'cucharadita':
      return `${numStr} ${plural ? 'cdtas' : 'cdta'}`
  }
}

/** Convierte una cantidad base (en g, ml o unidades discretas) a su mejor representación legible. */
export function fromBaseQuantity(
  baseQuantity: number,
  family: UnitFamily,
): { quantity: number; unit: Unit; formatted: string } {
  if (family === 'unmeasured') {
    return { quantity: 0, unit: 'al_gusto', formatted: 'Al gusto' }
  }

  const safe = Math.max(0, baseQuantity)

  if (family === 'mass') {
    if (safe >= 1000) {
      const kg = roundClean(safe / 1000)
      return { quantity: kg, unit: 'kg', formatted: formatUnitLabel(kg, 'kg') }
    }
    const g = roundClean(safe)
    return { quantity: g, unit: 'g', formatted: formatUnitLabel(g, 'g') }
  }

  if (family === 'volume') {
    if (safe >= 1000) {
      const l = roundClean(safe / 1000)
      return { quantity: l, unit: 'l', formatted: formatUnitLabel(l, 'l') }
    }
    const ml = roundClean(safe)
    return { quantity: ml, unit: 'ml', formatted: formatUnitLabel(ml, 'ml') }
  }

  const discreteUnit = family.replace('discrete:', '') as Exclude<
    Unit,
    'g' | 'kg' | 'ml' | 'l' | 'al_gusto'
  >
  const qty = roundClean(safe)
  return {
    quantity: qty,
    unit: discreteUnit,
    formatted: formatUnitLabel(qty, discreteUnit),
  }
}

/** Suma cantidad base a un ítem existente conservando su unidad preferida cuando resulta limpio. */
export function mergeBaseIntoUnit(
  existingQuantity: number,
  existingUnit: Unit,
  addedBaseQuantity: number,
): { quantity: number; unit: Unit } {
  if (existingUnit === 'al_gusto') {
    return { quantity: 0, unit: 'al_gusto' }
  }
  const totalBase = Math.max(0, toBaseQuantity(existingQuantity, existingUnit) + addedBaseQuantity)
  if (existingUnit === 'kg') {
    return { quantity: roundClean(totalBase / 1000), unit: 'kg' }
  }
  if (existingUnit === 'l') {
    return { quantity: roundClean(totalBase / 1000), unit: 'l' }
  }
  if (existingUnit === 'g' && totalBase >= 1000 && totalBase % 100 === 0) {
    return { quantity: roundClean(totalBase / 1000), unit: 'kg' }
  }
  if (existingUnit === 'ml' && totalBase >= 1000 && totalBase % 100 === 0) {
    return { quantity: roundClean(totalBase / 1000), unit: 'l' }
  }
  return { quantity: roundClean(totalBase), unit: existingUnit }
}
