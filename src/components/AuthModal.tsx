import {
  AlertCircle,
  Check,
  Cloud,
  Copy,
  Database,
  HardDriveDownload,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/useAuth'
import { useFoodStore } from '../context/useFoodStore'
import { getOAuthRedirectUrl } from '../lib/supabase'

interface AuthModalProps {
  onClose: () => void
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.56-5.17 3.56-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.6H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.4l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.99 3.09c.95-2.85 3.6-4.94 6.72-4.94Z"
      />
    </svg>
  )
}

export function AuthModal({ onClose }: AuthModalProps) {
  const {
    user,
    profile,
    supabaseConfig,
    isSupabaseConfigured,
    hasEnvConfig,
    authError,
    clearAuthError,
    signInWithGoogle,
    signOut,
    configureRuntimeSupabase,
    disconnectRuntimeSupabase,
  } = useAuth()

  const {
    cloudSyncStatus,
    cloudSyncError,
    lastSyncedAt,
    refreshFromCloud,
    importLocalGuestDataToCloud,
  } = useFoodStore()

  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showConfigForm, setShowConfigForm] = useState(!isSupabaseConfigured)
  const [urlInput, setUrlInput] = useState(supabaseConfig?.url ?? '')
  const [anonKeyInput, setAnonKeyInput] = useState(supabaseConfig?.anonKey ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [confirmImportLocal, setConfirmImportLocal] = useState(false)
  const [copiedRedirect, setCopiedRedirect] = useState(false)

  const redirectUrl = getOAuthRedirectUrl()

  const handleGoogleSignIn = async () => {
    setLocalError(null)
    clearAuthError()
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch {
      setIsSigningIn(false)
    }
  }

  const handleSaveConfig = (e: FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    try {
      configureRuntimeSupabase(urlInput, anonKeyInput)
      setShowConfigForm(false)
      setStatusNotice('Conexión con Supabase guardada. Ya puedes continuar con Google.')
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Configuración no válida.')
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    setStatusNotice(null)
    try {
      await refreshFromCloud()
      setStatusNotice('Datos sincronizados con Supabase.')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleImportLocal = async () => {
    await importLocalGuestDataToCloud()
    setConfirmImportLocal(false)
    setStatusNotice('Tus datos del modo local se han copiado a tu cuenta en la nube.')
  }

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUrl)
      setCopiedRedirect(true)
      window.setTimeout(() => setCopiedRedirect(false), 2000)
    } catch {
      // Ignorar si clipboard no está disponible
    }
  }

  const combinedError = localError ?? authError ?? cloudSyncError

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <Cloud className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base font-bold text-stone-900">
                {user ? 'Tu cuenta y sincronización' : 'Cuenta en la nube'}
              </h2>
              <p className="text-xs text-stone-500">
                {user
                  ? 'Datos privados aislados por usuario en Supabase'
                  : 'Accede desde móvil y ordenador con la misma sesión'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/70"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {statusNotice && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900">
              <Check className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{statusNotice}</span>
            </div>
          )}

          {combinedError && (
            <div className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
              <div className="flex items-start gap-2 font-semibold">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span>{combinedError}</span>
              </div>
              {cloudSyncError && (
                <p className="pl-6 text-[11px] text-rose-700">
                  Si acabas de crear el proyecto en Supabase, asegúrate de haber ejecutado{' '}
                  <code className="rounded bg-rose-100 px-1 py-0.5">supabase/schema.sql</code> en el
                  SQL Editor.
                </p>
              )}
            </div>
          )}

          {user && profile ? (
            <>
              {/* Tarjeta de perfil */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.fullName}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-full border border-stone-200 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-base font-bold text-white">
                    {profile.fullName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-stone-900">{profile.fullName}</p>
                  <p className="truncate text-xs text-stone-500">{profile.email}</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                    <ShieldCheck className="h-3 w-3" />
                    Sesión activa con Google
                  </span>
                </div>
              </div>

              {/* Estado de sincronización */}
              <div className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        cloudSyncStatus === 'synced'
                          ? 'bg-emerald-500'
                          : cloudSyncStatus === 'syncing'
                            ? 'animate-pulse bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-xs font-semibold text-stone-900">
                      {cloudSyncStatus === 'synced'
                        ? 'Sincronizado con Supabase'
                        : cloudSyncStatus === 'syncing'
                          ? 'Sincronizando cambios…'
                          : 'Pendiente de sincronizar'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </button>
                </div>

                {lastSyncedAt && (
                  <p className="mt-1.5 text-[11px] text-stone-500">
                    Última sincronización:{' '}
                    {new Date(lastSyncedAt).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                )}
              </div>

              {/* Importar desde modo local */}
              <div className="space-y-2 border-t border-stone-200 pt-4">
                {confirmImportLocal ? (
                  <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-medium text-amber-950">
                      ¿Sustituir los datos de tu cuenta en la nube por las recetas y planificación
                      guardadas en el modo local de este navegador?
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmImportLocal(false)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleImportLocal()}
                        className="rounded-lg bg-amber-700 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                      >
                        Sí, copiar a mi cuenta
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmImportLocal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    <HardDriveDownload className="h-4 w-4 text-stone-500" />
                    Traer datos del modo local a esta cuenta
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    await signOut()
                    onClose()
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión (volver al modo local)
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Vista de acceso con Google */}
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-stone-600">
                  Cada persona tiene su propio recetario, menú semanal, despensa y lista de la
                  compra privados. Al entrar por primera vez, tus datos locales actuales se subirán
                  automáticamente a tu cuenta.
                </p>

                <button
                  type="button"
                  onClick={() => void handleGoogleSignIn()}
                  disabled={!isSupabaseConfigured || isSigningIn}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-800 shadow-2xs transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSigningIn ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span>
                    {isSigningIn ? 'Redirigiendo a Google…' : 'Continuar con Google'}
                  </span>
                </button>

                <div className="flex items-center gap-2 rounded-xl bg-stone-100/80 px-3 py-2 text-[11px] text-stone-600">
                  <Database className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                  <span>
                    Sin iniciar sesión sigues usando el <strong>modo local</strong> en este
                    dispositivo sin perder nada.
                  </span>
                </div>
              </div>

              {/* Configuración de proyecto Supabase si no viene por variables de entorno */}
              {!hasEnvConfig && (
                <div className="border-t border-stone-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowConfigForm((v) => !v)}
                    className="flex w-full items-center justify-between text-left text-xs font-semibold text-stone-700 hover:text-stone-900"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-emerald-700" />
                      {isSupabaseConfigured
                        ? 'Conexión Supabase configurada (editar)'
                        : 'Configurar conexión a Supabase'}
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      {showConfigForm ? 'Ocultar' : 'Abrir'}
                    </span>
                  </button>

                  {showConfigForm && (
                    <form onSubmit={handleSaveConfig} className="mt-3 space-y-3">
                      <p className="text-[11px] leading-relaxed text-stone-500">
                        Para producción en GitHub Pages define{' '}
                        <code className="rounded bg-stone-100 px-1">VITE_SUPABASE_URL</code> y{' '}
                        <code className="rounded bg-stone-100 px-1">VITE_SUPABASE_ANON_KEY</code>.
                        Para probar al instante también puedes pegarlas aquí:
                      </p>

                      <div>
                        <label className="block text-[11px] font-semibold text-stone-700">
                          Supabase Project URL
                        </label>
                        <input
                          type="url"
                          required
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          placeholder="https://xyzcompany.supabase.co"
                          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-stone-700">
                          Supabase Anon / Publishable Key
                        </label>
                        <input
                          type="text"
                          required
                          value={anonKeyInput}
                          onChange={(e) => setAnonKeyInput(e.target.value)}
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      {redirectUrl && (
                        <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-stone-700">
                              Redirect URL para Supabase Auth:
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopyRedirect()}
                              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-700 shadow-2xs hover:bg-stone-100"
                            >
                              {copiedRedirect ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-700" />
                                  Copiada
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copiar
                                </>
                              )}
                            </button>
                          </div>
                          <code className="mt-1 block break-all text-[11px] text-stone-600">
                            {redirectUrl}
                          </code>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        {supabaseConfig?.source === 'runtime' ? (
                          <button
                            type="button"
                            onClick={() => {
                              void disconnectRuntimeSupabase()
                              setUrlInput('')
                              setAnonKeyInput('')
                            }}
                            className="text-xs font-medium text-rose-700 hover:underline"
                          >
                            Quitar credenciales
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="submit"
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Guardar conexión
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
