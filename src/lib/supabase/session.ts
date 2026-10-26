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
 * por petición. Exige un perfil activo y un rol válido; falla cerrada si falta.
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

    // Un perfil ausente, inactivo o mal tipado nunca hereda un rol genérico.
    if (!perfil?.active || !isUserRole(perfil.role)) return null
    return { userId: user.id, perfil, rol: perfil.role }
  },
)
