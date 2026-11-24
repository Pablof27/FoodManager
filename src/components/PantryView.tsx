import {
  AlertCircle,
  Check,
  Edit3,
  Infinity as InfinityIcon,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useFoodStore } from '../context/useFoodStore'
import { formatUnitLabel, normalizeIngredientKey, UNIT_OPTIONS } from '../lib/units'
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type IngredientCategory,
  type PantryItem,
  type Unit,
} from '../types/food'

export function PantryView() {
  const {
    snapshot,
    savePantryItem,
    adjustPantryQuantity,
    deletePantryItem,
    knownIngredientSuggestions,
  } = useFoodStore()

  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState<Unit>('ud')
  const [category, setCategory] = useState<IngredientCategory>('legumbres_cereales')
  const [alwaysAvailable, setAlwaysAvailable] = useState(false)
  const [minQuantity, setMinQuantity] = useState('')

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<IngredientCategory | 'todas'>('todas')
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null)

  const handleNameChange = (val: string) => {
    setName(val)
    const norm = normalizeIngredientKey(val)
    const match = knownIngredientSuggestions.find(
      (s) => normalizeIngredientKey(s.name) === norm,
    )
    if (match) {
      setUnit(match.unit)
      setCategory(match.category)
    }
  }

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const parsedQty = Number(quantity.replace(',', '.')) || 0
    const parsedMin = minQuantity.trim()
      ? Number(minQuantity.replace(',', '.'))
      : undefined

    savePantryItem({
      name,
      quantity: alwaysAvailable || unit === 'al_gusto' ? 0 : parsedQty,
      unit: alwaysAvailable ? 'al_gusto' : unit,
      category,
      alwaysAvailable,
      minQuantity:
        parsedMin !== undefined && Number.isFinite(parsedMin) && parsedMin > 0
          ? parsedMin
          : undefined,
    })

    setName('')
    setQuantity('1')
    setMinQuantity('')
    setAlwaysAvailable(false)
  }

  const isLowStock = (item: PantryItem): boolean => {
    if (item.alwaysAvailable || item.unit === 'al_gusto') return false
    if (item.quantity <= 0) return true
    if (item.minQuantity !== undefined && item.quantity < item.minQuantity) return true
    return false
  }

  const lowStockCount = useMemo(
    () => snapshot.pantry.filter(isLowStock).length,
    [snapshot.pantry],
  )

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshot.pantry.filter((item) => {
      if (filterCategory !== 'todas' && item.category !== filterCategory) return false
      if (onlyLowStock && !isLowStock(item)) return false
      if (q && !item.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [snapshot.pantry, search, filterCategory, onlyLowStock])

  const groupedByCategory = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      meta: CATEGORY_META[cat],
      items: filteredItems.filter((i) => i.category === cat),
    })).filter((g) => g.items.length > 0)
  }, [filteredItems])

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Mi Despensa e Inventario</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Lo que tengas aquí se descuenta automáticamente al calcular la lista de la compra semanal.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-xl bg-stone-100 px-3 py-1.5 font-semibold text-stone-700">
            {snapshot.pantry.length} productos en casa
          </span>
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyLowStock((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 font-semibold transition ${
                onlyLowStock
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200/80'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {lowStockCount} con poco stock
            </button>
          )}
        </div>
      </div>

      {/* Formulario añadir a despensa */}
      <form
        onSubmit={handleAddSubmit}
        className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs"
      >
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-stone-500">
          Añadir o sumar existencias a la despensa
        </h3>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_105px_150px_190px_auto]">
          <input
            type="text"
            required
            list="pantry-suggestions-datalist"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Producto (ej. Arroz redondo, Huevos, Tomate triturado...)"
            className="rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          />
          <datalist id="pantry-suggestions-datalist">
            {knownIngredientSuggestions.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>

          <input
            type="number"
            min={0}
            step="any"
            disabled={alwaysAvailable || unit === 'al_gusto'}
            value={alwaysAvailable || unit === 'al_gusto' ? '' : quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Cant."
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-100 focus:border-emerald-600 focus:outline-none"
          />

          <select
            disabled={alwaysAvailable}
            value={alwaysAvailable ? 'al_gusto' : unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-100 focus:border-emerald-600 focus:outline-none"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory)}
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
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Guardar
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-stone-600">
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={alwaysAvailable}
              onChange={(e) => setAlwaysAvailable(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-emerald-700"
            />
            <span>Básico siempre disponible (sal, aceite, especias...)</span>
          </label>

          {!alwaysAvailable && unit !== 'al_gusto' && (
            <div className="flex items-center gap-2">
              <span>Avisar poco stock debajo de:</span>
              <input
                type="number"
                min={0}
                step="any"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="Opcional"
                className="w-24 rounded-lg border border-stone-300 px-2.5 py-1 text-xs focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}
        </div>
      </form>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar despensa..."
            className="w-full rounded-xl border border-stone-300 bg-white py-2 pr-4 pl-10 text-sm focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterCategory('todas')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filterCategory === 'todas'
                ? 'bg-stone-900 text-white'
                : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
            }`}
          >
            Todas
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filterCategory === cat
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
              }`}
            >
              {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventario agrupado */}
      {groupedByCategory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-base font-semibold text-stone-700">
            No hay productos que coincidan en tu despensa
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Añade los ingredientes que ya tienes en casa para descontarlos de la compra.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groupedByCategory.map((group) => (
            <div
              key={group.category}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs"
            >
              <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                  <span>{group.meta.emoji}</span>
                  <span>{group.meta.label}</span>
                </h3>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                  {group.items.length}
                </span>
              </div>

              <ul className="space-y-2">
                {group.items.map((item) => {
                  const low = isLowStock(item)
                  const isEditing = editingItem?.id === item.id

                  if (isEditing && editingItem) {
                    return (
                      <li
                        key={item.id}
                        className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-3"
                      >
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_130px_auto]">
                          <input
                            type="text"
                            value={editingItem.name}
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, name: e.target.value })
                            }
                            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium"
                          />
                          <input
                            type="number"
                            min={0}
                            step="any"
                            disabled={editingItem.alwaysAvailable}
                            value={editingItem.alwaysAvailable ? '' : editingItem.quantity}
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                quantity: Number(e.target.value) || 0,
                              })
                            }
                            className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs disabled:bg-stone-100"
                          />
                          <select
                            disabled={editingItem.alwaysAvailable}
                            value={editingItem.unit}
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                unit: e.target.value as Unit,
                              })
                            }
                            className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                savePantryItem(editingItem)
                                setEditingItem(null)
                              }}
                              className="rounded-lg bg-emerald-700 p-1.5 text-white hover:bg-emerald-800"
                              title="Guardar"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItem(null)}
                              className="rounded-lg bg-stone-200 p-1.5 text-stone-700 hover:bg-stone-300"
                              title="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  }

                  return (
                    <li
                      key={item.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                        low
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-stone-200 bg-stone-50/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-stone-900">
                            {item.name}
                          </span>
                          {low && (
                            <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                              {item.quantity <= 0 ? 'Agotado' : 'Poco stock'}
                            </span>
                          )}
                        </div>
                        {item.minQuantity !== undefined && !item.alwaysAvailable && (
                          <p className="text-[11px] text-stone-500">
                            Mínimo ideal: {formatUnitLabel(item.minQuantity, item.unit)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {item.alwaysAvailable ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            <InfinityIcon className="h-3.5 w-3.5" />
                            Básico
                          </span>
                        ) : (
                          <div className="inline-flex items-center rounded-xl border border-stone-200 bg-white p-0.5">
                            <button
                              type="button"
                              onClick={() => adjustPantryQuantity(item.id, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100"
                              title="Restar stock"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-16 px-2 text-center text-xs font-bold text-stone-900">
                              {formatUnitLabel(item.quantity, item.unit)}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustPantryQuantity(item.id, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100"
                              title="Sumar stock"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
                          title="Editar"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePantryItem(item.id)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Eliminar de despensa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
