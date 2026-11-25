import {
  ArrowUpDown,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import {
  evaluateRecipeAgainstPantry,
  formatIngredientFlexibilityHint,
  getPantryItemsRecipeUsage,
  isPantryItemAvailable,
  rankRecipesByPantry,
  type PantrySortMode,
  type RecipePantryMatchResult,
} from '../lib/pantryRecipeMatcher'
import { formatUnitLabel } from '../lib/units'
import { CATEGORY_META, GENERIC_GROUP_META, type Recipe } from '../types/food'
import { RecipeDetailModal } from './RecipeDetailModal'
import { RecipeModal } from './RecipeModal'

interface RecipesViewProps {
  onNavigateToPlanner: () => void
  onNavigateToPantry: () => void
  pantryMode: boolean
  onPantryModeChange: (enabled: boolean) => void
}

type CoverageFilter = 'with_matches' | 'almost_ready' | 'all'

export function RecipesView({
  onNavigateToPlanner,
  onNavigateToPantry,
  pantryMode,
  onPantryModeChange,
}: RecipesViewProps) {
  const {
    snapshot,
    deleteRecipe,
    duplicateRecipe,
    prepareRecipeBatchForWeek,
    weekRecipeSummaries,
  } = useFoodStore()

  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('Todas')
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Opciones del buscador por despensa
  const [pantrySortBy, setPantrySortBy] = useState<PantrySortMode>('matches_desc')
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('with_matches')
  const [includeOptionalMatches, setIncludeOptionalMatches] = useState(true)
  const [ignoreBasics, setIgnoreBasics] = useState(false)
  const [selectedPantryIds, setSelectedPantryIds] = useState<string[]>([])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3200)
  }

  const availablePantryItems = useMemo(
    () => snapshot.pantry.filter(isPantryItemAvailable),
    [snapshot.pantry],
  )

  const hasAlwaysAvailableInPantry = useMemo(
    () => availablePantryItems.some((item) => Boolean(item.alwaysAvailable)),
    [availablePantryItems],
  )

  const pantryUsageList = useMemo(
    () => getPantryItemsRecipeUsage(snapshot.pantry, snapshot.recipes),
    [snapshot.pantry, snapshot.recipes],
  )

  const usablePantryItems = useMemo(
    () => pantryUsageList.filter((u) => u.matchingRecipeIds.length > 0),
    [pantryUsageList],
  )

  const availablePantryIdSet = useMemo(
    () => new Set(availablePantryItems.map((i) => i.id)),
    [availablePantryItems],
  )

  const activeSelectedPantryIds = useMemo(
    () => selectedPantryIds.filter((id) => availablePantryIdSet.has(id)),
    [selectedPantryIds, availablePantryIdSet],
  )

  const toggleSelectedPantryId = (id: string) => {
    setSelectedPantryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const r of snapshot.recipes) {
      for (const t of r.tags) set.add(t)
    }
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))]
  }, [snapshot.recipes])

  // Filtrado base por texto y etiqueta
  const textAndTagFilteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshot.recipes.filter((r) => {
      if (selectedTag !== 'Todas' && !r.tags.includes(selectedTag)) {
        return false
      }
      if (!q) return true
      const inName = r.name.toLowerCase().includes(q)
      const inDesc = r.description.toLowerCase().includes(q)
      const inIngredients = r.ingredients.some(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          Boolean(i.substitutes?.some((s) => s.toLowerCase().includes(q))) ||
          Boolean(
            i.genericGroup &&
              GENERIC_GROUP_META[i.genericGroup].label.toLowerCase().includes(q),
          ),
      )
      return inName || inDesc || inIngredients
    })
  }, [snapshot.recipes, search, selectedTag])

  // Ranking por despensa sobre las recetas filtradas por búsqueda/etiqueta
  const rankedPantryResults = useMemo(() => {
    return rankRecipesByPantry(textAndTagFilteredRecipes, snapshot.pantry, {
      batches: 1,
      includeOptional: includeOptionalMatches,
      ignoreAlwaysAvailable: ignoreBasics,
      requiredPantryItemIds: activeSelectedPantryIds,
      sortBy: pantrySortBy,
    })
  }, [
    textAndTagFilteredRecipes,
    snapshot.pantry,
    includeOptionalMatches,
    ignoreBasics,
    activeSelectedPantryIds,
    pantrySortBy,
  ])

  // Mapa rápido de evaluación en modo estándar (para badge informativo)
  const quickMatchByRecipeId = useMemo(() => {
    const map = new Map<string, RecipePantryMatchResult>()
    if (availablePantryItems.length === 0) return map
    for (const r of snapshot.recipes) {
      map.set(r.id, evaluateRecipeAgainstPantry(r, snapshot.pantry))
    }
    return map
  }, [snapshot.recipes, snapshot.pantry, availablePantryItems.length])

  const totalMatchingAnyRecipeCount = useMemo(() => {
    let count = 0
    for (const res of quickMatchByRecipeId.values()) {
      if (res.scoreMatchCount > 0) count += 1
    }
    return count
  }, [quickMatchByRecipeId])

  const withMatchesCount = useMemo(
    () => rankedPantryResults.filter((r) => r.scoreMatchCount > 0).length,
    [rankedPantryResults],
  )

  const almostReadyCount = useMemo(
    () =>
      rankedPantryResults.filter(
        (r) => r.scoreMatchCount > 0 && r.missingEssentialCount <= 2,
      ).length,
    [rankedPantryResults],
  )

  const effectiveCoverageFilter: CoverageFilter =
    coverageFilter === 'with_matches' &&
    withMatchesCount === 0 &&
    activeSelectedPantryIds.length === 0
      ? 'all'
      : coverageFilter

  const displayedPantryResults = useMemo(() => {
    if (effectiveCoverageFilter === 'with_matches') {
      return rankedPantryResults.filter((r) => r.scoreMatchCount > 0)
    }
    if (effectiveCoverageFilter === 'almost_ready') {
      return rankedPantryResults.filter(
        (r) => r.scoreMatchCount > 0 && r.missingEssentialCount <= 2,
      )
    }
    return rankedPantryResults
  }, [rankedPantryResults, effectiveCoverageFilter])

  const displayedItems: { recipe: Recipe; pantryResult: RecipePantryMatchResult | undefined }[] =
    useMemo(() => {
      if (pantryMode) {
        return displayedPantryResults.map((res) => ({
          recipe: res.recipe,
          pantryResult: res,
        }))
      }
      return textAndTagFilteredRecipes.map((recipe) => ({
        recipe,
        pantryResult: quickMatchByRecipeId.get(recipe.id),
      }))
    }, [pantryMode, displayedPantryResults, textAndTagFilteredRecipes, quickMatchByRecipeId])

  const activeSummaryByRecipe = useMemo(() => {
    return new Map(weekRecipeSummaries.map((s) => [s.recipe.id, s]))
  }, [weekRecipeSummaries])

  const handleAddBatch = (recipe: Recipe, batches = 1) => {
    prepareRecipeBatchForWeek(recipe.id, batches)
    showToast(
      `Añadido ${batches === 1 ? '1 lote' : `${batches} lotes`} de "${recipe.name}" (${recipe.servingsYield * batches} raciones) a la semana actual.`,
    )
  }

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-900 px-4 py-3 text-sm text-white shadow-lg">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={onNavigateToPlanner}
            className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25"
          >
            Ir al planificador →
          </button>
        </div>
      )}

      {/* Cabecera */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs lg:flex-row lg:items-center">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Mis Recetas</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Explora tu recetario o prioriza qué cocinar según los ingredientes que ya tienes en casa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Selector de modo: Todas vs Según mi despensa */}
          <div
            role="tablist"
            aria-label="Modo de exploración de recetas"
            className="inline-flex rounded-xl border border-stone-200 bg-stone-100/90 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!pantryMode}
              onClick={() => onPantryModeChange(false)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                !pantryMode
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Todas</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pantryMode}
              onClick={() => onPantryModeChange(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pantryMode
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-emerald-900 hover:bg-emerald-50'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>Según mi despensa</span>
              {totalMatchingAnyRecipeCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    pantryMode
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {totalMatchingAnyRecipeCount}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Nueva receta
          </button>
        </div>
      </div>

      {/* Panel inteligente de búsqueda por despensa */}
      {pantryMode && (
        <section className="space-y-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-stone-50 p-5 shadow-2xs">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                  Búsqueda por despensa
                </span>
                <span className="text-xs font-medium text-stone-600">
                  {availablePantryItems.length}{' '}
                  {availablePantryItems.length === 1
                    ? 'producto disponible en casa'
                    : 'productos disponibles en casa'}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-stone-700">
                {availablePantryItems.length === 0
                  ? 'Aún no tienes productos con stock en tu despensa. Añade los ingredientes que tengas por casa para priorizar recetas.'
                  : pantrySortBy === 'matches_desc'
                    ? 'Ordenadas de mayor a menor cantidad de ingredientes que te coinciden en casa.'
                    : 'Ordenadas priorizando las recetas con menos ingredientes faltantes por comprar.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onNavigateToPantry}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 shadow-2xs transition hover:bg-emerald-50"
            >
              <Package className="h-3.5 w-3.5 text-emerald-700" />
              {availablePantryItems.length === 0
                ? 'Añadir productos a Despensa →'
                : 'Gestionar despensa →'}
            </button>
          </div>

          {availablePantryItems.length > 0 && (
            <>
              {/* Barra de criterio de prioridad y filtros de cobertura */}
              <div className="flex flex-col justify-between gap-3 border-t border-emerald-200/70 pt-3.5 lg:flex-row lg:items-center">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-stone-600">
                    <ArrowUpDown className="h-3.5 w-3.5 text-stone-400" />
                    Priorizar:
                  </span>
                  <button
                    type="button"
                    onClick={() => setPantrySortBy('matches_desc')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      pantrySortBy === 'matches_desc'
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    Más ingredientes en casa
                  </button>
                  <button
                    type="button"
                    onClick={() => setPantrySortBy('coverage_desc')}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      pantrySortBy === 'coverage_desc'
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    Listas para cocinar (% cubierto)
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCoverageFilter('with_matches')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      effectiveCoverageFilter === 'with_matches'
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    Con coincidencias ({withMatchesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverageFilter('almost_ready')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      effectiveCoverageFilter === 'almost_ready'
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    Faltan ≤ 2 ({almostReadyCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverageFilter('all')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      effectiveCoverageFilter === 'all'
                        ? 'bg-stone-900 text-white'
                        : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    Todas ({rankedPantryResults.length})
                  </button>
                </div>
              </div>

              {/* Opciones de cálculo + selector de ingredientes concretos de la despensa */}
              <div className="space-y-3 border-t border-emerald-200/70 pt-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-stone-700">
                    {usablePantryItems.length > 0
                      ? 'Filtra tocando ingredientes concretos de tu despensa que quieras aprovechar:'
                      : 'Ninguno de los productos actuales de tu despensa figura aún en tus recetas.'}
                  </span>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
                      <input
                        type="checkbox"
                        checked={includeOptionalMatches}
                        onChange={(e) => setIncludeOptionalMatches(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-stone-300 text-emerald-700"
                      />
                      <span>Contar opcionales</span>
                    </label>

                    {hasAlwaysAvailableInPantry && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
                        <input
                          type="checkbox"
                          checked={ignoreBasics}
                          onChange={(e) => setIgnoreBasics(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-stone-300 text-emerald-700"
                        />
                        <span>Ignorar básicos (sal, aceite…)</span>
                      </label>
                    )}
                  </div>
                </div>

                {usablePantryItems.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {usablePantryItems.map(({ item, matchingRecipeIds }) => {
                      const selected = activeSelectedPantryIds.includes(item.id)
                      const catMeta = CATEGORY_META[item.category]
                      const qtyText = item.alwaysAvailable
                        ? 'Básico'
                        : formatUnitLabel(item.quantity, item.unit)

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleSelectedPantryId(item.id)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
                            selected
                              ? 'border-emerald-800 bg-emerald-800 text-white shadow-2xs'
                              : 'border-stone-200 bg-white text-stone-700 hover:border-emerald-300 hover:bg-emerald-50/50'
                          }`}
                          title={`Usado en ${matchingRecipeIds.length} ${matchingRecipeIds.length === 1 ? 'receta' : 'recetas'} · En despensa: ${qtyText}`}
                        >
                          {selected ? (
                            <Check className="h-3 w-3 shrink-0" />
                          ) : (
                            <span>{catMeta.emoji}</span>
                          )}
                          <span className="font-semibold">{item.name}</span>
                          <span
                            className={`text-[11px] ${
                              selected ? 'text-emerald-100' : 'text-stone-400'
                            }`}
                          >
                            ({qtyText})
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                              selected
                                ? 'bg-white/20 text-white'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {matchingRecipeIds.length}
                          </span>
                        </button>
                      )
                    })}

                    {activeSelectedPantryIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPantryIds([])}
                        className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                      >
                        <X className="h-3 w-3" />
                        Limpiar filtro ({activeSelectedPantryIds.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* Buscador por texto y filtros por etiqueta */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o ingrediente (ej. pollo, arroz, huevo)..."
            className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pr-4 pl-10 text-sm text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                selectedTag === tag
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de recetas */}
      {displayedItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <p className="text-base font-semibold text-stone-700">
            {pantryMode
              ? 'No hay recetas que cumplan todos esos filtros de despensa'
              : 'No se han encontrado recetas con ese criterio'}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {pantryMode
              ? activeSelectedPantryIds.length > 0
                ? 'Prueba a desmarcar alguno de los ingredientes seleccionados para ampliar resultados.'
                : effectiveCoverageFilter !== 'all'
                  ? 'Cambia el filtro a "Todas" para ver también recetas con más ingredientes por comprar.'
                  : 'Crea nuevas recetas o añade más productos a tu despensa.'
              : 'Crea tu primera receta indicando las raciones que salen y sus ingredientes.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {pantryMode && activeSelectedPantryIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPantryIds([])}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                <X className="h-4 w-4" />
                Quitar filtro de ingredientes
              </button>
            )}
            {pantryMode && effectiveCoverageFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCoverageFilter('all')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                Ver todas las recetas
              </button>
            )}
            {!pantryMode && (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <Plus className="h-4 w-4" />
                Crear receta
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedItems.map(({ recipe, pantryResult }) => {
            const weekSummary = activeSummaryByRecipe.get(recipe.id)
            const isDeleting = confirmDeleteId === recipe.id
            const progressPct = pantryResult
              ? Math.min(100, Math.round(pantryResult.essentialCoverageRatio * 100))
              : 0

            const visibleMatchedInPantryMode = pantryResult
              ? pantryResult.matchedIngredients.filter(
                  (m) =>
                    (includeOptionalMatches || !m.ingredient.optional) &&
                    (!ignoreBasics || !m.coveredByAlwaysAvailable),
                )
              : []

            return (
              <div
                key={recipe.id}
                className={`group flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-2xs transition hover:shadow-md ${
                  pantryMode && pantryResult?.canCookFullBatchNow
                    ? 'border-emerald-300 ring-1 ring-emerald-500/15 hover:border-emerald-400'
                    : 'border-stone-200 hover:border-emerald-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setViewingRecipe(recipe)}
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-2xl transition group-hover:bg-emerald-50">
                        {recipe.emoji}
                      </span>
                      <div>
                        <h3 className="font-bold text-stone-900 group-hover:text-emerald-800">
                          {recipe.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                            <Users className="h-3 w-3" />
                            Sale para {recipe.servingsYield} rac.
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {recipe.prepTimeMinutes} min
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Resumen destacado en modo "Según mi despensa" */}
                  {pantryMode && pantryResult ? (
                    <div className="mt-3.5 space-y-2.5 rounded-xl border border-stone-200/90 bg-stone-50/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-xs font-extrabold text-emerald-950">
                          {pantryResult.scoreMatchCount}{' '}
                          {pantryResult.scoreMatchCount === 1
                            ? 'ingrediente en casa'
                            : 'ingredientes en casa'}
                        </span>

                        {pantryResult.canCookFullBatchNow ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
                            <CheckCircle2 className="h-3 w-3" />
                            ¡Lista para cocinar!
                          </span>
                        ) : pantryResult.hasAllEssentialsInHouse ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                            En casa (cant. parcial)
                          </span>
                        ) : (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              pantryResult.missingEssentialCount <= 2
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-stone-200/80 text-stone-700'
                            }`}
                          >
                            {pantryResult.missingEssentialCount === 1
                              ? 'Falta 1 indisp.'
                              : `Faltan ${pantryResult.missingEssentialCount} indisp.`}
                          </span>
                        )}
                      </div>

                      {/* Barra de cobertura de indispensables */}
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px] text-stone-500">
                          <span>
                            Indispensables: <strong>{pantryResult.matchedEssentialCount}</strong>/
                            {pantryResult.totalEssentialCount}
                            {includeOptionalMatches && pantryResult.matchedOptionalCount > 0
                              ? ` · +${pantryResult.matchedOptionalCount} opc.`
                              : ''}
                          </span>
                          <span className="font-semibold text-stone-700">{progressPct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pantryResult.canCookFullBatchNow
                                ? 'bg-emerald-600'
                                : progressPct >= 50
                                  ? 'bg-teal-600'
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Chips de ingredientes que coinciden en casa */}
                      {visibleMatchedInPantryMode.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold text-emerald-900">
                            Tienes en casa:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {visibleMatchedInPantryMode.map((m) => {
                              const isPartial = m.status === 'partial'
                              const subLabel =
                                m.usedSubstituteNames.length > 0
                                  ? m.usedSubstituteNames.join(' + ')
                                  : null
                              return (
                                <span
                                  key={m.ingredient.id}
                                  title={
                                    isPartial
                                      ? `${subLabel ? `Usando ${subLabel}: tienes ` : 'Tienes '}${m.availableFormatted} de ${m.requiredFormatted} necesarios para 1 lote`
                                      : subLabel
                                        ? `Cubierto usando ${subLabel} de tu despensa (${m.availableFormatted ?? 'disponible'})`
                                        : `En despensa: ${m.availableFormatted ?? 'disponible'}`
                                  }
                                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                                    isPartial
                                      ? 'border-amber-200 bg-amber-50 text-amber-950'
                                      : m.ingredient.optional
                                        ? 'border-violet-200 bg-violet-50 text-violet-900'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                  }`}
                                >
                                  <span>{isPartial ? '◐' : '✓'}</span>
                                  <span>{m.ingredient.name}</span>
                                  {subLabel && (
                                    <span className="font-semibold text-teal-800">
                                      ⇄ {subLabel}
                                    </span>
                                  )}
                                  {m.ingredient.optional && (
                                    <span className="text-[10px] opacity-75">(opc.)</span>
                                  )}
                                  {isPartial && m.availableFormatted && (
                                    <span className="text-[10px] font-semibold text-amber-800">
                                      ({m.availableFormatted}/{m.requiredFormatted})
                                    </span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Chips de ingredientes indispensables que faltan */}
                      {pantryResult.missingEssentialIngredients.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold text-stone-500">
                            Te faltan:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {pantryResult.missingEssentialIngredients.slice(0, 5).map((m) => {
                              const flexHint = formatIngredientFlexibilityHint(m.ingredient)
                              return (
                                <span
                                  key={m.ingredient.id}
                                  title={flexHint ?? undefined}
                                  className={`rounded-md border px-1.5 py-0.5 text-[11px] ${
                                    flexHint
                                      ? 'border-teal-200 bg-teal-50/40 text-teal-950'
                                      : 'border-stone-200 bg-white text-stone-600'
                                  }`}
                                >
                                  {m.ingredient.name}
                                  {flexHint ? ' ⇄' : ''}
                                </span>
                              )
                            })}
                            {pantryResult.missingEssentialIngredients.length > 5 && (
                              <span className="rounded-md bg-stone-200/70 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                                +{pantryResult.missingEssentialIngredients.length - 5} más
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {recipe.description && (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-stone-600">
                          {recipe.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1">
                        {recipe.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <p className="mt-3 text-xs text-stone-500">
                        <strong className="font-medium text-stone-700">
                          {recipe.ingredients.filter((i) => !i.optional).length} indispensables
                          {recipe.ingredients.some((i) => i.optional)
                            ? ` (+${recipe.ingredients.filter((i) => i.optional).length} opc.)`
                            : ''}
                          :
                        </strong>{' '}
                        {recipe.ingredients
                          .filter((i) => !i.optional)
                          .slice(0, 4)
                          .map((i) => i.name)
                          .join(', ')}
                        {recipe.ingredients.filter((i) => !i.optional).length > 4 ? '…' : ''}
                      </p>

                      {pantryResult && pantryResult.matchedEssentialCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onPantryModeChange(true)}
                          className={`mt-2.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                            pantryResult.canCookFullBatchNow
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-emerald-200 hover:bg-emerald-50/50'
                          }`}
                          title="Activar vista según despensa"
                        >
                          <Package className="h-3 w-3 text-emerald-700" />
                          {pantryResult.canCookFullBatchNow
                            ? '¡Tienes todos los indispensables en casa!'
                            : `${pantryResult.matchedEssentialCount}/${pantryResult.totalEssentialCount} indispensables en despensa`}
                        </button>
                      )}
                    </>
                  )}

                  {weekSummary && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs text-emerald-900">
                      En plan esta semana: <strong>{weekSummary.assignedServings}</strong> /{' '}
                      <strong>{weekSummary.producedServings}</strong> raciones
                    </div>
                  )}
                </div>

                {/* Pie tarjeta */}
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-100 pt-3.5">
                  {isDeleting ? (
                    <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-rose-50 px-2.5 py-1">
                      <span className="text-xs font-medium text-rose-800">¿Eliminar receta?</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md px-2 py-1 text-xs text-stone-600 hover:bg-white"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteRecipe(recipe.id)
                            setConfirmDeleteId(null)
                          }}
                          className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                        >
                          Sí, borrar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAddBatch(recipe, 1)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                        title="Preparar 1 lote en la semana activa"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />+ Lote a la semana
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingRecipe(recipe)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRecipe(recipe)}
                          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                          title="Editar receta"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const dup = duplicateRecipe(recipe.id)
                            if (dup) showToast(`Receta duplicada como "${dup.name}".`)
                          }}
                          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                          title="Duplicar receta"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(recipe.id)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Eliminar receta"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(isCreating || editingRecipe) && (
        <RecipeModal
          initialRecipe={editingRecipe}
          onClose={() => {
            setIsCreating(false)
            setEditingRecipe(null)
          }}
        />
      )}

      {viewingRecipe && (
        <RecipeDetailModal
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
          onEdit={(rec) => setEditingRecipe(rec)}
          onPrepareBatchInWeek={(rec, batches) => handleAddBatch(rec, batches)}
        />
      )}
    </div>
  )
}
