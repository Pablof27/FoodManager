import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Cloud,
  Package,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
} from 'lucide-react'
import { useState } from 'react'
import { AuthModal } from './components/AuthModal'
import { PantryView } from './components/PantryView'
import { PlannerView } from './components/PlannerView'
import { RecipesView } from './components/RecipesView'
import { SettingsModal } from './components/SettingsModal'
import { ShoppingView } from './components/ShoppingView'
import { AuthProvider } from './context/AuthContext'
import { FoodStoreProvider } from './context/FoodStoreContext'
import { useAuth } from './context/useAuth'
import { useFoodStore } from './context/useFoodStore'

type ActiveTab = 'planner' | 'shopping' | 'recipes' | 'pantry'

function FoodManagerShell() {
  const { user, profile } = useAuth()
  const {
    snapshot,
    currentWeekPlan,
    weekShopping,
    isHydrated,
    cloudSyncStatus,
    cloudSyncError,
  } = useFoodStore()
  const [activeTab, setActiveTab] = useState<ActiveTab>('planner')
  const [pantrySearchMode, setPantrySearchMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  const pendingShoppingCount =
    weekShopping.toBuyItems.filter((i) => !i.checked).length +
    currentWeekPlan.extraShoppingItems.filter((e) => !e.checked).length

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900">
      {/* Barra de navegación superior */}
      <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 md:flex-nowrap">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-xs">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-stone-900 sm:text-lg">
                FoodManager
              </h1>
              <p className="hidden text-xs text-stone-500 sm:block">
                Recetas por lotes · Menú semanal · Compra y despensa
              </p>
            </div>
          </div>

          {/* Pestañas principales */}
          <nav
            aria-label="Navegación principal"
            className="order-3 flex w-full items-center justify-between gap-1 rounded-2xl border border-stone-200 bg-stone-100/80 p-1 md:order-2 md:w-auto"
          >
            <button
              type="button"
              onClick={() => setActiveTab('planner')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition md:flex-initial ${
                activeTab === 'planner'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              <span>Semana</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('shopping')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition md:flex-initial ${
                activeTab === 'shopping'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Compra</span>
              {pendingShoppingCount > 0 && (
                <span className="rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendingShoppingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recipes')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition md:flex-initial ${
                activeTab === 'recipes'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Recetas</span>
              <span className="hidden rounded-full bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 sm:inline">
                {snapshot.recipes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pantry')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition md:flex-initial ${
                activeTab === 'pantry'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Despensa</span>
            </button>
          </nav>

          <div className="order-2 flex items-center gap-2 md:order-3">
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                user
                  ? 'border-stone-200 bg-white text-stone-800 hover:bg-stone-50'
                  : 'border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/80'
              }`}
              title={
                user && profile
                  ? `Conectado como ${profile.email}`
                  : 'Iniciar sesión con Google para sincronizar dispositivos'
              }
            >
              {user && profile ? (
                <>
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.fullName}
                      referrerPolicy="no-referrer"
                      className="h-5 w-5 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">
                      {profile.fullName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden max-w-28 truncate sm:inline">
                    {profile.fullName.split(' ')[0]}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      cloudSyncStatus === 'synced'
                        ? 'bg-emerald-500'
                        : cloudSyncStatus === 'syncing'
                          ? 'animate-pulse bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                    title={
                      cloudSyncStatus === 'synced'
                        ? 'Sincronizado en la nube'
                        : cloudSyncStatus === 'syncing'
                          ? 'Sincronizando…'
                          : 'Error de sincronización'
                    }
                  />
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4 text-emerald-700" />
                  <span>Entrar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              title="Preferencias y copias de seguridad"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Ajustes</span>
            </button>
          </div>
        </div>
      </header>

      {/* Aviso si falla sincronización con Supabase */}
      {user && cloudSyncError && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                No se pudo sincronizar con Supabase ({cloudSyncError}). Tus cambios están guardados
                en caché local.
              </span>
            </span>
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="font-semibold text-amber-900 underline"
            >
              Revisar cuenta
            </button>
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {!isHydrated ? (
          <div className="flex h-64 items-center justify-center text-sm text-stone-500">
            Cargando tus recetas y planificación...
          </div>
        ) : (
          <>
            {activeTab === 'planner' && <PlannerView />}
            {activeTab === 'shopping' && <ShoppingView />}
            {activeTab === 'recipes' && (
              <RecipesView
                onNavigateToPlanner={() => setActiveTab('planner')}
                onNavigateToPantry={() => setActiveTab('pantry')}
                pantryMode={pantrySearchMode}
                onPantryModeChange={setPantrySearchMode}
              />
            )}
            {activeTab === 'pantry' && (
              <PantryView
                onSearchRecipesByPantry={() => {
                  setPantrySearchMode(true)
                  setActiveTab('recipes')
                }}
                onNavigateToShopping={() => setActiveTab('shopping')}
              />
            )}
          </>
        )}
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenAuth={() => {
            setShowSettings(false)
            setShowAuth(true)
          }}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <FoodStoreProvider>
        <FoodManagerShell />
      </FoodStoreProvider>
    </AuthProvider>
  )
}
