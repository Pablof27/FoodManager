import { Cloud, Download, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useAuth } from '../context/useAuth'
import { useFoodStore } from '../context/useFoodStore'
import { ALL_MEAL_SLOTS } from '../types/food'

interface SettingsModalProps {
  onClose: () => void
  onOpenAuth?: () => void
}

export function SettingsModal({ onClose, onOpenAuth }: SettingsModalProps) {
  const { user, profile } = useAuth()
  const {
    snapshot,
    toggleMealSlot,
    updateSettings,
    exportDataJson,
    importDataJson,
    restoreDemoData,
    clearAllData,
  } = useFoodStore()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const handleExport = () => {
    const json = exportDataJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `foodmanager-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatusMessage('Copia de seguridad descargada en JSON.')
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      importDataJson(text)
      setStatusMessage('Datos importados correctamente.')
    } catch {
      setStatusMessage('El archivo seleccionado no tiene un formato JSON válido.')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Preferencias y Datos</h2>
            <p className="text-xs text-stone-500">
              {user && profile
                ? `Sincronizando en Supabase (${profile.email})`
                : 'Modo local activo en este dispositivo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {statusMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
              {statusMessage}
            </div>
          )}

          {onOpenAuth && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
              <div className="flex items-center gap-2.5">
                <Cloud className="h-4.5 w-4.5 shrink-0 text-emerald-700" />
                <div>
                  <p className="text-xs font-bold text-stone-900">
                    {user && profile ? `Conectado como ${profile.fullName}` : 'Modo sin cuenta (local)'}
                  </p>
                  <p className="text-[11px] text-stone-600">
                    {user
                      ? 'Tus datos se sincronizan en tus dispositivos.'
                      : 'Inicia sesión con Google para sincronizar móvil y PC.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenAuth}
                className="shrink-0 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                {user ? 'Ver cuenta' : 'Entrar'}
              </button>
            </div>
          )}

          {/* Franjas de comida */}
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Franjas de comida visibles en el planificador
            </h3>
            <p className="mt-0.5 text-xs text-stone-500">
              Elige qué comidas del día quieres organizar habitualmente.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALL_MEAL_SLOTS.map((slot) => {
                const enabled = snapshot.settings.enabledSlots.includes(slot.id)
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => toggleMealSlot(slot.id)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      enabled
                        ? 'bg-emerald-700 text-white'
                        : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Raciones por defecto */}
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Raciones por defecto al añadir un plato
            </h3>
            <p className="mt-0.5 text-xs text-stone-500">
              Número habitual de comensales por comida (puedes cambiarlo en cada toma).
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => updateSettings({ defaultServingsPerMeal: n })}
                  className={`h-9 w-9 rounded-xl text-xs font-bold transition ${
                    snapshot.settings.defaultServingsPerMeal === n
                      ? 'bg-stone-900 text-white'
                      : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Copias de seguridad */}
          <div className="space-y-3 border-t border-stone-200 pt-5">
            <h3 className="text-sm font-semibold text-stone-900">
              Copia de seguridad y gestión de datos
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
              >
                <Download className="h-4 w-4" />
                Exportar JSON
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
              >
                <Upload className="h-4 w-4" />
                Importar JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  restoreDemoData()
                  setStatusMessage('Recetas y planificación de ejemplo restauradas.')
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar datos de ejemplo
              </button>

              {confirmClearAll ? (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-1.5">
                  <span className="text-xs font-semibold text-rose-800">
                    ¿Borrar todo?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="text-xs text-stone-600 hover:underline"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearAllData()
                      setConfirmClearAll(false)
                      setStatusMessage('Datos vaciados. Puedes empezar desde cero.')
                    }}
                    className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    Confirmar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Empezar en blanco
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
