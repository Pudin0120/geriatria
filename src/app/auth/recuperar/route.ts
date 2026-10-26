import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 403 })
  }
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim()
  if (!email || !email.includes('@')) return NextResponse.redirect(new URL('/login/recuperar?sent=1', request.url), { status: 303 })
  const supabase = await createClient()
  const callback = new URL('/auth/callback', request.url)
  callback.searchParams.set('next', '/auth/actualizar')
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() })
  // Respuesta indistinguible para evitar revelar si existe una cuenta.
  return NextResponse.redirect(new URL('/login/recuperar?sent=1', request.url), { status: 303 })
}
