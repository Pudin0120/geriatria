import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Proxy (antes middleware) de GeriCare.
 * Protege todas las rutas bajo /dashboard: si no hay sesión activa con
 * usuario verificado, redirige a /login. También evita que un usuario ya
 * autenticado vuelva a ver /login o la raíz pública.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Sin configuración de Supabase no se puede validar la sesión: se deja
  // pasar la petición; las páginas protegidas siguen validando su propia
  // sesión en el layout del dashboard.
  if (!url || !anonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(url, anonKey, {
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

  const esRutaProtegida = request.nextUrl.pathname.startsWith('/dashboard')
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
