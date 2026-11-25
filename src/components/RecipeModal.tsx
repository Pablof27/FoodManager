import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Bell,
  Lightbulb,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import { normalizeIngredientKey, UNIT_OPTIONS } from '../lib/units'
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  GENERIC_GROUP_META,
  GENERIC_INGREDIENT_GROUPS,
  type GenericIngredientGroup,
  type IngredientCategory,
  type Recipe,
  type RecipeIngredient,
  type RecipeNote,
  type RecipeNoteType,
  type RecipeStep,
  type Unit,
} from '../types/food'

const EMOJI_CHOICES = [
  '🍲',
  '🍗',
  '🐟',
  '🍝',
  '🍳',
  '🥗',
  '🥑',
  '🥘',
  '🌮',
  '🍛',
  '🥣',
  '🥪',
  '🍕',
  '🥩',
  '🥦',
  '🥞',
]

const SUGGESTED_TAGS = [
  'Desayuno',
  'Comida',
  'Cena',
  'Batch cooking',
  'Rápido',
  'Saludable',
  'Vegetariano',
  'Legumbres',
  'Pasta',
  'Pescado',
  'Horno',
]

interface DraftIngredient {
  id: string
  name: string
  quantity: string
  unit: Unit
  category: IngredientCategory
  optional: boolean
  substitutes: string[]
  genericGroup?: GenericIngredientGroup
  draftSubText: string
  flexOpen: boolean
}

interface DraftNote {
  id: string
  type: RecipeNoteType
  text: string
}

interface DraftStep {
  id: string
  text: string
  optional: boolean
  notes: DraftNote[]
}

