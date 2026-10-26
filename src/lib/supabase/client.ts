import { createBrowserClient } from '@supabase/ssr'
import { obtenerConfigSupabase } from '@/lib/supabase/env'

/**
 * Cliente Supabase para el NAVEGADOR (Client Components).
 * Lee la configuración validada/normalizada desde `env.ts`; si faltan o son
 * inválidas las variables NEXT_PUBLIC_*, falla rápido con un mensaje claro
 * en lugar de enviar `apikey: undefined` y recibir «invalid key».
 */
export function createClient() {
  const { url, anonKey } = obtenerConfigSupabase()
  return createBrowserClient(url, anonKey)
}
