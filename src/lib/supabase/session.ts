/**
 * GeriCare · Fase 2 — Sesión y perfil tipados (solo servidor)
 *
 * Lee la sesión de Supabase desde cookies y resuelve el perfil del usuario.
 * El rol se obtiene primero de `public.profiles` (RLS lo permite para el
 * propio usuario) y, si no existe perfil, se hace fallback a la función RPC
 * `current_user_role()` definida en la Fase 1.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isUserRole } from '@/types'
import type { ProfileRow, UserRole } from '@/types'

export interface SesionUsuario {
  userId: string
  email: string
  /** Perfil en `public.profiles`, o null si aún no fue provisionado. */
  perfil: ProfileRow | null
  /** Rol efectivo del usuario (perfil → fallback RPC `current_user_role()`). */
  rol: UserRole
}

/**
 * Obtiene la sesión activa del request actual.
 * `cache()` garantiza que layout, página y acciones compartan una sola
 * lectura por renderizado de la petición.
 */
export const obtenerSesionActiva = cache(
  async (): Promise<SesionUsuario | null> => {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) return null

    const userId = user.id
    const email = user.email

    // Lectura real del perfil (protegida por RLS: solo el propio usuario).
    const { data: perfil } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (perfil && isUserRole(perfil.role)) {
      return { userId, email, perfil, rol: perfil.role }
    }

    // Fallback: función SQL `current_user_role()` de la Fase 1.
    const { data: rolRpc } = await supabase.rpc('current_user_role')

    if (isUserRole(rolRpc)) {
      return { userId, email, perfil: perfil ?? null, rol: rolRpc }
    }

    return null
  },
)
