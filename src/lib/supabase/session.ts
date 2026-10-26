import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ProfileRow, UserRole } from '@/types'
import { isUserRole } from '@/types'

export interface SesionActiva {
  userId: string
  perfil: ProfileRow | null
  rol: UserRole
}

/**
 * Obtiene la sesión activa y el perfil del usuario (con su rol) desde la BD.
 * Se memoiza con `cache()` para que layout y página compartan una sola lectura
 * por petición. Confía en las políticas RLS de la Fase 1: el select sobre
 * `profiles` solo devuelve la propia fila del autenticado.
 */
export const obtenerSesionActiva = cache(
  async (): Promise<SesionActiva | null> => {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: perfil } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle<ProfileRow>()

    // Fallback defensivo: sin perfil visible usamos current_user_role() de la BD.
    let rol: UserRole = 'auxiliar'
    if (perfil && isUserRole(perfil.role)) {
      rol = perfil.role
    } else {
      const { data: rolDb } = await supabase.rpc('current_user_role')
      if (isUserRole(rolDb)) rol = rolDb
    }

    return { userId: user.id, perfil, rol }
  },
)
