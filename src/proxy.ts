import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { configSupabaseOpcional, diagnosticarConfigSupabase } from '@/lib/supabase/env'

/**
 * Bandera de módulo: el diagnóstico por falta/malformación de variables de
 * entorno se registra UNA SOLA VEZ por proceso (cold start) para no inundar
 * la consola del servidor en cada petición.
 */
let diagnosticoEmitido = false

/**
 * Proxy (antes middleware) de GeriCare.
 * Protege todas las rutas bajo /dashboard: si no hay sesión activa con
 * usuario verificado, redirige a /login. También evita que un usuario ya
 * autenticado vuelva a ver /login o la raíz pública.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Sin configuración válida de Supabase no se puede validar la sesión: se
  // deja pasar la petición; las páginas protegidas siguen validando su propia
  // sesión en el layout del dashboard (que sí fallará con mensaje claro).
  const config = configSupabaseOpcional()
  if (!config) {
    if (!diagnosticoEmitido) {
      diagnosticoEmitido = true
      console.error(
        '[GeriCare][proxy] Supabase sin configurar — sesión no verificable. ' +
          `Diagnóstico: ${diagnosticarConfigSupabase() ?? 'desconocido'}`,
      )
    }
    return supabaseResponse
  }

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // IMPORTANTE: getUser() (no getSession()) para verificar el token en servidor.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const esRutaProtegida =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/auxiliar')
  const esRutaPublica =
    request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/'

  if (esRutaProtegida && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (!esRutaProtegida && esRutaPublica && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Excluye assets estáticos, imágenes optimizadas, favicon y archivos de
    // público/ (.svg/.png/...); deja pasar /dashboard, /login y /.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
}
