import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Callback OAuth/PKCE de Supabase Auth (`/auth/callback`).
 * El proveedor (email magic link, Google, etc.) redirige aquí con `?code=…`;
 * este handler canjea el código por una sesión (intercambio PKCE) guardando
 * las cookies correspondientes y redirige al destino `?next=…` validado.
 *
 * Requiere en Dashboard → Authentication → URL Configuration:
 *   Redirect URLs: http://localhost:3000/auth/callback (y el equivalente en prod).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') ?? '/dashboard'

  // Anti open-redirect: solo rutas relativas internas seguras.
  const esRutaRelativaSegura =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') && !nextRaw.startsWith('/\\')
  const destino = esRutaRelativaSegura ? nextRaw : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`)
    }
    // Código inválido/expirado/duplicado: volvemos al login con contexto.
    return NextResponse.redirect(`${origin}/login?error=callback`)
  }

  // Sin código no hay nada que canjear (o el proveedor devolvió `error=`).
  return NextResponse.redirect(`${origin}/login`)
}
