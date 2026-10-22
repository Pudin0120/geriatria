'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { fechaLocalISO } from '@/lib/utils'
import type {
  FrailtyLevel,
  ResidentGender,
  ResidentStatus,
  TablesInsert,
  TablesUpdate,
  UserRole,
} from '@/types'
import { isFrailtyLevel, isResidentGender, isResidentStatus } from '@/types'

/* ================================================================== */
/* Tipos de estado de formulario (sin `any`)                           */
/* ================================================================== */

export interface LoginState {
  error: string | null
}

export interface SignupState {
  error: string | null
  exito: boolean
}

const EMAIL_INVALIDO = 'Introduce un correo electrónico válido.'
const PASSWORD_CORTA = 'La contraseña debe tener al menos 8 caracteres.'
const CREDENCIALES_INCORRECTAS =
  'Credenciales incorrectas. Verifica tu correo y contraseña.'
const ERROR_INTERNO =
  'Ocurrió un problema al comunicarse con el servidor. Inténtalo de nuevo.'
const USUARIO_EXISTE =
  'Ya existe una cuenta registrada con ese correo electrónico.'

/** Normaliza errores de Supabase Auth a mensajes comprensibles en español. */
function mensajeErrorAuth(descripcion: string): string {
  const texto = descripcion.toLowerCase()
  if (texto.includes('invalid login credentials')) return CREDENCIALES_INCORRECTAS
  if (texto.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
  }
  if (texto.includes('already registered') || texto.includes('already exists')) {
    return USUARIO_EXISTE
  }
  if (texto.includes('rate limit') || texto.includes('too many requests')) {
    return 'Demasiados intentos. Espera unos minutos antes de reintentar.'
  }
  return descripcion || ERROR_INTERNO
}

function leerCampo(formData: FormData, clave: string): string {
  const valor = formData.get(clave)
  return typeof valor === 'string' ? valor.trim() : ''
}

/* ================================================================== */
/* Server Actions de autenticación                                     */
/* ================================================================== */

/**
 * Inicia sesión con correo y contraseña.
 * En caso de éxito redirige al dashboard; en caso contrario devuelve el error.
 */
