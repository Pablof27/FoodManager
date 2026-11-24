import type { DayIndex } from '../types/food'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function parseLocalIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Devuelve el lunes (YYYY-MM-DD) de la semana correspondiente a la fecha dada. */
export function getMondayIso(date: Date = new Date()): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const jsDay = copy.getDay() // 0 = Domingo, 1 = Lunes ...
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay
  copy.setDate(copy.getDate() + diffToMonday)
  return formatLocalIsoDate(copy)
}

export function addWeeksIso(mondayIso: string, deltaWeeks: number): string {
  const d = parseLocalIsoDate(mondayIso)
  d.setDate(d.getDate() + deltaWeeks * 7)
  return formatLocalIsoDate(d)
}

export function getDayDate(mondayIso: string, dayIndex: DayIndex): Date {
  const d = parseLocalIsoDate(mondayIso)
  d.setDate(d.getDate() + dayIndex)
  return d
}

export function formatWeekRangeLabel(mondayIso: string): string {
  const start = parseLocalIsoDate(mondayIso)
  const end = getDayDate(mondayIso, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const sameYear = start.getFullYear() === end.getFullYear()

  const startDay = start.getDate()
  const endDay = end.getDate()
  const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'short' })
  const startMonth = monthFmt.format(start).replace('.', '')
  const endMonth = monthFmt.format(end).replace('.', '')

  if (sameMonth && sameYear) {
    return `${startDay} – ${endDay} ${endMonth} ${end.getFullYear()}`
  }
  if (sameYear) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${end.getFullYear()}`
  }
  return `${startDay} ${startMonth} ${start.getFullYear()} – ${endDay} ${endMonth} ${end.getFullYear()}`
}

export function isTodayInDaySlot(mondayIso: string, dayIndex: DayIndex, now: Date = new Date()): boolean {
  const slotDate = getDayDate(mondayIso, dayIndex)
  return formatLocalIsoDate(slotDate) === formatLocalIsoDate(now)
}
