/**
 * GeriCare · Fase 2 — Server Actions de autenticación
 *
 * `login`, `logout` y `signup` operan exclusivamente en el servidor con la
 * anon key + cookies SSR (nunca se expone la service role key). Todos los
 * mensajes visibles al usuario están en español.
 */

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface AuthState {
  exito: boolean
  mensaje: string
}

const LONGITUD_MINIMA_CONTRASENA = 8

/** Normaliza errores conocidos de Supabase Auth a mensajes en español. */
function traducirError(error: string): string {
  const texto = error.toLowerCase()

  if (texto.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.'
  }
  if (texto.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
  }
  if (texto.includes('rate limit') || texto.includes('too many requests')) {
    return 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.'
  }
  if (texto.includes('already registered') || texto.includes('already been registered')) {
    return 'Ya existe una cuenta registrada con ese correo electrónico.'
  }
  if (texto.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 8 caracteres.'
  }
  if (texto.includes('unable to validate email')) {
    return 'El formato del correo electrónico no es válido.'
  }
  return 'Ocurrió un problema al comunicar con el servidor. Inténtalo de nuevo.'
}

/** Inicia sesión con correo y contraseña; redirige al dashboard si todo va bien. */
export async function login(_estadoPrevio: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { exito: false, mensaje: 'Debes completar el correo y la contraseña.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { exito: false, mensaje: traducirError(error.message) }
  }

  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard')
}

/** Cierra la sesión actual, limpia cachés y vuelve al login. */
export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath('/dashboard', 'layout')
  revalidatePath('/login', 'page')
  redirect('/login')
}

/** Registra una nueva cuenta de personal; confirma el correo si es necesario. */
export async function signup(_estadoPrevio: AuthState, formData: FormData): Promise<AuthState> {
  const nombre = String(formData.get('fullName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const confirmar = String(formData.get('confirmPassword') ?? '')

  if (nombre.length < 3) {
    return { exito: false, mensaje: 'Indica tu nombre completo (mínimo 3 caracteres).' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { exito: false, mensaje: 'El correo electrónico no tiene un formato válido.' }
  }
  if (password.length < LONGITUD_MINIMA_CONTRASENA) {
    return {
      exito: false,
      mensaje: `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`,
    }
  }
  if (password !== confirmar) {
    return { exito: false, mensaje: 'Las contraseñas no coinciden.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: nombre },
    },
  })

  if (error) {
    return { exito: false, mensaje: traducirError(error.message) }
  }

  // Si el proyecto no exige confirmación de correo, ya hay sesión activa.
  if (data.session) {
    revalidatePath('/dashboard', 'layout')
    redirect('/dashboard')
  }

  return {
    exito: true,
    mensaje:
      'Cuenta creada correctamente. Revisa tu correo para confirmarla y luego inicia sesión.',
  }
}