export async function login(
  _estadoPrevio: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = leerCampo(formData, 'email')
  const password = leerCampo(formData, 'password')

  if (email.length === 0 || !email.includes('@')) {
    return { error: EMAIL_INVALIDO }
  }
  if (password.length < 8) {
    return { error: PASSWORD_CORTA }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: mensajeErrorAuth(error.message) }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

/** Cierra la sesión actual y regresa a la pantalla de inicio de sesión. */
export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/**
 * Registra una nueva cuenta de personal. El trigger `handle_new_user`
 * crea automáticamente su perfil con rol 'auxiliar' (el más bajo).
 * Tras registrarse inicia sesión y redirige al dashboard.
 */
export async function signup(
  _estadoPrevio: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const nombre = leerCampo(formData, 'full_name')
  const email = leerCampo(formData, 'email')
  const password = leerCampo(formData, 'password')

  if (nombre.length < 3) {
    return { error: 'Escribe tu nombre completo (mínimo 3 caracteres).', exito: false }
  }
  if (email.length === 0 || !email.includes('@')) {
    return { error: EMAIL_INVALIDO, exito: false }
  }
  if (password.length < 8) {
    return { error: PASSWORD_CORTA, exito: false }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: nombre } },
  })

  if (error) {
    return { error: mensajeErrorAuth(error.message), exito: false }
  }

  // Si Supabase no devolvió sesión (correo sin confirmar), informamos al usuario.
  if (!data.session) {
    return {
      error: null,
      exito: true,
    }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

/* ================================================================== */
/* Tipos de estado para formularios de residentes y VGI               */
/* ================================================================== */

export interface ResidentFormState {
  error: string | null
  exito: boolean
  /** Errores por campo (id del input → mensaje en español). */
  campos: Record<string, string>
}

export interface VgiFormState {
  error: string | null
  exito: boolean
  campos: Record<string, string>
}

const ESTADO_INICIAL_FORM: ResidentFormState = {
  error: null,
  exito: false,
  campos: {},
}

/** Lee un número entero desde FormData; devuelve null si está vacío o no es numérico. */
function leerNumero(formData: FormData, clave: string): number | null {
  const crudo = formData.get(clave)
  if (typeof crudo !== 'string') return null
  const texto = crudo.trim()
  if (texto.length === 0) return null
  const n = Number(texto)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Valida una fecha 'YYYY-MM-DD' real y que no sea futura. */
function esFechaValidaNoFutura(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() <= Date.now()
}

/** Convierte los valores de FormData de residente en errores por campo. */
function validarResidentFormData(
  formData: FormData,
): { ok: true; datos: Record<string, string | string[] | null> } | { ok: false; campos: Record<string, string> } {
  const campos: Record<string, string> = {}

  const first_name = leerCampo(formData, 'first_name')
  const last_name = leerCampo(formData, 'last_name')
  const birth_date = leerCampo(formData, 'birth_date')
  const gender = leerCampo(formData, 'gender')
  const room_number = leerCampo(formData, 'room_number')
  const admission_date = leerCampo(formData, 'admission_date')
  const status = leerCampo(formData, 'status')
  const emergency_contact_name = leerCampo(formData, 'emergency_contact_name')
  const emergency_contact_phone = leerCampo(formData, 'emergency_contact_phone')
  const allergiesRaw = leerCampo(formData, 'allergies')
  const diagnosesRaw = leerCampo(formData, 'diagnoses')
  const notes = leerCampo(formData, 'notes')

  if (first_name.length < 2) campos['first_name'] = 'El nombre es obligatorio (mínimo 2 caracteres).'
  if (last_name.length < 2) campos['last_name'] = 'Los apellidos son obligatorios (mínimo 2 caracteres).'
  if (!esFechaValidaNoFutura(birth_date)) campos['birth_date'] = 'Introduce una fecha de nacimiento válida (no puede ser futura).'
  if (!isResidentGender(gender)) campos['gender'] = 'Selecciona un género válido.'
  if (admission_date.length > 0 && !esFechaValidaNoFutura(admission_date)) {
    campos['admission_date'] = 'La fecha de ingreso no puede ser futura.'
  }
  if (status.length > 0 && !isResidentStatus(status)) campos['status'] = 'Selecciona un estado válido.'
  if (emergency_contact_phone.length > 0 && !/^[+\d][\d\s\-().]{5,20}$/.test(emergency_contact_phone)) {
    campos['emergency_contact_phone'] = 'Teléfono no válido (usa dígitos, espacios o +).'
  }

  const listaTexto = (crudo: string): string[] =>
    crudo
      .split(/[\n,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

  if (Object.keys(campos).length > 0) return { ok: false, campos }

  return {
    ok: true,
    datos: {
      first_name,
      last_name,
      birth_date,
      gender,
      room_number: room_number.length > 0 ? room_number : null,
      admission_date: admission_date.length > 0 ? admission_date : null,
      status: status.length > 0 ? status : null,
      emergency_contact_name: emergency_contact_name.length > 0 ? emergency_contact_name : null,
      emergency_contact_phone: emergency_contact_phone.length > 0 ? emergency_contact_phone : null,
      allergies: listaTexto(allergiesRaw),
      diagnoses: listaTexto(diagnosesRaw),
      notes: notes.length > 0 ? notes : null,
    },
  }
}

/* ================================================================== */
/* Server Actions de residentes                                       */
/* ================================================================== */

/** Roles con permiso de escritura sobre el censo de residentes. */
const ROLES_ESCRITURA_RESIDENTES: readonly UserRole[] = ['admin', 'nurse_jefe', 'medico']

/**
 * Crea un nuevo residente en `public.residents`.
 * Valida los datos obligatorios y respeta las políticas RLS (solo roles
 * clínicos/admin pueden insertar).
 */
export async function createResident(
  _estadoPrevio: ResidentFormState,
  formData: FormData,
): Promise<ResidentFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ESCRITURA_RESIDENTES.includes(sesion.rol)) {
    return { ...ESTADO_INICIAL_FORM, error: 'Tu rol no tiene permiso para registrar residentes.' }
  }

  const validacion = validarResidentFormData(formData)
  if (!validacion.ok) {
    return { ...ESTADO_INICIAL_FORM, error: 'Revisa los campos marcados en rojo.', campos: validacion.campos }
  }
  const d = validacion.datos

  const supabase = await createClient()
  const insercion: TablesInsert<'residents'> = {
    first_name: String(d['first_name']),
    last_name: String(d['last_name']),
    birth_date: String(d['birth_date']),
    gender: String(d['gender']) as ResidentGender,
    room_number: (d['room_number'] as string | null) ?? null,
    allergies: (d['allergies'] as string[]) ?? [],
    diagnoses: (d['diagnoses'] as string[]) ?? [],
    emergency_contact_name: (d['emergency_contact_name'] as string | null) ?? null,
    emergency_contact_phone: (d['emergency_contact_phone'] as string | null) ?? null,
    notes: (d['notes'] as string | null) ?? null,
    created_by: sesion.userId,
  }
  if (typeof d['admission_date'] === 'string') {
    insercion.admission_date = d['admission_date']
    // Por defecto consideramos "activo" a quien ingresa hoy e "ingresado" a ingresos pasados.
    insercion.status = d['admission_date'] === fechaLocalISO() ? 'activo' : 'ingresado'
  }
  if (typeof d['status'] === 'string') {
    insercion.status = d['status'] as ResidentStatus
  }

  const { data: creado, error } = await supabase
    .from('residents')
    .insert(insercion)
    .select('id')
    .single<{ id: string }>()

  if (error) {
    return { ...ESTADO_INICIAL_FORM, error: normalizarErrorBd(error.message) }
  }

  revalidatePath('/dashboard/residentes')
  revalidatePath('/dashboard')
  redirect(`/dashboard/residentes/${creado.id}`)
}

/**
 * Actualiza los datos de un residente existente. Solo actualiza los campos
 * presentes en el formulario (los vacíos opcionales se limpian, los
 * obligatorios se validan igual que en el alta).
 */
export async function updateResident(
  id: string,
  _estadoPrevio: ResidentFormState,
  formData: FormData,
): Promise<ResidentFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ESCRITURA_RESIDENTES.includes(sesion.rol)) {
    return { ...ESTADO_INICIAL_FORM, error: 'Tu rol no tiene permiso para editar residentes.' }
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return { ...ESTADO_INICIAL_FORM, error: 'Identificador de residente no válido.' }
  }

  const validacion = validarResidentFormData(formData)
  if (!validacion.ok) {
    return { ...ESTADO_INICIAL_FORM, error: 'Revisa los campos marcados en rojo.', campos: validacion.campos }
  }
  const d = validacion.datos

  const actualizacion: TablesUpdate<'residents'> = {
    first_name: String(d['first_name']),
    last_name: String(d['last_name']),
    birth_date: String(d['birth_date']),
    gender: String(d['gender']) as ResidentGender,
    room_number: (d['room_number'] as string | null) ?? null,
    allergies: (d['allergies'] as string[]) ?? [],
    diagnoses: (d['diagnoses'] as string[]) ?? [],
    emergency_contact_name: (d['emergency_contact_name'] as string | null) ?? null,
    emergency_contact_phone: (d['emergency_contact_phone'] as string | null) ?? null,
    notes: (d['notes'] as string | null) ?? null,
  }
  if (typeof d['admission_date'] === 'string') actualizacion.admission_date = d['admission_date']
  if (typeof d['status'] === 'string') actualizacion.status = d['status'] as ResidentStatus

  const supabase = await createClient()
  const { error } = await supabase.from('residents').update(actualizacion).eq('id', id)

  if (error) {
    return { ...ESTADO_INICIAL_FORM, error: normalizarErrorBd(error.message) }
  }

  revalidatePath('/dashboard/residentes')
  revalidatePath(`/dashboard/residentes/${id}`)
  redirect(`/dashboard/residentes/${id}`)
}

