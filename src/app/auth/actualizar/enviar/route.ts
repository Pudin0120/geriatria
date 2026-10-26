import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 403 })
  }

  const data = await request.formData()
  const password = String(data.get('password') ?? '')
  if (password.length < 8) {
    return NextResponse.redirect(new URL('/auth/actualizar?error=invalid', request.url), { status: 303 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return NextResponse.redirect(new URL('/auth/actualizar?error=update', request.url), { status: 303 })
  }

  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login?password_updated=1', request.url), { status: 303 })
}
