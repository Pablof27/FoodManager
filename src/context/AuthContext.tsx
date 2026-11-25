import type { Session, User } from '@supabase/supabase-js'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearRuntimeSupabaseConfig,
  getEffectiveSupabaseConfig,
  getOAuthRedirectUrl,
  getSupabaseClient,
  hasEnvSupabaseConfig,
  saveRuntimeSupabaseConfig,
} from '../lib/supabase'
import { AuthContext, type AuthContextValue, type AuthUserProfile } from './useAuth'

function extractUserProfile(user: User | null): AuthUserProfile | null {
  if (!user) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const rawName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    user.email?.split('@')[0] ||
    'Usuario'
  const rawAvatar =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    null

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: rawName,
    avatarUrl: rawAvatar,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configVersion, setConfigVersion] = useState(0)
  const [authState, setAuthState] = useState<{
    resolvedKey: string | null
    session: Session | null
  }>({
    resolvedKey: null,
    session: null,
  })
  const [authError, setAuthError] = useState<string | null>(null)

  const supabaseConfig = useMemo(() => {
    void configVersion
    return getEffectiveSupabaseConfig()
  }, [configVersion])

  const activeConfigKey = supabaseConfig
    ? `${supabaseConfig.url}::${supabaseConfig.anonKey}`
    : null

  const isAuthLoading =
    activeConfigKey !== null && authState.resolvedKey !== activeConfigKey
  const session =
    activeConfigKey !== null && authState.resolvedKey === activeConfigKey
      ? authState.session
      : null
  const user = session?.user ?? null

  useEffect(() => {
    if (!activeConfigKey) {
      return
    }
    const client = getSupabaseClient()
    if (!client) {
      return
    }

    let mounted = true

    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setAuthError(error.message)
        }
        setAuthState({
          resolvedKey: activeConfigKey,
          session: data.session ?? null,
        })
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setAuthError(err instanceof Error ? err.message : 'Error verificando sesión')
        setAuthState({
          resolvedKey: activeConfigKey,
          session: null,
        })
      })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setAuthState({
        resolvedKey: activeConfigKey,
        session: nextSession,
      })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [activeConfigKey])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    const client = getSupabaseClient()
    if (!client) {
      setAuthError(
        'Configura primero la URL y la Anon Key de tu proyecto de Supabase para iniciar sesión con Google.',
      )
      return
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectUrl(),
        queryParams: {
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    const client = getSupabaseClient()
    if (!client) {
      setAuthState({ resolvedKey: activeConfigKey, session: null })
      return
    }
    const { error } = await client.auth.signOut()
    if (error) {
      setAuthError(error.message)
      throw error
    }
    setAuthState({ resolvedKey: activeConfigKey, session: null })
  }, [activeConfigKey])

  const configureRuntimeSupabase = useCallback((url: string, anonKey: string) => {
    setAuthError(null)
    saveRuntimeSupabaseConfig(url, anonKey)
    setConfigVersion((v) => v + 1)
  }, [])

  const disconnectRuntimeSupabase = useCallback(async () => {
    setAuthError(null)
    const client = getSupabaseClient()
    if (client) {
      try {
        await client.auth.signOut()
      } catch {
        // Ignorar errores al cerrar sesión antes de limpiar configuración
      }
    }
    clearRuntimeSupabaseConfig()
    setAuthState({ resolvedKey: null, session: null })
    setConfigVersion((v) => v + 1)
  }, [])

  const profile = useMemo(() => extractUserProfile(user), [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      session,
      isAuthLoading,
      supabaseConfig,
      isSupabaseConfigured: supabaseConfig !== null,
      hasEnvConfig: hasEnvSupabaseConfig(),
      authError,
      clearAuthError,
      signInWithGoogle,
      signOut,
      configureRuntimeSupabase,
      disconnectRuntimeSupabase,
    }),
    [
      user,
      profile,
      session,
      isAuthLoading,
      supabaseConfig,
      authError,
      clearAuthError,
      signInWithGoogle,
      signOut,
      configureRuntimeSupabase,
      disconnectRuntimeSupabase,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