/* ================================================================== */
/* Server Actions de valoraciones geriátricas integrales (VGI)         */
/* ================================================================== */

/** Rangos clínicos validados ANTES de escribir en la BD (coinciden con los CHECK de la Fase 1). */
export const RANGOS_VGI = {
  barthel_index: { min: 0, max: 100, etiqueta: 'Índice de Barthel' },
  mmse_score: { min: 0, max: 30, etiqueta: 'MMSE (Mini-Mental)' },
  mna_sf_score: { min: 0, max: 14, etiqueta: 'MNA-SF (Nutrición)' },
  downton_score: { min: 0, max: 3, etiqueta: 'Downton (Caídas)' },
  yesavage_score: { min: 0, max: 15, etiqueta: 'Yesavage (Ánimo)' },
  charlson_score: { min: 0, max: 37, etiqueta: 'Charlson (Comorbilidad)' },
} as const satisfies Readonly<Record<string, { min: number; max: number; etiqueta: string }>>

type CampoVgi = keyof typeof RANGOS_VGI

/** Normaliza errores conocidos de la BD a mensajes en español. */
function normalizarErrorBd(mensaje: string): string {
  const t = mensaje.toLowerCase()
  if (t.includes('row-level security')) {
    return 'No tienes permiso para realizar esta operación (RLS).'
  }
  if (t.includes('foreign key')) {
    return 'El registro referenciado no existe o fue eliminado.'
  }
  if (t.includes('check constraint')) {
    return 'Algún valor supera los rangos permitidos por la base de datos.'
  }
  if (t.includes('duplicate key')) {
    return 'Ya existe un registro con esos mismos datos.'
  }
  return mensaje || ERROR_INTERNO
}

