import {
  CalendarPlus,
  Clock,
  Copy,
  Edit3,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import type { Recipe } from '../types/food'
import { RecipeDetailModal } from './RecipeDetailModal'
import { RecipeModal } from './RecipeModal'

interface RecipesViewProps {
  onNavigateToPlanner: () => void
}

export function RecipesView({ onNavigateToPlanner }: RecipesViewProps) {
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

  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3200)
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const r of snapshot.recipes) {
      for (const t of r.tags) set.add(t)
    }
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))]
  }, [snapshot.recipes])

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshot.recipes.filter((r) => {
      if (selectedTag !== 'Todas' && !r.tags.includes(selectedTag)) {
        return false
      }
      if (!q) return true
      const inName = r.name.toLowerCase().includes(q)
      const inDesc = r.description.toLowerCase().includes(q)
      const inIngredients = r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      return inName || inDesc || inIngredients
    })
  }, [snapshot.recipes, search, selectedTag])

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
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Mis Recetas</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Cada receta define cuántas raciones salen por lote para organizar la semana y la compra.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" />
          Nueva receta
        </button>
      </div>

      {/* Buscador y filtros */}
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
      {filteredRecipes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <p className="text-base font-semibold text-stone-700">
            No se han encontrado recetas con ese criterio
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Crea tu primera receta indicando las raciones que salen y sus ingredientes.
          </p>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Crear receta
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecipes.map((recipe) => {
            const weekSummary = activeSummaryByRecipe.get(recipe.id)
            const isDeleting = confirmDeleteId === recipe.id

            return (
              <div
                key={recipe.id}
                className="group flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs transition hover:border-emerald-300 hover:shadow-md"
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
