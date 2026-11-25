import {
  Bell,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  Lightbulb,
  Minus,
  Package,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import {
  evaluateRecipeAgainstPantry,
  formatIngredientFlexibilityHint,
  isPantryItemAvailable,
  resolveEffectiveGenericGroup,
} from '../lib/pantryRecipeMatcher'
import { formatBatchesLabel } from '../lib/plannerEngine'
import { formatUnitLabel, roundClean } from '../lib/units'
import {
  CATEGORY_META,
  GENERIC_GROUP_META,
  type Recipe,
  type RecipeNote,
} from '../types/food'

interface RecipeDetailModalProps {
  recipe: Recipe
  onClose: () => void
  onEdit: (recipe: Recipe) => void
  onPrepareBatchInWeek: (recipe: Recipe, batches: number) => void
}

function formatNoteSummaryCounts(notes: RecipeNote[]): string {
  const tips = notes.filter((n) => n.type === 'tip').length
  const reminders = notes.filter((n) => n.type === 'recordatorio').length
  const parts: string[] = []
  if (tips > 0) parts.push(`${tips} ${tips === 1 ? 'tip' : 'tips'}`)
  if (reminders > 0) {
    parts.push(`${reminders} ${reminders === 1 ? 'recordatorio' : 'recordatorios'}`)
  }
  return parts.join(' · ')
}

function NoteCallout({ note }: { note: RecipeNote }) {
  if (note.type === 'recordatorio') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/85 px-3 py-2 text-xs leading-relaxed text-amber-950">
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
          <Bell className="h-3 w-3" />
          Recordatorio
        </span>
        <span>{note.text}</span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/75 px-3 py-2 text-xs leading-relaxed text-emerald-950">
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950">
        <Lightbulb className="h-3 w-3" />
        Tip
      </span>
      <span>{note.text}</span>
    </div>
  )
}

