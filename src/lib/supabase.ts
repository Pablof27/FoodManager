import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const RUNTIME_CONFIG_STORAGE_KEY = 'foodmanager_supabase_config_v1'

export interface SupabaseConfigInfo {
  url: string
  anonKey: string
  source: 'env' | 'runtime'
}

const ENV_SUPABASE_URL =
  typeof import.meta.env.VITE_SUPABASE_URL === 'string'
    ? import.meta.env.VITE_SUPABASE_URL.trim()
    : ''

const ENV_SUPABASE_ANON_KEY =
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
    ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
    : ''

function isValidSupabaseUrl(rawUrl: string): boolean {
  if (!rawUrl) return false
  try {
    const parsed = new URL(rawUrl)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function hasEnvSupabaseConfig(): boolean {
  return isValidSupabaseUrl(ENV_SUPABASE_URL) && ENV_SUPABASE_ANON_KEY.length > 20
}

export function getEffectiveSupabaseConfig(): SupabaseConfigInfo | null {
  if (hasEnvSupabaseConfig()) {
    return {
      url: ENV_SUPABASE_URL,
      anonKey: ENV_SUPABASE_ANON_KEY,
      source: 'env',
    }
  }

  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { url?: unknown; anonKey?: unknown }
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    const anonKey = typeof parsed.anonKey === 'string' ? parsed.anonKey.trim() : ''
    if (isValidSupabaseUrl(url) && anonKey.length > 20) {
      return { url, anonKey, source: 'runtime' }
    }
  } catch {
    // Ignorar configuración corrupta en localStorage
  }

  return null
}

let cachedClientKey = ''
let cachedClient: SupabaseClient | null = null

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim().replace(/\/+$/, '')
  const cleanKey = anonKey.trim()
  if (!isValidSupabaseUrl(cleanUrl) || cleanKey.length <= 20) {
    throw new Error(
      'Introduce una Project URL válida (https://xxx.supabase.co) y la clave pública anon/publishable.',
    )
  }
  localStorage.setItem(
    RUNTIME_CONFIG_STORAGE_KEY,
    JSON.stringify({ url: cleanUrl, anonKey: cleanKey }),
  )
  cachedClientKey = ''
  cachedClient = null
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(RUNTIME_CONFIG_STORAGE_KEY)
  }
  cachedClientKey = ''
  cachedClient = null
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getEffectiveSupabaseConfig()
  if (!cfg) return null

  const nextKey = `${cfg.url}::${cfg.anonKey}`
  if (cachedClient && cachedClientKey === nextKey) {
    return cachedClient
  }

  cachedClientKey = nextKey
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'foodmanager_supabase_auth',
    },
  })

  return cachedClient
}

/**
 * Construye la URL exacta de retorno OAuth respetando subrutas de GitHub Pages
 * (ej. https://usuario.github.io/FoodManager/).
 */
export function getOAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${window.location.pathname}`
}
