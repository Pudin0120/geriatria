/**
 * GeriCare · Fase 2 — Proxy (antes "middleware", renombrado en Next.js 16)
 *
 * Protege todas las rutas bajo `/dashboard`: si no hay sesión activa con
 * Supabase, redirige a `/login` guardando el destino original en la query
 * `?redirect=`. Además refresca los tokens de sesión escribiendo las cookies
 * renovadas en la respuesta.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  )

  // IMPORTANTE: mantener esta lógica ligera; el proxy corre antes del render.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const urlDeLogin = request.nextUrl.clone()
    urlDeLogin.pathname = '/login'
    urlDeLogin.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(urlDeLogin)
  }

  // Si ya hay sesión y visita /login o la raíz, lo llevamos al panel.
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/')) {
    const urlDePanel = request.nextUrl.clone()
    urlDePanel.pathname = '/dashboard'
    urlDePanel.search = ''
    return NextResponse.redirect(urlDePanel)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Aplica el proxy a todas las rutas excepto:
     * - assets estáticos (_next/static, _next/image, favicon.ico)
     * - imágenes e iconos servidos desde /public
     * (el login NO se excluye: también necesitamos refrescar cookies ahí
     *  y redirigir a usuarios autenticados)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
