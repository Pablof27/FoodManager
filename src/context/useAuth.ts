import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { SupabaseConfigInfo } from '../lib/supabase'

export interface AuthUserProfile {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
}

export interface AuthContextValue {
  user: User | null
  profile: AuthUserProfile | null
  session: Session | null
  isAuthLoading: boolean
  supabaseConfig: SupabaseConfigInfo | null
  isSupabaseConfigured: boolean
  hasEnvConfig: boolean
  authError: string | null
  clearAuthError: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  configureRuntimeSupabase: (url: string, anonKey: string) => void
  disconnectRuntimeSupabase: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}