export function RecipeDetailModal({
  recipe,
  onClose,
  onEdit,
  onPrepareBatchInWeek,
}: RecipeDetailModalProps) {
  const { snapshot } = useFoodStore()
  const [batchesPreview, setBatchesPreview] = useState(1)
  const [onlyEssentialMode, setOnlyEssentialMode] = useState(false)

  // Todas las notas (por paso y generales) empiezan plegadas por defecto
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([])
  const [generalNotesOpen, setGeneralNotesOpen] = useState(false)

  const totalServings = roundClean(recipe.servingsYield * batchesPreview)

  const hasAvailablePantry = useMemo(
    () => snapshot.pantry.some(isPantryItemAvailable),
    [snapshot.pantry],
  )

  const pantryEvaluation = useMemo(
    () =>
      evaluateRecipeAgainstPantry(recipe, snapshot.pantry, {
        batches: batchesPreview,
      }),
    [recipe, snapshot.pantry, batchesPreview],
  )

  const matchByIngredientId = useMemo(
    () => new Map(pantryEvaluation.ingredientMatches.map((m) => [m.ingredient.id, m])),
    [pantryEvaluation.ingredientMatches],
  )

  const essentialIngredients = useMemo(
    () => recipe.ingredients.filter((i) => !i.optional),
    [recipe.ingredients],
  )
  const optionalIngredients = useMemo(
    () => recipe.ingredients.filter((i) => Boolean(i.optional)),
    [recipe.ingredients],
  )

  const hasAnyOptionals =
    optionalIngredients.length > 0 || recipe.steps.some((s) => Boolean(s.optional))

  const visibleSteps = useMemo(
    () =>
      onlyEssentialMode
        ? recipe.steps.filter((s) => !s.optional)
        : recipe.steps,
    [recipe.steps, onlyEssentialMode],
  )

  const stepsWithNotesIds = useMemo(
    () => visibleSteps.filter((s) => s.notes.length > 0).map((s) => s.id),
    [visibleSteps],
  )

  const totalNotesCount = useMemo(() => {
    const stepNotes = visibleSteps.reduce((acc, s) => acc + s.notes.length, 0)
    return stepNotes + recipe.recipeNotes.length
  }, [visibleSteps, recipe.recipeNotes])

  const allNotesExpanded =
    totalNotesCount > 0 &&
    stepsWithNotesIds.every((id) => expandedStepIds.includes(id)) &&
    (recipe.recipeNotes.length === 0 || generalNotesOpen)

  const toggleAllNotes = () => {
    if (allNotesExpanded) {
      setExpandedStepIds([])
      setGeneralNotesOpen(false)
    } else {
      setExpandedStepIds(stepsWithNotesIds)
      if (recipe.recipeNotes.length > 0) setGeneralNotesOpen(true)
    }
  }

  const toggleStepNotes = (stepId: string) => {
    setExpandedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-xs sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-start justify-between border-b border-stone-200 bg-stone-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100/80 text-2xl">
              {recipe.emoji}
            </span>
            <div>
              <h2 className="text-lg font-bold text-stone-900">{recipe.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-600">
                <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                  <Users className="h-3.5 w-3.5" />1 lote = {recipe.servingsYield} raciones
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {recipe.prepTimeMinutes} min
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-200/70 hover:text-stone-900"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {recipe.description && (
            <p className="text-sm leading-relaxed text-stone-600">{recipe.description}</p>
          )}

          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Calculadora de lotes + selector de versión básica vs completa */}
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                  Calculadora de lotes al cocinar
                </p>
                <p className="text-sm text-emerald-950">
                  Viendo cantidades para{' '}
                  <strong>{formatBatchesLabel(batchesPreview)}</strong> ({totalServings}{' '}
                  {totalServings === 1 ? 'ración' : 'raciones'})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setBatchesPreview((b) => Math.max(0.5, roundClean(b - 0.5)))
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-16 text-center text-sm font-bold text-emerald-950">
                  {formatBatchesLabel(batchesPreview)}
                </span>
                <button
                  type="button"
                  onClick={() => setBatchesPreview((b) => roundClean(b + 0.5))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {hasAnyOptionals && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/80 pt-3">
                <span className="text-xs font-medium text-emerald-950">
                  Modo de lectura de la receta:
                </span>
                <div className="inline-flex rounded-xl border border-emerald-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setOnlyEssentialMode(false)}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                      !onlyEssentialMode
                        ? 'bg-emerald-700 text-white'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    Completa (con opcionales)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyEssentialMode(true)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                      onlyEssentialMode
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Solo indispensable
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Ingredientes separados claramente entre indispensables y opcionales */}
          <div className="space-y-4">
            <div>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-stone-900">
                  Ingredientes indispensables ({essentialIngredients.length})
                </h3>
                {hasAvailablePantry && essentialIngredients.length > 0 && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      pantryEvaluation.canCookFullBatchNow
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {pantryEvaluation.canCookFullBatchNow ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                    ) : (
                      <Package className="h-3.5 w-3.5 text-emerald-700" />
                    )}
                    {pantryEvaluation.matchedEssentialCount}/{essentialIngredients.length} en
                    despensa
                  </span>
                )}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {essentialIngredients.map((ing) => {
                  const scaledQty = roundClean(ing.quantity * batchesPreview)
                  const catMeta = CATEGORY_META[ing.category]
                  const pMatch = matchByIngredientId.get(ing.id)
                  const effGroup = resolveEffectiveGenericGroup(ing)
                  const groupMeta = effGroup ? GENERIC_GROUP_META[effGroup] : undefined
                  const flexHint = formatIngredientFlexibilityHint(ing)
                  const subUsedLabel =
                    pMatch && pMatch.usedSubstituteNames.length > 0
                      ? pMatch.usedSubstituteNames.join(' + ')
                      : null
                  return (
                    <li
                      key={ing.id}
                      className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                        hasAvailablePantry && pMatch?.status === 'covered'
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : hasAvailablePantry && pMatch?.status === 'partial'
                            ? 'border-amber-200 bg-amber-50/50'
                            : 'border-stone-200 bg-stone-50/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 text-stone-800">
                          <span>{catMeta.emoji}</span>
                          <span className="font-medium">{ing.name}</span>
                          {groupMeta && (
                            <span className="rounded-full bg-teal-100 px-2 py-0.2 text-[10px] font-bold text-teal-900">
                              {groupMeta.shortLabel}
                            </span>
                          )}
                        </span>
                        {flexHint && (
                          <p className="mt-0.5 text-[11px] text-teal-800">
                            ⇄ {ing.substitutes && ing.substitutes.length > 0
                              ? `Vale también: ${ing.substitutes.join(', ')}`
                              : flexHint}
                          </p>
                        )}
                        {hasAvailablePantry && pMatch && pMatch.status !== 'missing' && (
                          <p
                            className={`mt-0.5 text-[11px] font-medium ${
                              pMatch.status === 'partial'
                                ? 'text-amber-800'
                                : 'text-emerald-800'
                            }`}
                          >
                            {pMatch.status === 'covered'
                              ? subUsedLabel
                                ? `✓ En casa usando ${subUsedLabel} (${pMatch.availableFormatted})`
                                : `✓ En casa (${pMatch.availableFormatted})`
                              : subUsedLabel
                                ? `◐ Usando ${subUsedLabel}: tienes ${pMatch.availableFormatted} · faltan ${pMatch.missingFormatted}`
                                : `◐ Tienes ${pMatch.availableFormatted} · faltan ${pMatch.missingFormatted}`}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold text-stone-900">
                        {formatUnitLabel(scaledQty, ing.unit)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            {!onlyEssentialMode && optionalIngredients.length > 0 && (
              <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-3.5">
                <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-900">
                  <Sparkles className="h-3.5 w-3.5 text-violet-700" />
                  Opcionales para mejorarla ({optionalIngredients.length})
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {optionalIngredients.map((ing) => {
                    const scaledQty = roundClean(ing.quantity * batchesPreview)
                    const catMeta = CATEGORY_META[ing.category]
                    const pMatch = matchByIngredientId.get(ing.id)
                    const effGroup = resolveEffectiveGenericGroup(ing)
                    const groupMeta = effGroup ? GENERIC_GROUP_META[effGroup] : undefined
                    const flexHint = formatIngredientFlexibilityHint(ing)
                    const subUsedLabel =
                      pMatch && pMatch.usedSubstituteNames.length > 0
                        ? pMatch.usedSubstituteNames.join(' + ')
                        : null
                    return (
                      <li
                        key={ing.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-violet-200/80 bg-white px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 text-stone-800">
                            <span>{catMeta.emoji}</span>
                            <span>{ing.name}</span>
                            {groupMeta && (
                              <span className="rounded-full bg-teal-100 px-2 py-0.2 text-[10px] font-bold text-teal-900">
                                {groupMeta.shortLabel}
                              </span>
                            )}
                          </span>
                          {flexHint && (
                            <p className="mt-0.5 text-[11px] text-teal-800">
                              ⇄ {ing.substitutes && ing.substitutes.length > 0
                                ? `Vale también: ${ing.substitutes.join(', ')}`
                                : flexHint}
                            </p>
                          )}
                          {hasAvailablePantry && pMatch && pMatch.status !== 'missing' && (
                            <p
                              className={`mt-0.5 text-[11px] font-medium ${
                                pMatch.status === 'partial'
                                  ? 'text-amber-800'
                                  : 'text-emerald-800'
                              }`}
                            >
                              {pMatch.status === 'covered'
                                ? subUsedLabel
                                  ? `✓ En casa usando ${subUsedLabel} (${pMatch.availableFormatted})`
                                  : `✓ En casa (${pMatch.availableFormatted})`
                                : subUsedLabel
                                  ? `◐ Usando ${subUsedLabel}: tienes ${pMatch.availableFormatted} · faltan ${pMatch.missingFormatted}`
                                  : `◐ Tienes ${pMatch.availableFormatted} · faltan ${pMatch.missingFormatted}`}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-semibold text-violet-900">
                          {formatUnitLabel(scaledQty, ing.unit)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Pasos de preparación + notas plegables por defecto */}
          {visibleSteps.length > 0 && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-stone-900">Pasos clave</h3>
                {totalNotesCount > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllNotes}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    {allNotesExpanded
                      ? 'Ocultar todas las notas'
                      : `Desplegar todas las notas (${totalNotesCount})`}
                  </button>
                )}
              </div>

              <ol className="space-y-3">
                {visibleSteps.map((step, idx) => {
                  const stepNum = visibleSteps
                    .slice(0, idx + 1)
                    .filter((s) => !s.optional).length
                  const isNotesExpanded = expandedStepIds.includes(step.id)

                  return (
                    <li
                      key={step.id}
                      className={`rounded-2xl border p-3.5 transition ${
                        step.optional
                          ? 'border-dashed border-violet-300 bg-violet-50/35'
                          : 'border-stone-200/90 bg-white'
                      }`}
                    >
                      <div className="flex gap-3 text-sm leading-relaxed text-stone-800">
                        {step.optional ? (
                          <span
                            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-200 text-violet-900"
                            title="Paso opcional"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                            {stepNum}
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          {step.optional && (
                            <span className="mb-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900">
                              Paso opcional · Para mejorarla
                            </span>
                          )}
                          <p>{step.text}</p>

                          {/* Desplegable de notas específicas del paso */}
                          {step.notes.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => toggleStepNotes(step.id)}
                                aria-expanded={isNotesExpanded}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                              >
                                {isNotesExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-stone-500" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-stone-500" />
                                )}
                                {step.notes.some((n) => n.type === 'tip') && (
                                  <Lightbulb className="h-3 w-3 text-emerald-700" />
                                )}
                                {step.notes.some((n) => n.type === 'recordatorio') && (
                                  <Bell className="h-3 w-3 text-amber-600" />
                                )}
                                <span>{formatNoteSummaryCounts(step.notes)}</span>
                              </button>

                              {isNotesExpanded && (
                                <div className="mt-2 space-y-1.5">
                                  {step.notes.map((note) => (
                                    <NoteCallout key={note.id} note={note} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {/* Desplegable de notas generales de la receta (oculto por defecto) */}
          {recipe.recipeNotes.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50/70">
              <button
                type="button"
                onClick={() => setGeneralNotesOpen((v) => !v)}
                aria-expanded={generalNotesOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-stone-800">
                  {generalNotesOpen ? (
                    <ChevronDown className="h-4 w-4 text-stone-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-stone-500" />
                  )}
                  <span>
                    Notas generales de la receta ({formatNoteSummaryCounts(recipe.recipeNotes)})
                  </span>
                </span>
                <span className="text-[11px] font-medium text-stone-500">
                  {generalNotesOpen ? 'Ocultar' : 'Desplegar'}
                </span>
              </button>

              {generalNotesOpen && (
                <div className="space-y-2 border-t border-stone-200/80 px-4 py-3">
                  {recipe.recipeNotes.map((note) => (
                    <NoteCallout key={note.id} note={note} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-6 py-3.5">
          <button
            type="button"
            onClick={() => {
              onClose()
              onEdit(recipe)
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Editar receta
          </button>

          <button
            type="button"
            onClick={() => {
              onPrepareBatchInWeek(recipe, batchesPreview)
              onClose()
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
          >
            <CalendarPlus className="h-4 w-4" />
            Preparar {formatBatchesLabel(batchesPreview)} esta semana ({totalServings} rac.)
          </button>
        </div>
      </div>
    </div>
  )
}
