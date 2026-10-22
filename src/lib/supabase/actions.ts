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

/**
 * Diagnóstico temprano: si faltan las variables de entorno de Supabase,
 * las Server Actions fallarían con un mensaje genérico. Aquí se detecta
 * y se informa con precisión (sin exponer valores ni claves).
 */
function validarConfiguracionSupabase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return (
      'Falta la configuración de Supabase en este entorno. ' +
      'Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local ' +
      '(o en los Secrets de Vercel) y REINICIA el servidor / vuelve a desplegar.'
    )
  }
  try {
    new URL(url)
  } catch {
    return 'NEXT_PUBLIC_SUPABASE_URL no tiene un formato válido (debe ser https://xxxx.supabase.co).'
  }
  return null
}

/** Normaliza errores conocidos de Supabase Auth a mensajes en español. */
function traducirError(err: { message?: string; name?: string; code?: string } | null): string {
  const texto = `${err?.message ?? ''} ${err?.name ?? ''}`.toLowerCase()

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
  // Error de red o fetch fallido contra la API de Supabase.
  if (texto.includes('fetcherror') || texto.includes('failed to fetch') || texto.includes('network')) {
    return 'No se pudo conectar con Supabase. Revisa tu conexión y que la URL del proyecto sea correcta.'
  }
  // Mensaje original como último recurso (útil para depurar), truncado.
  const detalle = err?.message ? ` Detalle: ${err.message.slice(0, 120)}.` : ''
  return `Ocurrió un problema al comunicar con el servidor.${detalle} Inténtalo de nuevo.`
}

/** Inicia sesión con correo y contraseña; redirige al dashboard si todo va bien. */
export async function login(_estadoPrevio: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { exito: false, mensaje: 'Debes completar el correo y la contraseña.' }
  }

  const problemaConfig = validarConfiguracionSupabase()
  if (problemaConfig) {
    return { exito: false, mensaje: problemaConfig }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { exito: false, mensaje: traducirError(error) }
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

  const problemaConfig = validarConfiguracionSupabase()
  if (problemaConfig) {
    return { exito: false, mensaje: problemaConfig }
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
    return { exito: false, mensaje: traducirError(error) }
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
