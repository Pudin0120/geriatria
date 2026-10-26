import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { obtenerConfigSupabase } from '@/lib/supabase/env'

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * La configuración se obtiene del validador central (`env.ts`): sin aserciones
 * `!` que silencien TypeScript y revienten en runtime con «invalid key».
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = obtenerConfigSupabase()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        // El try/catch es idiomático de @supabase/ssr: `cookies().set()` puede
        // lanzar si se invoca fuera de una acción/mutación (Server Component
        // de solo lectura); en ese caso Next.js gestiona la cabecera Set-Cookie.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Ignorado deliberadamente: no debe romper el renderizado.
        }
      },
    },
  })
}
