import {
  ArchiveRestore,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Copy,
  PackageCheck,
  Plus,
  ShoppingBasket,
  Trash2,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import { formatWeekRangeLabel } from '../lib/dates'
import { formatBatchesLabel, type ComputedShoppingItem } from '../lib/plannerEngine'
import { formatUnitLabel, normalizeIngredientKey, UNIT_OPTIONS } from '../lib/units'
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type ExtraShoppingItem,
  type IngredientCategory,
  type Unit,
} from '../types/food'

export function ShoppingView() {
  const {
    snapshot,
    activeWeekStart,
    goToWeekOffset,
    currentWeekPlan,
    weekRecipeSummaries,
    weekShopping,
    toggleShoppingItemChecked,
    addExtraShoppingItem,
    toggleExtraShoppingItem,
    removeExtraShoppingItem,
    clearCheckedExtraItems,
    transferCheckedItemsToPantry,
    updateSettings,
    knownIngredientSuggestions,
  } = useFoodStore()

  const [extraName, setExtraName] = useState('')
  const [extraQty, setExtraQty] = useState('1')
  const [extraUnit, setExtraUnit] = useState<Unit>('ud')
  const [extraCategory, setExtraCategory] = useState<IngredientCategory>('otros')
  const [showCoveredSection, setShowCoveredSection] = useState(false)
  const [copiedBanner, setCopiedBanner] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(null), 3500)
  }

  const handleExtraNameChange = (val: string) => {
    setExtraName(val)
    const norm = normalizeIngredientKey(val)
    const match = knownIngredientSuggestions.find(
      (s) => normalizeIngredientKey(s.name) === norm,
    )
    if (match) {
      setExtraUnit(match.unit)
      setExtraCategory(match.category)
    }
  }

  const handleAddExtra = (e: FormEvent) => {
    e.preventDefault()
    if (!extraName.trim()) return
    addExtraShoppingItem({
      name: extraName,
      quantity: Number(extraQty.replace(',', '.')) || 1,
      unit: extraUnit,
      category: extraCategory,
    })
    setExtraName('')
    setExtraQty('1')
  }

  // Agrupación conjunta de ítems calculados + extras manuales por categoría
  const groupedSections = useMemo(() => {
    const map = new Map<
      IngredientCategory,
      { computed: ComputedShoppingItem[]; extras: ExtraShoppingItem[] }
    >()

    for (const cat of CATEGORY_ORDER) {
      map.set(cat, { computed: [], extras: [] })
    }

    for (const item of weekShopping.toBuyItems) {
      map.get(item.category)?.computed.push(item)
    }
    for (const ext of currentWeekPlan.extraShoppingItems) {
      map.get(ext.category)?.extras.push(ext)
    }

    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      meta: CATEGORY_META[cat],
      ...(map.get(cat) ?? { computed: [], extras: [] }),
    })).filter((sec) => sec.computed.length > 0 || sec.extras.length > 0)
  }, [weekShopping.toBuyItems, currentWeekPlan.extraShoppingItems])

  const totalItemsCount =
    weekShopping.toBuyItems.length + currentWeekPlan.extraShoppingItems.length
  const checkedItemsCount =
    weekShopping.toBuyItems.filter((i) => i.checked).length +
    currentWeekPlan.extraShoppingItems.filter((e) => e.checked).length

  const pendingTransferCount = useMemo(() => {
    const addedSet = new Set(currentWeekPlan.addedToPantryKeys)
    const autoPending = weekShopping.toBuyItems.filter(
      (i) => i.checked && !i.addedToPantry,
    ).length
    const extraPending = currentWeekPlan.extraShoppingItems.filter(
      (e) => e.checked && !addedSet.has(`extra::${e.id}`),
    ).length
    return autoPending + extraPending
  }, [weekShopping.toBuyItems, currentWeekPlan])

  const handleCopyShoppingText = async () => {
    const lines: string[] = [
      `🛒 Lista de la compra (${formatWeekRangeLabel(activeWeekStart)})`,
      '',
    ]
    for (const sec of groupedSections) {
      lines.push(`${sec.meta.emoji} ${sec.meta.label.toUpperCase()}`)
      for (const item of sec.computed) {
        const optSuffix = item.isPurelyOptional ? ' (opcional)' : ''
        const flexSuffix = item.substituteHint ? ` [${item.substituteHint}]` : ''
        lines.push(
          `- [${item.checked ? 'x' : ' '}] ${item.displayName}${optSuffix}: ${item.netFormatted}${flexSuffix}`,
        )
      }
      for (const ext of sec.extras) {
        lines.push(
          `- [${ext.checked ? 'x' : ' '}] ${ext.name}: ${formatUnitLabel(ext.quantity, ext.unit)}`,
        )
      }
      lines.push('')
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n').trim())
      setCopiedBanner(true)
      window.setTimeout(() => setCopiedBanner(false), 2500)
    } catch {
      showToast('No se pudo copiar automáticamente al portapapeles.')
    }
  }

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Cabecera de la compra */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-stone-900">Lista de la Compra</h2>
              <div className="inline-flex items-center rounded-xl border border-stone-200 bg-stone-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => goToWeekOffset(-1)}
                  className="rounded-lg p-1 text-stone-600 hover:bg-white"
                  title="Semana anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="inline-flex items-center gap-1.5 px-2.5 font-semibold text-stone-800">
                  <Calendar className="h-3.5 w-3.5 text-emerald-700" />
                  {formatWeekRangeLabel(activeWeekStart)}
                </span>
                <button
                  type="button"
                  onClick={() => goToWeekOffset(1)}
                  className="rounded-lg p-1 text-stone-600 hover:bg-white"
                  title="Semana siguiente"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-stone-500">
              Calculada a partir de{' '}
              <strong>
                {weekRecipeSummaries.length}{' '}
                {weekRecipeSummaries.length === 1 ? 'receta planificada' : 'recetas planificadas'}
              </strong>{' '}
              en la semana.
            </p>
          </div>

          {/* Controles: Descontar despensa, Incluir opcionales, Copiar, Pasar comprados a despensa */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-800 select-none">
              <input
                type="checkbox"
                checked={snapshot.settings.deductPantryInShopping}
                onChange={(e) =>
                  updateSettings({ deductPantryInShopping: e.target.checked })
                }
                className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
              />
              Descontar mi despensa
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-800 select-none">
              <input
                type="checkbox"
                checked={snapshot.settings.includeOptionalInShopping}
                onChange={(e) =>
                  updateSettings({ includeOptionalInShopping: e.target.checked })
                }
                className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
              />
              Incluir opcionales
            </label>

            <button
              type="button"
              onClick={handleCopyShoppingText}
              disabled={totalItemsCount === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-40"
            >
              {copiedBanner ? (
                <>
                  <ClipboardCheck className="h-4 w-4 text-emerald-700" />
                  ¡Lista copiada!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar texto
                </>
              )}
            </button>

            {pendingTransferCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  const count = transferCheckedItemsToPantry()
                  if (count > 0) {
                    showToast(
                      `Se han sumado ${count} ${count === 1 ? 'producto comprado' : 'productos comprados'} a tu despensa.`,
                    )
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-800"
              >
                <ArchiveRestore className="h-4 w-4" />
                Guardar comprados en despensa ({pendingTransferCount})
              </button>
            )}
          </div>
        </div>

        {/* Barra de progreso */}
        {totalItemsCount > 0 && (
          <div className="mt-4 border-t border-stone-100 pt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-stone-600">
                Progreso de compra:{' '}
                <strong className="text-stone-900">{checkedItemsCount}</strong> de{' '}
                <strong>{totalItemsCount}</strong> productos marcados
              </span>
              {currentWeekPlan.extraShoppingItems.some((e) => e.checked) && (
                <button
                  type="button"
                  onClick={clearCheckedExtraItems}
                  className="text-xs font-medium text-stone-500 underline hover:text-stone-800"
                >
                  Limpiar extras comprados
                </button>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.round((checkedItemsCount / totalItemsCount) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Formulario rápido para añadir ítems sueltos / extras */}
      <form
        onSubmit={handleAddExtra}
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs"
      >
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Añadir producto extra a la lista de esta semana
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_150px_190px_auto]">
          <input
            type="text"
            list="shopping-extra-datalist"
            value={extraName}
            onChange={(e) => handleExtraNameChange(e.target.value)}
            placeholder="Ej. Café en grano, fruta, leche, papel de cocina..."
            className="rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          />
          <datalist id="shopping-extra-datalist">
            {knownIngredientSuggestions.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>

          <input
            type="number"
            min={0}
            step="any"
            disabled={extraUnit === 'al_gusto'}
            value={extraUnit === 'al_gusto' ? '' : extraQty}
            onChange={(e) => setExtraQty(e.target.value)}
            placeholder="Cant."
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-100 focus:border-emerald-600 focus:outline-none"
          />

          <select
            value={extraUnit}
            onChange={(e) => setExtraUnit(e.target.value as Unit)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>

          <select
            value={extraCategory}
            onChange={(e) => setExtraCategory(e.target.value as IngredientCategory)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          >
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            <Plus className="h-4 w-4" />
            Añadir
          </button>
        </div>
      </form>

      {/* Listado agrupado por pasillos/categorías */}
      {groupedSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <ShoppingBasket className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-base font-semibold text-stone-700">
            No tienes nada pendiente por comprar esta semana
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {weekShopping.coveredByPantryItems.length > 0
              ? '¡Todo lo necesario para tus recetas ya está cubierto por tu despensa!'
              : 'Planifica recetas en el calendario semanal o añade productos manuales arriba.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groupedSections.map((section) => (
            <div
              key={section.category}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs"
            >
              <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2.5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                  <span className="text-base">{section.meta.emoji}</span>
                  <span>{section.meta.label}</span>
                </h3>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
                  {section.computed.length + section.extras.length}
                </span>
              </div>

              <ul className="space-y-2">
                {section.computed.map((item) => (
                  <li
                    key={item.key}
                    className={`rounded-xl border px-3.5 py-2.5 transition ${
                      item.checked
                        ? 'border-stone-200 bg-stone-50/70 opacity-65'
                        : 'border-stone-200 bg-white hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleShoppingItemChecked(item.key)}
                        className="flex flex-1 items-start gap-3 text-left"
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            item.checked
                              ? 'border-emerald-700 bg-emerald-700 text-white'
                              : 'border-stone-300 bg-white'
                          }`}
                        >
                          {item.checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`text-sm font-semibold ${
                                  item.checked
                                    ? 'text-stone-500 line-through'
                                    : 'text-stone-900'
                                }`}
                              >
                                {item.displayName}
                              </span>
                              {item.isPurelyOptional && (
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                                  ✨ Opcional
                                </span>
                              )}
                            </span>
                            <span
                              className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                                item.isPurelyOptional
                                  ? 'bg-violet-50 text-violet-900'
                                  : 'bg-emerald-50 text-emerald-900'
                              }`}
                            >
                              {item.netFormatted}
                            </span>
                          </div>

                          {/* Desglose de descuento de despensa */}
                          {item.pantryDeductedFormatted && (
                            <p className="mt-1 text-[11px] font-medium text-emerald-800">
                              Total recetas: {item.grossFormatted} · Ya tienes{' '}
                              {item.pantryDeductedFormatted} en despensa
                            </p>
                          )}

                          {item.optionalPortionFormatted && (
                            <p className="mt-1 text-[11px] font-medium text-violet-700">
                              Incluye {item.optionalPortionFormatted} de uso opcional
                            </p>
                          )}

                          {item.otherUnitPantryNote && (
                            <p className="mt-1 text-[11px] text-amber-800">
                              Nota: {item.otherUnitPantryNote}
                            </p>
                          )}

                          {item.substituteHint && (
                            <p className="mt-1 text-[11px] font-medium text-teal-800">
                              ⇄ {item.substituteHint}
                            </p>
                          )}

                          {/* Fuentes por receta y lote */}
                          <p className="mt-1 text-[11px] text-stone-500">
                            {item.sources
                              .map(
                                (s) =>
                                  `${s.recipeName} (${formatBatchesLabel(s.batches)}: ${s.formattedAmount}${s.optional ? ' · opcional' : ''})`,
                              )
                              .join(' · ')}
                          </p>

                          {item.addedToPantry && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <PackageCheck className="h-3 w-3" />
                              Añadido a tu despensa
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  </li>
                ))}

                {/* Productos extra manuales en esta categoría */}
                {section.extras.map((ext) => {
                  const transferred = currentWeekPlan.addedToPantryKeys.includes(
                    `extra::${ext.id}`,
                  )
                  return (
                    <li
                      key={ext.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition ${
                        ext.checked
                          ? 'border-stone-200 bg-stone-50/70 opacity-65'
                          : 'border-dashed border-stone-300 bg-stone-50/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExtraShoppingItem(ext.id)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            ext.checked
                              ? 'border-emerald-700 bg-emerald-700 text-white'
                              : 'border-stone-300 bg-white'
                          }`}
                        >
                          {ext.checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                          <div>
                            <span
                              className={`text-sm font-semibold ${
                                ext.checked
                                  ? 'text-stone-500 line-through'
                                  : 'text-stone-900'
                              }`}
                            >
                              {ext.name}
                            </span>
                            <span className="ml-2 rounded-full bg-stone-200/80 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                              Manual
                            </span>
                            {transferred && (
                              <span className="ml-2 text-[11px] font-semibold text-emerald-700">
                                · En despensa
                              </span>
                            )}
                          </div>
                          <span className="rounded-lg bg-stone-200/70 px-2 py-0.5 text-xs font-bold text-stone-800">
                            {formatUnitLabel(ext.quantity, ext.unit)}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeExtraShoppingItem(ext.id)}
                        className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Eliminar extra"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Sección desplegable: Ingredientes cubiertos al 100% por la despensa */}
      {snapshot.settings.deductPantryInShopping &&
        weekShopping.coveredByPantryItems.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <button
              type="button"
              onClick={() => setShowCoveredSection((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <PackageCheck className="h-5 w-5 text-emerald-700" />
                <div>
                  <p className="text-sm font-bold text-emerald-950">
                    Cubierto por tu despensa ({weekShopping.coveredByPantryItems.length}{' '}
                    {weekShopping.coveredByPantryItems.length === 1
                      ? 'ingrediente'
                      : 'ingredientes'}
                    )
                  </p>
                  <p className="text-xs text-emerald-800/80">
                    Ya tienes suficiente cantidad en casa para estas recetas, por eso no se añaden a comprar.
                  </p>
                </div>
              </div>
              {showCoveredSection ? (
                <ChevronUp className="h-4 w-4 text-emerald-800" />
              ) : (
                <ChevronDown className="h-4 w-4 text-emerald-800" />
              )}
            </button>

            {showCoveredSection && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {weekShopping.coveredByPantryItems.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-white px-3.5 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-stone-800">{item.displayName}</p>
                      <p className="text-[11px] text-stone-500">
                        Necesitas: {item.grossFormatted}
                      </p>
                    </div>
                    <span className="rounded-lg bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">
                      {item.coveredByAlwaysAvailable
                        ? item.pantryDeductedFormatted &&
                          item.pantryDeductedFormatted !== 'Básico en despensa'
                          ? item.pantryDeductedFormatted
                          : 'Básico en casa'
                        : `Tienes ${item.pantryDeductedFormatted}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </div>
  )
}