/** Valora una escala VGI: opcional, pero si viene debe estar dentro del rango. */
function validarEscala(campo: CampoVgi, formData: FormData, campos: Record<string, string>): number | null {
  const rango = RANGOS_VGI[campo]
  const n = leerNumero(formData, campo)
  if (n === null) return null
  if (Number.isNaN(n)) {
    campos[campo] = `${rango.etiqueta}: introduce un número.`
    return null
  }
  if (!Number.isInteger(n)) {
    campos[campo] = `${rango.etiqueta}: debe ser un número entero.`
    return null
  }
  if (n < rango.min || n > rango.max) {
    campos[campo] = `${rango.etiqueta}: el valor debe estar entre ${rango.min} y ${rango.max}.`
    return null
  }
  return n
}

/**
 * Crea una valoración geriátrica integral para un residente.
 * Valida en servidor que cada puntaje esté dentro del rango clínico permitido
 * (Barthel 0-100, MMSE 0-30, MNA-SF 0-14, Downton 0-3, Yesavage 0-15,
 * Charlson 0-37) antes de ejecutar el INSERT.
 */
export async function createVgiAssessment(
  residentId: string,
  _estadoPrevio: VgiFormState,
  formData: FormData,
): Promise<VgiFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ESCRITURA_RESIDENTES.includes(sesion.rol)) {
    return { error: 'Tu rol no tiene permiso para registrar valoraciones.', exito: false, campos: {} }
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(residentId)) {
    return { error: 'Identificador de residente no válido.', exito: false, campos: {} }
  }

  const campos: Record<string, string> = {}

  const assessment_date = leerCampo(formData, 'assessment_date')
  if (!esFechaValidaNoFutura(assessment_date)) {
    campos['assessment_date'] = 'Introduce una fecha de valoración válida (no puede ser futura).'
  }

  const barthel_index = validarEscala('barthel_index', formData, campos)
  const mmse_score = validarEscala('mmse_score', formData, campos)
  const mna_sf_score = validarEscala('mna_sf_score', formData, campos)
  const downton_score = validarEscala('downton_score', formData, campos)
  const yesavage_score = validarEscala('yesavage_score', formData, campos)
  const charlson_score = validarEscala('charlson_score', formData, campos)

  const frailtyRaw = leerCampo(formData, 'frailty_level')
  let frailty_level: FrailtyLevel | null = null
  if (frailtyRaw.length > 0) {
    if (!isFrailtyLevel(frailtyRaw)) {
      campos['frailty_level'] = 'Selecciona un nivel de fragilidad válido.'
    } else {
      frailty_level = frailtyRaw
    }
  }

  const clinical_summary = leerCampo(formData, 'clinical_summary')
  if (clinical_summary.length > 2000) {
    campos['clinical_summary'] = 'El resumen clínico no puede superar 2000 caracteres.'
  }

  const recommendationsRaw = leerCampo(formData, 'recommendations')
  const recommendations = recommendationsRaw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (recommendations.length > 20) {
    campos['recommendations'] = 'Máximo 20 recomendaciones (una por línea).'
  }

  // Al menos una puntuación o resumen: una VGI completamente vacía no tiene sentido clínico.
  const sinContenido =
    barthel_index === null &&
    mmse_score === null &&
    mna_sf_score === null &&
    downton_score === null &&
    yesavage_score === null &&
    charlson_score === null &&
    frailty_level === null &&
    clinical_summary.length === 0
  if (sinContenido) {
    campos['barthel_index'] = 'Registra al menos una puntuación o un resumen clínico.'
  }

  if (Object.keys(campos).length > 0) {
    return { error: 'Revisa los campos marcados en rojo.', exito: false, campos }
  }

  const supabase = await createClient()

  // Verificación de existencia respetando RLS (si no es visible, no se puede valorar).
  const { data: residente } = await supabase
    .from('residents')
    .select('id')
    .eq('id', residentId)
    .maybeSingle<{ id: string }>()
  if (!residente) {
    return { error: 'El residente seleccionado no existe o no tienes acceso a él.', exito: false, campos: {} }
  }

  const insercion: TablesInsert<'vgi_assessments'> = {
    resident_id: residentId,
    assessment_date,
    assessed_by: sesion.userId,
    barthel_index,
    mmse_score,
    mna_sf_score,
    downton_score,
    yesavage_score,
    charlson_score,
    frailty_level,
    clinical_summary: clinical_summary.length > 0 ? clinical_summary : null,
    recommendations,
  }

  const { error } = await supabase.from('vgi_assessments').insert(insercion)

  if (error) {
    return { error: normalizarErrorBd(error.message), exito: false, campos: {} }
  }

  revalidatePath(`/dashboard/residentes/${residentId}`)
  revalidatePath('/dashboard/residentes')
  redirect(`/dashboard/residentes/${residentId}`)
}
