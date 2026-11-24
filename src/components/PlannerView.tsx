import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Copy,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import {
  formatWeekRangeLabel,
  getDayDate,
  getMondayIso,
  isTodayInDaySlot,
} from '../lib/dates'
import { formatBatchesLabel, type WeekRecipeBatchSummary } from '../lib/plannerEngine'
import { formatNumberEs, roundClean } from '../lib/units'
import {
  ALL_MEAL_SLOTS,
  DAY_NAMES,
  DAY_SHORT_NAMES,
  type DayIndex,
  type MealSlotId,
  type Recipe,
} from '../types/food'
import { RecipeDetailModal } from './RecipeDetailModal'
import { RecipeModal } from './RecipeModal'

const DAYS: readonly DayIndex[] = [0, 1, 2, 3, 4, 5, 6]

function nextBatchStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    if (current < 1) return 1
    return Math.round(current + 1)
  }
  if (current <= 0.5) return 0.5
  if (current <= 1) return 0.5
  return Math.max(1, Math.round(current - 1))
}

export function PlannerView() {
  const {
    snapshot,
    activeWeekStart,
    goToWeekOffset,
    goToCurrentWeek,
    currentWeekPlan,
    weekRecipeSummaries,
    addMealEntry,
    updateMealEntryServings,
    removeMealEntry,
    setBatchOverride,
    prepareRecipeBatchForWeek,
    removeRecipeFromWeek,
    copyFromPreviousWeek,
    clearCurrentWeek,
    toggleMealSlot,
    updateSettings,
  } = useFoodStore()

  const [slotPickerTarget, setSlotPickerTarget] = useState<{
    day: DayIndex
    slot: MealSlotId
  } | null>(null)
  const [slotPickerSearch, setSlotPickerSearch] = useState('')
  const [slotPickerServings, setSlotPickerServings] = useState<number>(
    snapshot.settings.defaultServingsPerMeal,
  )

  const [assignLeftoverSummary, setAssignLeftoverSummary] =
    useState<WeekRecipeBatchSummary | null>(null)
  const [leftoverDay, setLeftoverDay] = useState<DayIndex>(3)
  const [leftoverSlot, setLeftoverSlot] = useState<MealSlotId>('comida')
  const [leftoverServings, setLeftoverServings] = useState<number>(2)

  const [showBatchPicker, setShowBatchPicker] = useState(false)
  const [batchPickerSearch, setBatchPickerSearch] = useState('')

  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [creatingRecipeFromPicker, setCreatingRecipeFromPicker] = useState(false)
  const [confirmClearWeek, setConfirmClearWeek] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  const notify = (msg: string) => {
    setFeedbackMsg(msg)
    window.setTimeout(() => setFeedbackMsg(null), 3000)
  }

  const recipesById = useMemo(
    () => new Map(snapshot.recipes.map((r) => [r.id, r])),
    [snapshot.recipes],
  )

  const summaryByRecipeId = useMemo(
    () => new Map(weekRecipeSummaries.map((s) => [s.recipe.id, s])),
    [weekRecipeSummaries],
  )

  const enabledSlotMetas = useMemo(
    () => ALL_MEAL_SLOTS.filter((s) => snapshot.settings.enabledSlots.includes(s.id)),
    [snapshot.settings.enabledSlots],
  )

  const hiddenSlotCounts = useMemo(() => {
    const counts = new Map<MealSlotId, number>()
    for (const entry of currentWeekPlan.entries) {
      counts.set(entry.slot, (counts.get(entry.slot) ?? 0) + 1)
    }
    return counts
  }, [currentWeekPlan.entries])

  const isCurrentRealWeek = activeWeekStart === getMondayIso()

  const totalBatchesCount = useMemo(
    () =>
      roundClean(
        weekRecipeSummaries.reduce((acc, s) => acc + s.batchesToCook, 0),
      ),
    [weekRecipeSummaries],
  )

  const totalAssignedServings = useMemo(
    () =>
      roundClean(
        weekRecipeSummaries.reduce((acc, s) => acc + s.assignedServings, 0),
      ),
    [weekRecipeSummaries],
  )

  const totalFreeServings = useMemo(
    () =>
      roundClean(
        weekRecipeSummaries.reduce(
          (acc, s) => acc + Math.max(0, s.remainingServings),
          0,
        ),
      ),
    [weekRecipeSummaries],
  )

  const openSlotPicker = (day: DayIndex, slot: MealSlotId) => {
    setSlotPickerSearch('')
    setSlotPickerServings(snapshot.settings.defaultServingsPerMeal)
    setSlotPickerTarget({ day, slot })
  }

  const openLeftoverModal = (summary: WeekRecipeBatchSummary) => {
    const defaultSlot = snapshot.settings.enabledSlots.includes('comida')
      ? 'comida'
      : snapshot.settings.enabledSlots[0] ?? 'comida'
    setAssignLeftoverSummary(summary)
    setLeftoverDay(3)
    setLeftoverSlot(defaultSlot)
    setLeftoverServings(
      Math.min(
        Math.max(0.5, summary.remainingServings),
        snapshot.settings.defaultServingsPerMeal,
      ),
    )
  }

  const availableLeftoverSummaries = useMemo(
    () => weekRecipeSummaries.filter((s) => s.remainingServings > 0),
    [weekRecipeSummaries],
  )

  const filteredPickerRecipes = useMemo(() => {
    const q = slotPickerSearch.trim().toLowerCase()
    if (!q) return snapshot.recipes
    return snapshot.recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
    )
  }, [snapshot.recipes, slotPickerSearch])

  const filteredBatchPickerRecipes = useMemo(() => {
    const q = batchPickerSearch.trim().toLowerCase()
    if (!q) return snapshot.recipes
    return snapshot.recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [snapshot.recipes, batchPickerSearch])

  return (
    <div className="space-y-6">
      {feedbackMsg && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-900 px-4 py-2.5 text-sm font-medium text-white shadow-md">
          {feedbackMsg}
        </div>
      )}

      {/* Barra superior: navegación semanal y configuración rápida de franjas */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          {/* Selector de semana */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-stone-200 bg-stone-50 p-1">
              <button
                type="button"
                onClick={() => goToWeekOffset(-1)}
                className="rounded-lg p-1.5 text-stone-600 transition hover:bg-white hover:text-stone-900 hover:shadow-2xs"
                title="Semana anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 px-3 py-1 text-sm font-bold text-stone-900">
                <Calendar className="h-4 w-4 text-emerald-700" />
                <span>{formatWeekRangeLabel(activeWeekStart)}</span>
              </div>
              <button
                type="button"
                onClick={() => goToWeekOffset(1)}
                className="rounded-lg p-1.5 text-stone-600 transition hover:bg-white hover:text-stone-900 hover:shadow-2xs"
                title="Semana siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {!isCurrentRealWeek && (
              <button
                type="button"
                onClick={goToCurrentWeek}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Volver a esta semana
              </button>
            )}

            {/* KPIs rápidos */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                <strong>{formatNumberEs(totalBatchesCount)}</strong>{' '}
                {totalBatchesCount === 1 ? 'lote' : 'lotes'}
              </span>
              <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                <strong>{formatNumberEs(totalAssignedServings)}</strong> rac. en menú
              </span>
              {totalFreeServings > 0 && (
                <span className="rounded-lg bg-amber-100/80 px-2.5 py-1 font-semibold text-amber-900">
                  {formatNumberEs(totalFreeServings)} rac. libres por repartir
                </span>
              )}
            </div>
          </div>

          {/* Acciones de semana */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ok = copyFromPreviousWeek()
                if (ok) {
                  notify('Se ha copiado la planificación de la semana anterior.')
                } else {
                  notify('La semana anterior no tiene comidas planificadas para copiar.')
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar sem. anterior
            </button>

            {confirmClearWeek ? (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1">
                <span className="text-xs font-medium text-rose-800">¿Vaciar semana?</span>
                <button
                  type="button"
                  onClick={() => setConfirmClearWeek(false)}
                  className="rounded-md px-2 py-0.5 text-xs text-stone-600 hover:bg-white"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearCurrentWeek()
                    setConfirmClearWeek(false)
                    notify('Semana vaciada.')
                  }}
                  className="rounded-md bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Sí
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearWeek(true)}
                disabled={
                  currentWeekPlan.entries.length === 0 &&
                  Object.keys(currentWeekPlan.batchOverrides).length === 0
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Vaciar semana
              </button>
            )}
          </div>
        </div>

        {/* Selector configurable de comidas del día y comensales por defecto */}
        <div className="mt-4 flex flex-col justify-between gap-3 border-t border-stone-100 pt-3.5 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-stone-500">
              Comidas visibles:
            </span>
            {ALL_MEAL_SLOTS.map((slot) => {
              const active = snapshot.settings.enabledSlots.includes(slot.id)
              const hiddenCount = !active ? (hiddenSlotCounts.get(slot.id) ?? 0) : 0
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => toggleMealSlot(slot.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span>{slot.label}</span>
                  {hiddenCount > 0 && (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-stone-950">
                      {hiddenCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-stone-600">
            <Users className="h-3.5 w-3.5 text-stone-400" />
            <span>Raciones por comida:</span>
            <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => updateSettings({ defaultServingsPerMeal: num })}
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                    snapshot.settings.defaultServingsPerMeal === num
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Panel de Lotes y Raciones de la Semana */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Lotes cocinados y raciones de la semana
              </h3>
              <p className="text-xs text-stone-500">
                Controla cuántas raciones salen de cada receta, reparte las sobrantes o multiplica lotes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setBatchPickerSearch('')
              setShowBatchPicker(true)
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Preparar lote de receta
          </button>
        </div>

        {weekRecipeSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/70 px-4 py-6 text-center text-xs text-stone-500">
            Aún no hay recetas planificadas esta semana. Añade un plato en cualquier día del
            calendario o pulsa <strong>«Preparar lote de receta»</strong> para empezar por tu batch cooking.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {weekRecipeSummaries.map((summary) => {
              const {
                recipe,
                assignedServings,
                producedServings,
                remainingServings,
                batchesToCook,
                recommendedBatches,
                hasManualOverride,
              } = summary

              const progressPct =
                producedServings > 0
                  ? Math.min(100, Math.round((assignedServings / producedServings) * 100))
                  : 0

              const isDeficit = remainingServings < 0
              const hasFree = remainingServings > 0

              return (
                <div
                  key={recipe.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 transition ${
                    isDeficit
                      ? 'border-rose-300 bg-rose-50/40'
                      : hasFree
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-stone-200 bg-stone-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingRecipe(recipe)}
                        className="flex items-center gap-2 text-left hover:opacity-80"
                      >
                        <span className="text-xl">{recipe.emoji}</span>
                        <div>
                          <p className="text-sm font-bold text-stone-900 leading-snug">
                            {recipe.name}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            1 lote = {recipe.servingsYield} rac.
                          </p>
                        </div>
                      </button>

                      {/* Multiplicador de lotes */}
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="inline-flex items-center rounded-lg border border-stone-200 bg-white p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => {
                              if (batchesToCook <= 0.5 && assignedServings === 0) {
                                removeRecipeFromWeek(recipe.id)
                                return
                              }
                              setBatchOverride(recipe.id, nextBatchStep(batchesToCook, -1))
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100"
                            title="Reducir lotes"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2 text-xs font-bold whitespace-nowrap text-stone-800">
                            {formatBatchesLabel(batchesToCook)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setBatchOverride(recipe.id, nextBatchStep(batchesToCook, 1))
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100"
                            title="Multiplicar lotes"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {assignedServings === 0 && (
                          <button
                            type="button"
                            onClick={() => removeRecipeFromWeek(recipe.id)}
                            className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Quitar lote sin asignar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Barra de uso de raciones */}
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-stone-600">
                          En calendario:{' '}
                          <strong className="text-stone-900">
                            {formatNumberEs(assignedServings)}
                          </strong>{' '}
                          de <strong>{formatNumberEs(producedServings)}</strong> rac.
                        </span>
                        {hasManualOverride && assignedServings > 0 && (
                          <button
                            type="button"
                            onClick={() => setBatchOverride(recipe.id, null)}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-stone-500 underline hover:text-stone-800"
                            title="Volver al cálculo automático de lotes"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            Auto
                          </button>
                        )}
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isDeficit
                              ? 'bg-rose-500'
                              : hasFree
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Estado e interacción rápida */}
                  <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                    {isDeficit ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Faltan {formatNumberEs(Math.abs(remainingServings))} rac.
                        </span>
                        <button
                          type="button"
                          onClick={() => setBatchOverride(recipe.id, recommendedBatches)}
                          className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          Subir a {formatBatchesLabel(recommendedBatches)}
                        </button>
                      </>
                    ) : hasFree ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900">
                          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                          Sobran {formatNumberEs(remainingServings)} rac.
                        </span>
                        <button
                          type="button"
                          onClick={() => openLeftoverModal(summary)}
                          className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-500/30"
                        >
                          Repartir en día →
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Lote cuadrado ({formatNumberEs(producedServings)} rac.)
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Calendario Semanal Lunes - Domingo */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-7">
        {DAYS.map((dayIndex) => {
          const dayDate = getDayDate(activeWeekStart, dayIndex)
          const isToday = isTodayInDaySlot(activeWeekStart, dayIndex)

          return (
            <div
              key={dayIndex}
              className={`flex flex-col rounded-2xl border bg-white shadow-2xs ${
                isToday ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-stone-200'
              }`}
            >
              {/* Cabecera del día */}
              <div
                className={`flex items-center justify-between rounded-t-2xl border-b px-3.5 py-2.5 ${
                  isToday
                    ? 'border-emerald-200 bg-emerald-50/80'
                    : 'border-stone-100 bg-stone-50/70'
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-stone-900 lg:hidden">
                    {DAY_NAMES[dayIndex]}
                  </span>
                  <span className="hidden text-sm font-bold text-stone-900 lg:inline">
                    {DAY_SHORT_NAMES[dayIndex]}
                  </span>
                  <span className="text-xs font-medium text-stone-500">
                    {dayDate.getDate()}
                  </span>
                </div>
                {isToday && (
                  <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Hoy
                  </span>
                )}
              </div>

              {/* Franjas horarias habilitadas */}
              <div className="flex flex-1 flex-col divide-y divide-stone-100">
                {enabledSlotMetas.map((slotMeta) => {
                  const slotEntries = currentWeekPlan.entries.filter(
                    (e) => e.day === dayIndex && e.slot === slotMeta.id,
                  )

                  return (
                    <div key={slotMeta.id} className="flex flex-1 flex-col justify-between p-2.5">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                            {slotMeta.label}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {slotEntries.map((entry) => {
                            const rec = recipesById.get(entry.recipeId)
                            if (!rec) return null
                            const sum = summaryByRecipeId.get(rec.id)

                            return (
                              <div
                                key={entry.id}
                                className="group rounded-xl border border-stone-200 bg-stone-50/90 p-2 transition hover:border-emerald-300 hover:bg-white"
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setViewingRecipe(rec)}
                                    className="line-clamp-2 text-left text-xs font-semibold text-stone-800 hover:text-emerald-800"
                                  >
                                    <span className="mr-1">{rec.emoji}</span>
                                    {rec.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeMealEntry(entry.id)}
                                    className="shrink-0 rounded-md p-0.5 text-stone-400 opacity-70 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                                    title="Quitar de este día"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* Ajuste rápido de raciones en esta toma */}
                                <div className="mt-2 flex items-center justify-between">
                                  <div className="inline-flex items-center rounded-lg border border-stone-200 bg-white">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateMealEntryServings(
                                          entry.id,
                                          roundClean(entry.servings - 0.5),
                                        )
                                      }
                                      className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                                      title="Menos raciones"
                                    >
                                      -
                                    </button>
                                    <span className="px-1.5 text-[11px] font-bold text-emerald-900">
                                      {formatNumberEs(entry.servings)} rac.
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateMealEntryServings(
                                          entry.id,
                                          roundClean(entry.servings + 0.5),
                                        )
                                      }
                                      className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                                      title="Más raciones"
                                    >
                                      +
                                    </button>
                                  </div>

                                  {sum && sum.remainingServings > 0 && (
                                    <span
                                      className="text-[10px] font-medium text-amber-700"
                                      title="Raciones aún libres de este lote"
                                    >
                                      +{formatNumberEs(sum.remainingServings)} libre
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openSlotPicker(dayIndex, slotMeta.id)}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-stone-200 py-1.5 text-xs font-medium text-stone-400 transition hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-800"
                      >
                        <Plus className="h-3 w-3" />
                        Añadir
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {/* Modal: Añadir comida a un hueco (Día + Franja) */}
      {slotPickerTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-xs sm:p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Añadir plato · {DAY_NAMES[slotPickerTarget.day]} (
                  {ALL_MEAL_SLOTS.find((s) => s.id === slotPickerTarget.slot)?.label})
                </h3>
                <p className="text-xs text-stone-500">
                  Aprovecha raciones ya disponibles esta semana o elige cualquier receta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSlotPickerTarget(null)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Selector de raciones a consumir en esta comida */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5">
                <span className="text-xs font-semibold text-stone-700">
                  ¿Cuántas raciones se comerán en esta toma?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSlotPickerServings((s) => Math.max(0.5, roundClean(s - 0.5)))
                    }
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-14 text-center text-sm font-bold text-emerald-900">
                    {formatNumberEs(slotPickerServings)} rac.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSlotPickerServings((s) => roundClean(s + 0.5))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Sugerencia prioritaria: lotes con raciones libres esta semana */}
              {availableLeftoverSummaries.length > 0 && !slotPickerSearch.trim() && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    Con raciones libres de lotes de esta semana
                  </p>
                  <div className="space-y-2">
                    {availableLeftoverSummaries.map((sum) => {
                      const useQty = Math.min(slotPickerServings, sum.remainingServings)
                      return (
                        <button
                          key={sum.recipe.id}
                          type="button"
                          onClick={() => {
                            addMealEntry(
                              slotPickerTarget.day,
                              slotPickerTarget.slot,
                              sum.recipe.id,
                              useQty,
                            )
                            setSlotPickerTarget(null)
                          }}
                          className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-left transition hover:border-amber-400 hover:bg-amber-100/60"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">{sum.recipe.emoji}</span>
                            <div>
                              <p className="text-sm font-semibold text-stone-900">
                                {sum.recipe.name}
                              </p>
                              <p className="text-xs text-amber-900">
                                Tienes{' '}
                                <strong>{formatNumberEs(sum.remainingServings)} rac.</strong>{' '}
                                libres de este lote
                              </p>
                            </div>
                          </div>
                          <span className="rounded-lg bg-amber-900 px-2.5 py-1 text-xs font-semibold text-white">
                            Usar {formatNumberEs(useQty)} rac.
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Buscador de todas las recetas */}
              <div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={slotPickerSearch}
                    onChange={(e) => setSlotPickerSearch(e.target.value)}
                    placeholder="Buscar en el recetario..."
                    className="w-full rounded-xl border border-stone-300 py-2 pr-3 pl-9 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  {filteredPickerRecipes.map((rec) => {
                    const sum = summaryByRecipeId.get(rec.id)
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => {
                          addMealEntry(
                            slotPickerTarget.day,
                            slotPickerTarget.slot,
                            rec.id,
                            slotPickerServings,
                          )
                          setSlotPickerTarget(null)
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{rec.emoji}</span>
                          <div>
                            <p className="text-sm font-semibold text-stone-900">{rec.name}</p>
                            <p className="text-xs text-stone-500">
                              1 lote rinde <strong>{rec.servingsYield} rac.</strong> ·{' '}
                              {rec.prepTimeMinutes} min
                              {sum
                                ? ` · En semana: ${formatNumberEs(sum.assignedServings)}/${formatNumberEs(sum.producedServings)} rac.`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          + {formatNumberEs(slotPickerServings)} rac.
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 border-t border-stone-100 pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setCreatingRecipeFromPicker(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    ¿No encuentras el plato? Crear nueva receta ahora
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Repartir raciones sobrantes en un día */}
      {assignLeftoverSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Repartir raciones libres
                </h3>
                <p className="mt-0.5 text-xs text-stone-600">
                  {assignLeftoverSummary.recipe.emoji}{' '}
                  <strong>{assignLeftoverSummary.recipe.name}</strong> · Quedan{' '}
                  <strong>{formatNumberEs(assignLeftoverSummary.remainingServings)}</strong>{' '}
                  raciones disponibles
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignLeftoverSummary(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Día de la semana
                </label>
                <select
                  value={leftoverDay}
                  onChange={(e) => setLeftoverDay(Number(e.target.value) as DayIndex)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {DAY_NAMES[d]} ({getDayDate(activeWeekStart, d).getDate()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Franja de comida
                </label>
                <select
                  value={leftoverSlot}
                  onChange={(e) => setLeftoverSlot(e.target.value as MealSlotId)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                >
                  {ALL_MEAL_SLOTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {!snapshot.settings.enabledSlots.includes(s.id) ? ' (oculta)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Raciones a colocar
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={Math.max(0.5, assignLeftoverSummary.remainingServings)}
                  step={0.5}
                  value={leftoverServings}
                  onChange={(e) => setLeftoverServings(Number(e.target.value) || 1)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignLeftoverSummary(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!snapshot.settings.enabledSlots.includes(leftoverSlot)) {
                    toggleMealSlot(leftoverSlot)
                  }
                  addMealEntry(
                    leftoverDay,
                    leftoverSlot,
                    assignLeftoverSummary.recipe.id,
                    leftoverServings,
                  )
                  setAssignLeftoverSummary(null)
                }}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                Asignar al calendario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Preparar lote de receta para la semana */}
      {showBatchPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Preparar lote esta semana
                </h3>
                <p className="text-xs text-stone-500">
                  Añade una receta a tus lotes de la semana y reparte luego sus raciones.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchPicker(false)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={batchPickerSearch}
                  onChange={(e) => setBatchPickerSearch(e.target.value)}
                  placeholder="Buscar receta..."
                  className="w-full rounded-xl border border-stone-300 py-2 pr-3 pl-9 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                {filteredBatchPickerRecipes.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between rounded-xl border border-stone-200 p-3 hover:border-emerald-300"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{rec.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{rec.name}</p>
                        <p className="text-xs text-stone-500">
                          1 lote = <strong>{rec.servingsYield} raciones</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        prepareRecipeBatchForWeek(rec.id, 1)
                        setShowBatchPicker(false)
                        notify(
                          `Lote de "${rec.name}" (${rec.servingsYield} raciones) listo para repartir.`,
                        )
                      }}
                      className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      + 1 lote ({rec.servingsYield} rac.)
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {creatingRecipeFromPicker && (
        <RecipeModal
          onClose={() => setCreatingRecipeFromPicker(false)}
          onSaved={(newRecipe) => {
            if (slotPickerTarget) {
              addMealEntry(
                slotPickerTarget.day,
                slotPickerTarget.slot,
                newRecipe.id,
                slotPickerServings,
              )
              setSlotPickerTarget(null)
            }
          }}
        />
      )}

      {viewingRecipe && (
        <RecipeDetailModal
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
          onEdit={(rec) => setEditingRecipe(rec)}
          onPrepareBatchInWeek={(rec, batches) => {
            prepareRecipeBatchForWeek(rec.id, batches)
            notify(
              `Añadido ${formatBatchesLabel(batches)} de "${rec.name}" a esta semana.`,
            )
          }}
        />
      )}

      {editingRecipe && (
        <RecipeModal
          initialRecipe={editingRecipe}
          onClose={() => setEditingRecipe(null)}
        />
      )}
    </div>
  )
}