function makeTempId(prefix = 'tmp'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

interface RecipeModalProps {
  initialRecipe?: Recipe | null
  onClose: () => void
  onSaved?: (recipe: Recipe) => void
}

export function RecipeModal({ initialRecipe, onClose, onSaved }: RecipeModalProps) {
  const { saveRecipe, knownIngredientSuggestions } = useFoodStore()

  const [name, setName] = useState(initialRecipe?.name ?? '')
  const [description, setDescription] = useState(initialRecipe?.description ?? '')
  const [servingsYield, setServingsYield] = useState(
    String(initialRecipe?.servingsYield ?? 4),
  )
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(
    String(initialRecipe?.prepTimeMinutes ?? 25),
  )
  const [emoji, setEmoji] = useState(initialRecipe?.emoji ?? '🍲')
  const [tags, setTags] = useState<string[]>(initialRecipe?.tags ?? ['Comida'])
  const [customTag, setCustomTag] = useState('')

  const [ingredients, setIngredients] = useState<DraftIngredient[]>(() => {
    if (initialRecipe && initialRecipe.ingredients.length > 0) {
      return initialRecipe.ingredients.map((ing) => {
        const subs = ing.substitutes ? [...ing.substitutes] : []
        return {
          id: ing.id,
          name: ing.name,
          quantity: ing.unit === 'al_gusto' ? '0' : String(ing.quantity),
          unit: ing.unit,
          category: ing.category,
          optional: Boolean(ing.optional),
          substitutes: subs,
          genericGroup: ing.genericGroup,
          draftSubText: '',
          flexOpen: Boolean(ing.genericGroup || subs.length > 0),
        }
      })
    }
    return [
      {
        id: makeTempId('ing'),
        name: '',
        quantity: '200',
        unit: 'g',
        category: 'verduras_frutas',
        optional: false,
        substitutes: [],
        genericGroup: undefined,
        draftSubText: '',
        flexOpen: false,
      },
    ]
  })

  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (initialRecipe && initialRecipe.steps.length > 0) {
      return initialRecipe.steps.map((st) => ({
        id: st.id,
        text: st.text,
        optional: Boolean(st.optional),
        notes: st.notes.map((n) => ({ ...n })),
      }))
    }
    return [
      {
        id: makeTempId('step'),
        text: '',
        optional: false,
        notes: [],
      },
    ]
  })

  const [recipeNotes, setRecipeNotes] = useState<DraftNote[]>(() => {
    if (initialRecipe && initialRecipe.recipeNotes.length > 0) {
      return initialRecipe.recipeNotes.map((n) => ({ ...n }))
    }
    return []
  })

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleIngredientNameChange = (id: string, nextName: string) => {
    const norm = normalizeIngredientKey(nextName)
    const match = knownIngredientSuggestions.find(
      (s) => normalizeIngredientKey(s.name) === norm,
    )
    setIngredients((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        if (match) {
          return {
            ...row,
            name: nextName,
            unit: match.unit,
            category: match.category,
          }
        }
        return { ...row, name: nextName }
      }),
    )
  }

  const updateIngredientField = <K extends keyof DraftIngredient>(
    id: string,
    field: K,
    value: DraftIngredient[K],
  ) => {
    setIngredients((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )
  }

  const addIngredientRow = (optional = false) => {
    setIngredients((prev) => [
      ...prev,
      {
        id: makeTempId('ing'),
        name: '',
        quantity: '1',
        unit: 'ud',
        category: 'verduras_frutas',
        optional,
        substitutes: [],
        genericGroup: undefined,
        draftSubText: '',
        flexOpen: false,
      },
    ])
  }

  const addGenericIngredientRow = () => {
    const defaultMeta = GENERIC_GROUP_META.verdura_guarnicion
    setIngredients((prev) => [
      ...prev,
      {
        id: makeTempId('ing'),
        name: defaultMeta.defaultName,
        quantity: '250',
        unit: defaultMeta.defaultUnit,
        category: defaultMeta.defaultCategory,
        optional: false,
        substitutes: [],
        genericGroup: 'verdura_guarnicion',
        draftSubText: '',
        flexOpen: true,
      },
    ])
  }

  const handleGenericGroupChange = (
    id: string,
    nextGroupValue: string,
  ) => {
    const nextGroup = nextGroupValue
      ? (nextGroupValue as GenericIngredientGroup)
      : undefined
    const defaultNamesSet = new Set(
      GENERIC_INGREDIENT_GROUPS.map((g) => g.defaultName.toLowerCase()),
    )

    setIngredients((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        if (!nextGroup) {
          return { ...row, genericGroup: undefined }
        }
        const meta = GENERIC_GROUP_META[nextGroup]
        const currentTrimmed = row.name.trim()
        const shouldReplaceName =
          !currentTrimmed || defaultNamesSet.has(currentTrimmed.toLowerCase())

        return {
          ...row,
          genericGroup: nextGroup,
          name: shouldReplaceName ? meta.defaultName : row.name,
          category: shouldReplaceName ? meta.defaultCategory : row.category,
          unit: shouldReplaceName ? meta.defaultUnit : row.unit,
        }
      }),
    )
  }

  const addSubstitutesToRow = (id: string, rawText: string) => {
    const parts = rawText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return

    setIngredients((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const existingNorms = new Set(
          [row.name, ...row.substitutes].map((x) => normalizeIngredientKey(x)),
        )
        const nextSubs = [...row.substitutes]
        for (const p of parts) {
          const norm = normalizeIngredientKey(p)
          if (norm && !existingNorms.has(norm)) {
            existingNorms.add(norm)
            nextSubs.push(p)
          }
        }
        return {
          ...row,
          substitutes: nextSubs,
          draftSubText: '',
        }
      }),
    )
  }

  const removeSubstituteFromRow = (id: string, subToRemove: string) => {
    setIngredients((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              substitutes: row.substitutes.filter((s) => s !== subToRemove),
            }
          : row,
      ),
    )
  }

  const removeIngredientRow = (id: string) => {
    setIngredients((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  // Gestión de pasos y notas por paso
  const addStepRow = (optional = false) => {
    setSteps((prev) => [
      ...prev,
      {
        id: makeTempId('step'),
        text: '',
        optional,
        notes: [],
      },
    ])
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    setSteps((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const addNoteToStep = (stepId: string, type: RecipeNoteType = 'tip') => {
    setSteps((prev) =>
      prev.map((st) =>
        st.id === stepId
          ? {
              ...st,
              notes: [...st.notes, { id: makeTempId('snote'), type, text: '' }],
            }
          : st,
      ),
    )
  }

  const updateStepNote = (
    stepId: string,
    noteId: string,
    patch: Partial<DraftNote>,
  ) => {
    setSteps((prev) =>
      prev.map((st) =>
        st.id === stepId
          ? {
              ...st,
              notes: st.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
            }
          : st,
      ),
    )
  }

  const removeStepNote = (stepId: string, noteId: string) => {
    setSteps((prev) =>
      prev.map((st) =>
        st.id === stepId
          ? { ...st, notes: st.notes.filter((n) => n.id !== noteId) }
          : st,
      ),
    )
  }

  // Notas generales de la receta
  const addGeneralNote = (type: RecipeNoteType) => {
    setRecipeNotes((prev) => [...prev, { id: makeTempId('rnote'), type, text: '' }])
  }

  const updateGeneralNote = (noteId: string, patch: Partial<DraftNote>) => {
    setRecipeNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
    )
  }

  const removeGeneralNote = (noteId: string) => {
    setRecipeNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const addCustomTag = () => {
    const trimmed = customTag.trim()
    if (!trimmed) return
    if (!tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
    }
    setCustomTag('')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setErrorMsg('Introduce un nombre para la receta.')
      return
    }

    const parsedYield = Number(servingsYield.replace(',', '.'))
    if (!Number.isFinite(parsedYield) || parsedYield < 1) {
      setErrorMsg('La cantidad de raciones que salen debe ser al menos 1.')
      return
    }

    const parsedPrep = Math.round(Number(prepTimeMinutes.replace(',', '.')))
    if (!Number.isFinite(parsedPrep) || parsedPrep < 1) {
      setErrorMsg('Introduce un tiempo válido en minutos (cualquier número mayor o igual a 1).')
      return
    }

    const validIngredients: RecipeIngredient[] = []
    for (const row of ingredients) {
      const ingName = row.name.trim()
      if (!ingName) continue
      const qtyNum = Number(String(row.quantity).replace(',', '.'))
      const finalQty =
        row.unit === 'al_gusto'
          ? 0
          : Number.isFinite(qtyNum) && qtyNum > 0
            ? qtyNum
            : 1

      // Incluir cualquier sustituto que haya quedado escrito en el input auxiliar sin pulsar Enter
      const pendingSubs = row.draftSubText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const mergedSubs: string[] = []
      const seenNorms = new Set<string>([normalizeIngredientKey(ingName)])
      for (const candidate of [...row.substitutes, ...pendingSubs]) {
        const trimmed = candidate.trim()
        const norm = normalizeIngredientKey(trimmed)
        if (trimmed && norm && !seenNorms.has(norm)) {
          seenNorms.add(norm)
          mergedSubs.push(trimmed)
        }
      }

      validIngredients.push({
        id: row.id,
        name: ingName,
        quantity: finalQty,
        unit: row.unit,
        category: row.category,
        optional: row.optional,
        ...(mergedSubs.length > 0 ? { substitutes: mergedSubs } : {}),
        ...(row.genericGroup ? { genericGroup: row.genericGroup } : {}),
      })
    }

    if (validIngredients.length === 0) {
      setErrorMsg('Añade al menos un ingrediente a la receta.')
      return
    }

    const cleanSteps: RecipeStep[] = steps
      .map((st) => ({
        id: st.id,
        text: st.text.trim(),
        optional: st.optional,
        notes: st.notes
          .map((n): RecipeNote => ({
            id: n.id,
            type: n.type,
            text: n.text.trim(),
          }))
          .filter((n) => n.text.length > 0),
      }))
      .filter((st) => st.text.length > 0)

    const cleanRecipeNotes: RecipeNote[] = recipeNotes
      .map((n): RecipeNote => ({
        id: n.id,
        type: n.type,
        text: n.text.trim(),
      }))
      .filter((n) => n.text.length > 0)

    const saved = saveRecipe({
      id: initialRecipe?.id,
      name: trimmedName,
      description: description.trim(),
      servingsYield: parsedYield,
      prepTimeMinutes: parsedPrep,
      emoji,
      tags,
      ingredients: validIngredients,
      steps: cleanSteps,
      recipeNotes: cleanRecipeNotes,
    })

    onSaved?.(saved)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-xs sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipe-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-6 py-4">
          <div>
            <h2 id="recipe-modal-title" className="text-lg font-semibold text-stone-900">
              {initialRecipe ? 'Editar receta' : 'Nueva receta'}
            </h2>
            <p className="text-xs text-stone-500">
              Separa lo indispensable de las mejoras opcionales y añade tips o recordatorios por paso.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto p-6">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {errorMsg}
            </div>
          )}

          <datalist id="known-ingredients-datalist">
            {knownIngredientSuggestions.map((item) => (
              <option key={item.name} value={item.name} />
            ))}
          </datalist>

          {/* Icono y Nombre */}
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-700">Icono</label>
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2 sm:w-44">
                {EMOJI_CHOICES.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition ${
                      emoji === em
                        ? 'bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-700/30'
                        : 'hover:bg-stone-200/70'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Nombre de la receta *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Lentejas estofadas con verduras"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Descripción breve
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Plato casero ideal para tupper o cena rápida..."
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Raciones por lote y tiempo libre en minutos */}
          <div className="grid gap-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-emerald-950">
                Cantidad que sale por receta (raciones por lote) *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={servingsYield}
                  onChange={(e) => setServingsYield(e.target.value)}
                  className="w-28 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-sm font-semibold text-stone-900 focus:border-emerald-700 focus:outline-none"
                />
                <span className="text-sm font-medium text-emerald-900">raciones</span>
              </div>
              <p className="mt-1 text-xs text-emerald-800/80">
                Al cocinarla 1 vez tendrás estas raciones para repartir en la semana.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Tiempo de elaboración (minutos) *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={prepTimeMinutes}
                  onChange={(e) => setPrepTimeMinutes(e.target.value)}
                  placeholder="Ej. 12, 25, 40"
                  className="w-28 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none"
                />
                <span className="text-sm text-stone-600">minutos</span>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Introduce cualquier número exacto de minutos (ej. 8, 12, 25, 42…).
              </p>
            </div>
          </div>

          {/* Etiquetas */}
          <div>
            <label className="mb-2 block text-xs font-medium text-stone-700">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set([...SUGGESTED_TAGS, ...tags])).map((tag) => {
                const active = tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomTag()
                    }
                  }}
                  placeholder="+ Etiqueta"
                  className="w-28 rounded-full border border-stone-300 px-3 py-1 text-xs focus:border-emerald-600 focus:outline-none"
                />
                {customTag.trim() && (
                  <button
                    type="button"
                    onClick={addCustomTag}
                    className="rounded-full bg-stone-800 px-2.5 py-1 text-xs text-white"
                  >
                    Añadir
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Ingredientes indispensables, genéricos y opcionales */}
          <div>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Ingredientes para 1 lote ({servingsYield || 1} raciones) *
                </h3>
                <p className="text-xs text-stone-500">
                  Puedes definir <strong>sustitutos</strong> (ej. brócoli, setas…) o marcar un ingrediente como{' '}
                  <strong>comodín</strong> para recetas de aprovechamiento.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => addIngredientRow(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Indispensable
                </button>
                <button
                  type="button"
                  onClick={addGenericIngredientRow}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />+ Comodín / aprovechamiento
                </button>
                <button
                  type="button"
                  onClick={() => addIngredientRow(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />+ Ingrediente opcional
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {ingredients.map((row) => {
                const hasFlexConfig =
                  Boolean(row.genericGroup) || row.substitutes.length > 0
                const groupMeta = row.genericGroup
                  ? GENERIC_GROUP_META[row.genericGroup]
                  : undefined
                const existingNormSet = new Set(
                  [row.name, ...row.substitutes].map((s) => normalizeIngredientKey(s)),
                )
                const availableSuggestions = groupMeta
                  ? groupMeta.suggestedSubstitutes.filter(
                      (s) => !existingNormSet.has(normalizeIngredientKey(s)),
                    )
                  : []

                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border p-2.5 transition ${
                      row.optional
                        ? 'border-dashed border-violet-300 bg-violet-50/40'
                        : hasFlexConfig
                          ? 'border-teal-200 bg-teal-50/25'
                          : 'border-stone-200 bg-stone-50/60'
                    }`}
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_80px_132px_158px_auto_auto_auto]">
                      <input
                        type="text"
                        list="known-ingredients-datalist"
                        value={row.name}
                        onChange={(e) => handleIngredientNameChange(row.id, e.target.value)}
                        placeholder={
                          row.genericGroup
                            ? 'Nombre visible (ej. Verdura de aprovechamiento, Picante...)'
                            : row.optional
                              ? 'Ingrediente opcional (ej. Chorizo, Sésamo...)'
                              : 'Ingrediente principal (ej. Espárragos verdes)'
                        }
                        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none"
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        disabled={row.unit === 'al_gusto'}
                        value={row.unit === 'al_gusto' ? '' : row.quantity}
                        onChange={(e) =>
                          updateIngredientField(row.id, 'quantity', e.target.value)
                        }
                        placeholder={row.unit === 'al_gusto' ? '—' : 'Cant.'}
                        className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 disabled:bg-stone-100 disabled:text-stone-400 focus:border-emerald-600 focus:outline-none"
                      />
                      <select
                        value={row.unit}
                        onChange={(e) =>
                          updateIngredientField(row.id, 'unit', e.target.value as Unit)
                        }
                        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none"
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={row.category}
                        onChange={(e) =>
                          updateIngredientField(
                            row.id,
                            'category',
                            e.target.value as IngredientCategory,
                          )
                        }
                        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none"
                      >
                        {CATEGORY_ORDER.map((cat) => (
                          <option key={cat} value={cat}>
                            {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateIngredientField(row.id, 'flexOpen', !row.flexOpen)
                        }
                        className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                          hasFlexConfig || row.flexOpen
                            ? 'border-teal-300 bg-teal-100 text-teal-950 hover:bg-teal-200/70'
                            : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-100'
                        }`}
                        title="Configurar sustitutos válidos o familia de ingrediente genérico"
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        {row.genericGroup
                          ? 'Comodín'
                          : row.substitutes.length > 0
                            ? `Sust. (${row.substitutes.length})`
                            : 'Sustitutos'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateIngredientField(row.id, 'optional', !row.optional)
                        }
                        className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                          row.optional
                            ? 'border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200/70'
                            : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-100'
                        }`}
                        title="Alternar entre ingrediente indispensable y opcional"
                      >
                        {row.optional ? (
                          <>
                            <Sparkles className="h-3 w-3" />
                            Opcional
                          </>
                        ) : (
                          'Básico'
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => removeIngredientRow(row.id)}
                        disabled={ingredients.length <= 1}
                        className="flex items-center justify-center rounded-lg p-1.5 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        title="Quitar ingrediente"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Resumen compacto cuando tiene sustitutos/comodín pero el panel está cerrado */}
                    {!row.flexOpen && hasFlexConfig && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200/70 bg-white/80 px-2.5 py-1 text-[11px] text-teal-950">
                        <span>
                          {groupMeta && (
                            <strong className="mr-1.5">
                              {groupMeta.emoji} {groupMeta.shortLabel}
                            </strong>
                          )}
                          {row.substitutes.length > 0 && (
                            <span>Sustitutos: {row.substitutes.join(', ')}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateIngredientField(row.id, 'flexOpen', true)}
                          className="font-semibold text-teal-800 underline"
                        >
                          Editar opciones
                        </button>
                      </div>
                    )}

                    {/* Panel desplegable para ingrediente genérico y sustitutos */}
                    {row.flexOpen && (
                      <div className="mt-2.5 space-y-2.5 rounded-xl border border-teal-200 bg-white p-3">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                              Familia comodín / aprovechamiento (opcional)
                            </label>
                            <select
                              value={row.genericGroup ?? ''}
                              onChange={(e) =>
                                handleGenericGroupChange(row.id, e.target.value)
                              }
                              className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 focus:border-teal-600 focus:outline-none"
                            >
                              <option value="">
                                Ninguna (solo ingrediente concreto o sus sustitutos)
                              </option>
                              {GENERIC_INGREDIENT_GROUPS.map((grp) => (
                                <option key={grp.id} value={grp.id}>
                                  {grp.emoji} {grp.label}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-[11px] text-stone-500">
                              Si eliges una familia comodín, cualquier producto compatible de tu despensa cubrirá este ingrediente.
                            </p>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-stone-700">
                              Sustitutos concretos (ej. brócoli, setas, cayena…)
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                list="known-ingredients-datalist"
                                value={row.draftSubText}
                                onChange={(e) =>
                                  updateIngredientField(
                                    row.id,
                                    'draftSubText',
                                    e.target.value,
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault()
                                    addSubstitutesToRow(row.id, row.draftSubText)
                                  }
                                }}
                                placeholder="Escribe uno o varios separados por coma..."
                                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900 focus:border-teal-600 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  addSubstitutesToRow(row.id, row.draftSubText)
                                }
                                disabled={!row.draftSubText.trim()}
                                className="rounded-lg bg-teal-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-35"
                              >
                                Añadir
                              </button>
                            </div>
                          </div>
                        </div>

                        {row.substitutes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-teal-900">
                              Válidos:
                            </span>
                            {row.substitutes.map((sub) => (
                              <span
                                key={sub}
                                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-950"
                              >
                                {sub}
                                <button
                                  type="button"
                                  onClick={() => removeSubstituteFromRow(row.id, sub)}
                                  className="rounded-full p-0.5 text-teal-700 hover:bg-teal-200/70 hover:text-teal-950"
                                  aria-label={`Quitar sustituto ${sub}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        {availableSuggestions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 border-t border-stone-100 pt-2">
                            <span className="mr-1 text-[11px] text-stone-500">
                              Sugerencias rápidas:
                            </span>
                            {availableSuggestions.map((sug) => (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => addSubstitutesToRow(row.id, sug)}
                                className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
                              >
                                + {sug}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pasos de preparación (claves + opcionales + notas por paso) */}
          <div>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Pasos de preparación</h3>
                <p className="text-xs text-stone-500">
                  Añade pasos clave u opcionales, e incluye tips o recordatorios en el paso exacto donde hacen falta.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => addStepRow(false)}
                  className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Paso clave
                </button>
                <button
                  type="button"
                  onClick={() => addStepRow(true)}
                  className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />+ Paso opcional
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => {
                const displayStepNum = steps
                  .slice(0, index + 1)
                  .filter((s) => !s.optional).length

                return (
                  <div
                    key={step.id}
                    className={`rounded-2xl border p-3.5 transition ${
                      step.optional
                        ? 'border-dashed border-violet-300 bg-violet-50/35'
                        : 'border-stone-200 bg-stone-50/50'
                    }`}
                  >
                    {/* Barra superior del paso */}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {step.optional ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-900">
                            <Sparkles className="h-3 w-3" />
                            Paso opcional (mejora)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-800">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">
                              {displayStepNum}
                            </span>
                            Paso clave
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSteps((prev) =>
                              prev.map((s) =>
                                s.id === step.id ? { ...s, optional: !s.optional } : s,
                              ),
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                            step.optional
                              ? 'border-violet-300 bg-white text-violet-800 hover:bg-violet-100'
                              : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {step.optional ? 'Marcar como clave' : 'Marcar opcional'}
                        </button>

                        <button
                          type="button"
                          onClick={() => addNoteToStep(step.id, 'tip')}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5 text-emerald-700" />
                          + Nota al paso
                        </button>

                        <button
                          type="button"
                          onClick={() => moveStep(index, -1)}
                          disabled={index === 0}
                          className="rounded-lg p-1 text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-30"
                          title="Subir paso"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(index, 1)}
                          disabled={index === steps.length - 1}
                          className="rounded-lg p-1 text-stone-400 hover:bg-white hover:text-stone-700 disabled:opacity-30"
                          title="Bajar paso"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>

                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSteps((prev) => prev.filter((s) => s.id !== step.id))
                            }
                            className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Eliminar paso"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={step.text}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s) =>
                            s.id === step.id ? { ...s, text: e.target.value } : s,
                          ),
                        )
                      }
                      placeholder={
                        step.optional
                          ? 'Describe este paso opcional para mejorar el plato...'
                          : `Describe el paso ${displayStepNum}...`
                      }
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none"
                    />

                    {/* Notas específicas del paso */}
                    {step.notes.length > 0 && (
                      <div className="mt-2.5 space-y-2 border-l-2 border-stone-300 pl-3">
                        {step.notes.map((note) => (
                          <div
                            key={note.id}
                            className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-2 sm:flex-row sm:items-center"
                          >
                            <div className="inline-flex shrink-0 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateStepNote(step.id, note.id, { type: 'tip' })
                                }
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
                                  note.type === 'tip'
                                    ? 'bg-emerald-700 text-white'
                                    : 'text-stone-600 hover:text-stone-900'
                                }`}
                              >
                                <Lightbulb className="h-3 w-3" />
                                Tip
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateStepNote(step.id, note.id, {
                                    type: 'recordatorio',
                                  })
                                }
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
                                  note.type === 'recordatorio'
                                    ? 'bg-amber-600 text-white'
                                    : 'text-stone-600 hover:text-stone-900'
                                }`}
                              >
                                <Bell className="h-3 w-3" />
                                Recordatorio
                              </button>
                            </div>

                            <input
                              type="text"
                              value={note.text}
                              onChange={(e) =>
                                updateStepNote(step.id, note.id, {
                                  text: e.target.value,
                                })
                              }
                              placeholder={
                                note.type === 'tip'
                                  ? 'Ej. Chascar la patata ayuda a espesar el caldo...'
                                  : 'Ej. No echar la sal hasta el final o se endurece...'
                              }
                              className="flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                            />

                            <button
                              type="button"
                              onClick={() => removeStepNote(step.id, note.id)}
                              className="self-end rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 sm:self-center"
                              title="Quitar nota"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notas generales de la receta (Tip / Recordatorio) */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Notas generales de la receta
                </h3>
                <p className="text-xs text-stone-500">
                  Al ver la receta quedan plegadas por defecto para una lectura limpia y rápida.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addGeneralNote('tip')}
                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <Lightbulb className="h-3.5 w-3.5" />+ Tip
                </button>
                <button
                  type="button"
                  onClick={() => addGeneralNote('recordatorio')}
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <Bell className="h-3.5 w-3.5" />+ Recordatorio
                </button>
              </div>
            </div>

            {recipeNotes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-3 text-xs text-stone-500">
                Sin notas generales. Añade un <strong>Tip</strong> (conservación, acompañamientos) o un{' '}
                <strong>Recordatorio</strong> (sacar con antelación de la nevera, congelación…).
              </p>
            ) : (
              <div className="space-y-2">
                {recipeNotes.map((note) => (
                  <div
                    key={note.id}
                    className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50/70 p-2.5 sm:flex-row sm:items-center"
                  >
                    <div className="inline-flex shrink-0 rounded-lg border border-stone-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => updateGeneralNote(note.id, { type: 'tip' })}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                          note.type === 'tip'
                            ? 'bg-emerald-700 text-white'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        <Lightbulb className="h-3 w-3" />
                        Tip
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateGeneralNote(note.id, { type: 'recordatorio' })
                        }
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                          note.type === 'recordatorio'
                            ? 'bg-amber-600 text-white'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        <Bell className="h-3 w-3" />
                        Recordatorio
                      </button>
                    </div>

                    <input
                      type="text"
                      value={note.text}
                      onChange={(e) =>
                        updateGeneralNote(note.id, { text: e.target.value })
                      }
                      placeholder={
                        note.type === 'tip'
                          ? 'Ej. Reposado al día siguiente gana mucho sabor...'
                          : 'Ej. Sacar de la nevera 15 min antes de cocinar...'
                      }
                      className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => removeGeneralNote(note.id)}
                      className="self-end rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 sm:self-center"
                      title="Eliminar nota general"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acciones pie */}
          <div className="flex items-center justify-end gap-3 border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800"
            >
              {initialRecipe ? 'Guardar cambios' : 'Crear receta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
