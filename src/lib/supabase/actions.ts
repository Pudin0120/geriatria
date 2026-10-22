'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { fechaLocalISO } from '@/lib/utils'
import type {
  AdministrationOutcome,
  CareTaskRow,
  ExecutionOutcome,
  FrailtyLevel,
  MedicationRoute,
  MedicationRow,
  ResidentGender,
  ResidentStatus,
  TablesInsert,
  TablesUpdate,
  UserRole,
  VitalSignsRecord,
} from '@/types'
import { isExecutionOutcome, isFrailtyLevel, isResidentGender, isResidentStatus } from '@/types'

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
  if (texto.includes('password should be at least')) {
    return PASSWORD_CORTA
  }
  // Error de red o fetch fallido contra la API de Supabase.
  if (
    texto.includes('fetcherror') ||
    texto.includes('failed to fetch') ||
    texto.includes('network')
  ) {
    return 'No se pudo conectar con Supabase. Revisa tu conexión y que la URL del proyecto sea correcta.'
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

  const problemaConfig = validarConfiguracionSupabase()
  if (problemaConfig) {
    return { error: problemaConfig }
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

  const problemaConfig = validarConfiguracionSupabase()
  if (problemaConfig) {
    return { error: problemaConfig, exito: false }
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

/* ================================================================== */
/* Server Actions de la Fase 4: planes, tareas y medicaciones          */
/* ================================================================== */

/** Estado compartido por los formularios y modales de la Fase 4. */
export interface ClinicalFormState {
  error: string | null
  exito: boolean
  /** Errores por campo (id del input → mensaje en español). */
  campos: Record<string, string>
}

const ESTADO_CLINICO_INICIAL: ClinicalFormState = {
  error: null,
  exito: false,
  campos: {},
}

/** Roles autorizados para crear planes/tareas/medicaciones (coincide con RLS Fase 1). */
const ROLES_ESCRITURA_CLINICA: readonly UserRole[] = ['admin', 'nurse_jefe', 'medico']

/** Roles autorizados para ejecutar tareas y administrar medicación (RLS lo permite a todo el personal clínico). */
const ROLES_EJECUCION_CLINICA: readonly UserRole[] = ['admin', 'nurse_jefe', 'auxiliar']

/** Formato HH:mm:ss aceptado por las columnas `time` de PostgreSQL. */
const RE_HORA_COMPLETA = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/

/** Convierte un valor 'HH:mm' o 'HH:mm:ss' de formulario en hora SQL 'HH:mm:ss'. */
function normalizarHoraSql(valor: string): string | null {
  const v = valor.trim()
  if (RE_HORA_COMPLETA.test(v)) return v
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return `${v}:00`
  return null
}

/** Valida una fecha 'YYYY-MM-DD' real (sin restricción de pasado/futuro). */
function esFechaIsoValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T12:00:00`)
  return !Number.isNaN(d.getTime())
}

/** Lee todos los valores de una clave repetida de FormData como lista de texto. */
function leerLista(formData: FormData, clave: string): string[] {
  return formData
    .getAll(clave)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
}

/** Divide un textarea en líneas no vacías (objetivos, indicaciones, etc.). */
function lineasNoVacias(texto: string): string[] {
  return texto
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Verifica que el residente existe y es visible bajo RLS. */
async function residenteExiste(
  supabase: Awaited<ReturnType<typeof createClient>>,
  residentId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('residents')
    .select('id')
    .eq('id', residentId)
    .maybeSingle<{ id: string }>()
  return data !== null
}

/**
 * Crea un plan de cuidado JUNTO con sus tareas recurrentes asociadas.
 * Se apoya en una RPC transaccional (`create_care_plan_with_tasks`,
 * migración 002) para que plan y tareas se escriban en la misma
 * transacción; si la función aún no está desplegada, degrada a una
 * escritura secuencial con compensación (elimina el plan si una tarea
 * falla) para no dejar planes huérfanos.
 */
export async function createCarePlan(
  residentId: string,
  _estadoPrevio: ClinicalFormState,
  formData: FormData,
): Promise<ClinicalFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ESCRITURA_CLINICA.includes(sesion.rol)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Tu rol no tiene permiso para crear planes de cuidado.' }
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(residentId)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Identificador de residente no válido.' }
  }

  const campos: Record<string, string> = {}

  const title = leerCampo(formData, 'title')
  if (title.length < 4) campos['title'] = 'El título del plan es obligatorio (mínimo 4 caracteres).'
  if (title.length > 140) campos['title'] = 'El título no puede superar 140 caracteres.'

  const description = leerCampo(formData, 'description')
  if (description.length > 2000) campos['description'] = 'La descripción no puede superar 2000 caracteres.'

  const start_date = leerCampo(formData, 'start_date')
  if (!esFechaIsoValida(start_date)) {
    campos['start_date'] = 'Introduce una fecha de inicio válida.'
  }

  const end_date = leerCampo(formData, 'end_date')
  if (end_date.length > 0 && !esFechaIsoValida(end_date)) {
    campos['end_date'] = 'La fecha de fin no tiene un formato válido.'
  }
  if (
    esFechaIsoValida(start_date) &&
    end_date.length > 0 &&
    esFechaIsoValida(end_date) &&
    end_date < start_date
  ) {
    campos['end_date'] = 'La fecha de fin no puede ser anterior a la de inicio.'
  }

  const review_date = leerCampo(formData, 'review_date')
  if (review_date.length > 0 && !esFechaIsoValida(review_date)) {
    campos['review_date'] = 'La fecha de revisión no tiene un formato válido.'
  }

  const statusRaw = leerCampo(formData, 'status')
  const ESTADOS_PLAN = ['borrador', 'activo', 'pausado', 'cerrado'] as const
  type CarePlanStatusLocal = (typeof ESTADOS_PLAN)[number]
  let status: CarePlanStatusLocal = 'activo'
  if (statusRaw.length > 0) {
    if ((ESTADOS_PLAN as readonly string[]).includes(statusRaw)) {
      status = statusRaw as CarePlanStatusLocal
    } else {
      campos['status'] = 'Selecciona un estado válido para el plan.'
    }
  }

  const goals = lineasNoVacias(leerCampo(formData, 'goals'))
  if (goals.length > 20) campos['goals'] = 'Máximo 20 objetivos (uno por línea).'

  /* -------- Tareas recurrentes asociadas (bloques repetidos) -------- */
  const tiposTarea = leerLista(formData, 'task_type')
  const titulosTarea = leerLista(formData, 'task_title')
  const horasTarea = leerLista(formData, 'scheduled_time')
  const frecuenciasTarea = leerLista(formData, 'task_frequency')
  const prioridadesTarea = leerLista(formData, 'task_priority')
  const diasTarea = formData.getAll('task_days[]').map((v) => (typeof v === 'string' ? v : ''))

  const TASK_TYPES_VALIDOS = [
    'higiene',
    'movilizacion',
    'alimentacion',
    'signos_vitales',
    'medicacion',
    'control_esfinteres',
    'curacion',
    'acompanamiento',
    'otro',
  ] as const
  const FRECUENCIAS_VALIDAS = ['unica', 'diaria', 'alternodia', 'semanal', 'quincenal', 'mensual'] as const
  const PRIORIDADES_VALIDAS = ['baja', 'normal', 'alta', 'urgente'] as const

  interface TareaNueva {
    task_type: (typeof TASK_TYPES_VALIDOS)[number]
    title: string
    scheduled_time: string
    days_of_week: number[]
    frequency: (typeof FRECUENCIAS_VALIDAS)[number]
    priority: (typeof PRIORIDADES_VALIDAS)[number]
  }
  const tareas: TareaNueva[] = []

  // Un bloque de tarea se envía si trae título u hora (el resto son opcionales del grupo).
  for (let i = 0; i < Math.max(titulosTarea.length, horasTarea.length); i += 1) {
    const tTitle = titulosTarea[i] ?? ''
    const tHour = horasTarea[i] ?? ''
    if (tTitle.length === 0 && tHour.length === 0) continue

    const idx = i + 1
    if (tTitle.length < 3) {
      campos[`task_title_${idx}`] = `Tarea ${idx}: el título es obligatorio (mínimo 3 caracteres).`
      continue
    }
    const horaSql = normalizarHoraSql(tHour)
    if (horaSql === null) {
      campos[`scheduled_time_${idx}`] = `Tarea ${idx}: introduce una hora válida (HH:mm).`
      continue
    }
    const tTipo = tiposTarea[i] ?? 'otro'
    if (!(TASK_TYPES_VALIDOS as readonly string[]).includes(tTipo)) {
      campos[`task_type_${idx}`] = `Tarea ${idx}: selecciona un tipo válido.`
      continue
    }
    const tFreq = frecuenciasTarea[i] ?? 'diaria'
    if (!(FRECUENCIAS_VALIDAS as readonly string[]).includes(tFreq)) {
      campos[`task_frequency_${idx}`] = `Tarea ${idx}: selecciona una frecuencia válida.`
      continue
    }
    const tPrio = prioridadesTarea[i] ?? 'normal'
    if (!(PRIORIDADES_VALIDAS as readonly string[]).includes(tPrio)) {
      campos[`task_priority_${idx}`] = `Tarea ${idx}: selecciona una prioridad válida.`
      continue
    }
    // Días de la semana del bloque i (checkboxes name="task_days[]" value="${i}:${día}").
    const diasBloque: number[] = []
    for (const d of diasTarea) {
      const match = /^(\d+):([1-7])$/.exec(d)
      if (match && Number(match[1]) === i) {
        const dia = Number(match[2])
        if (!diasBloque.includes(dia)) diasBloque.push(dia)
      }
    }

    tareas.push({
      task_type: tTipo as (typeof TASK_TYPES_VALIDOS)[number],
      title: tTitle,
      scheduled_time: horaSql,
      days_of_week: diasBloque.sort((a, b) => a - b),
      frequency: tFreq as (typeof FRECUENCIAS_VALIDAS)[number],
      priority: tPrio as (typeof PRIORIDADES_VALIDAS)[number],
    })
  }
  if (tareas.length === 0 && Object.keys(campos).length === 0) {
    campos['task_title_1'] = 'Define al menos una tarea recurrente para el plan.'
  }
  if (tareas.length > 15) {
    campos['task_title_1'] = 'Un plan no puede incluir más de 15 tareas iniciales.'
  }

  if (Object.keys(campos).length > 0) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Revisa los campos marcados en rojo.', campos }
  }

  const supabase = await createClient()
  if (!(await residenteExiste(supabase, residentId))) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'El residente seleccionado no existe o no tienes acceso a él.' }
  }

  const planInsert: TablesInsert<'care_plans'> = {
    resident_id: residentId,
    title,
    description: description.length > 0 ? description : null,
    goals,
    start_date,
    end_date: end_date.length > 0 ? end_date : null,
    review_date: review_date.length > 0 ? review_date : null,
    status,
    created_by: sesion.userId,
  }

  // 1) Vía preferida: RPC transaccional (plan + tareas en una sola BD transacción).
  const { data: rpcResultado, error: rpcError } = await supabase.rpc('create_care_plan_with_tasks', {
    p_resident_id: residentId,
    p_title: title,
    p_description: description.length > 0 ? description : null,
    p_goals: goals,
    p_start_date: start_date,
    p_end_date: end_date.length > 0 ? end_date : null,
    p_review_date: review_date.length > 0 ? review_date : null,
    p_status: status,
    p_tasks: tareas.map((t) => ({ ...t })),
  })

  if (!rpcError && rpcResultado?.plan_id) {
    revalidatePath(`/dashboard/residentes/${residentId}/planes`)
    revalidatePath(`/dashboard/residentes/${residentId}`)
    revalidatePath('/dashboard/tareas')
    revalidatePath('/dashboard')
    redirect(`/dashboard/residentes/${residentId}/planes`)
  }

  // 2) Fallback: la RPC todavía no está desplegada → escritura secuencial compensada.
  const { data: planCreado, error: errorPlan } = await supabase
    .from('care_plans')
    .insert(planInsert)
    .select('id')
    .single<{ id: string }>()

  if (errorPlan || !planCreado) {
    return { ...ESTADO_CLINICO_INICIAL, error: normalizarErrorBd(errorPlan?.message ?? ERROR_INTERNO) }
  }

  for (const t of tareas) {
    const insercionTarea: TablesInsert<'care_tasks'> = {
      resident_id: residentId,
      care_plan_id: planCreado.id,
      task_type: t.task_type,
      title: t.title,
      scheduled_time: t.scheduled_time,
      days_of_week: t.days_of_week.length > 0 ? t.days_of_week : [1, 2, 3, 4, 5, 6, 7],
      frequency: t.frequency,
      priority: t.priority,
      status: 'programada',
      effective_from: start_date,
      effective_until: end_date.length > 0 ? end_date : null,
      created_by: sesion.userId,
    }
    const { error: errorTarea } = await supabase.from('care_tasks').insert(insercionTarea)
    if (errorTarea) {
      // Compensación: no dejamos un plan parcialmente creado.
      await supabase.from('care_plans').delete().eq('id', planCreado.id)
      return { ...ESTADO_CLINICO_INICIAL, error: normalizarErrorBd(errorTarea.message) }
    }
  }

  revalidatePath(`/dashboard/residentes/${residentId}/planes`)
  revalidatePath(`/dashboard/residentes/${residentId}`)
  revalidatePath('/dashboard/tareas')
  revalidatePath('/dashboard')
  redirect(`/dashboard/residentes/${residentId}/planes`)
}

/**
 * Registra una nueva prescripción de medicación para un residente.
 * Valida dosis, vía, horarios (time[]) y coherencia de fechas antes
 * de escribir en `public.medications`.
 */
export async function createMedication(
  residentId: string,
  _estadoPrevio: ClinicalFormState,
  formData: FormData,
): Promise<ClinicalFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ESCRITURA_CLINICA.includes(sesion.rol)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Tu rol no tiene permiso para prescribir medicación.' }
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(residentId)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Identificador de residente no válido.' }
  }

  const campos: Record<string, string> = {}

  const name = leerCampo(formData, 'name')
  if (name.length < 3) campos['name'] = 'El nombre comercial es obligatorio (mínimo 3 caracteres).'
  if (name.length > 140) campos['name'] = 'El nombre no puede superar 140 caracteres.'

  const generic_name = leerCampo(formData, 'generic_name')
  if (generic_name.length > 140) campos['generic_name'] = 'El nombre genérico no puede superar 140 caracteres.'

  const presentation = leerCampo(formData, 'presentation')
  if (presentation.length > 100) campos['presentation'] = 'La presentación no puede superar 100 caracteres.'

  const dosage = leerCampo(formData, 'dosage')
  if (dosage.length === 0) campos['dosage'] = 'Indica la dosis por toma (p. ej. «500 mg», «1 comprimido»). No se admite «0».'
  if (dosage.length > 80) campos['dosage'] = 'La dosis no puede superar 80 caracteres.'
  if (dosage.length > 0 && /^0+(?:[.,]0+)?$/.test(dosage)) {
    campos['dosage'] = 'La dosis no puede ser cero.'
  }

  const routeRaw = leerCampo(formData, 'route')
  const VIAS = [
    'oral', 'topica', 'intravenosa', 'intramuscular', 'subcutanea',
    'rectal', 'inhalatoria', 'transdermica', 'oftalmica', 'otica',
  ] as const
  let route: (typeof VIAS)[number] = 'oral'
  if (routeRaw.length > 0) {
    if ((VIAS as readonly string[]).includes(routeRaw)) {
      route = routeRaw as (typeof VIAS)[number]
    } else {
      campos['route'] = 'Selecciona una vía de administración válida.'
    }
  }

  const frequencyRaw = leerCampo(formData, 'frequency')
  const FRECUENCIAS_MED = ['unica', 'diaria', 'cada_8h', 'cada_12h', 'cada_24h', 'nocturna', 'bajo_demanda'] as const
  let frequency: (typeof FRECUENCIAS_MED)[number] = 'unica'
  if (frequencyRaw.length > 0) {
    if ((FRECUENCIAS_MED as readonly string[]).includes(frequencyRaw)) {
      frequency = frequencyRaw as (typeof FRECUENCIAS_MED)[number]
    } else {
      campos['frequency'] = 'Selecciona una frecuencia posológica válida.'
    }
  }

  // Horarios de administración (time[]): acepta 'HH:mm' o 'HH:mm:ss', sin duplicados.
  const scheduleTimes: string[] = []
  for (const crudo of leerLista(formData, 'schedule_times')) {
    const horaSql = normalizarHoraSql(crudo)
    if (horaSql === null) {
      campos['schedule_times'] = 'Uno de los horarios no tiene un formato válido (HH:mm).'
      break
    }
    if (scheduleTimes.includes(horaSql)) {
      campos['schedule_times'] = 'Hay horarios duplicados; elimina los repetidos.'
      break
    }
    scheduleTimes.push(horaSql)
  }
  if (Object.keys(campos).length === 0 && frequency !== 'bajo_demanda' && scheduleTimes.length === 0) {
    campos['schedule_times'] = 'Añade al menos un horario de administración (salvo medicación a demanda).'
  }
  if (scheduleTimes.length > 8) {
    campos['schedule_times'] = 'Máximo 8 horarios diarios por medicamento.'
  }

  const start_date = leerCampo(formData, 'start_date')
  if (!esFechaIsoValida(start_date)) {
    campos['start_date'] = 'Introduce una fecha de inicio válida.'
  }

  const end_date = leerCampo(formData, 'end_date')
  if (end_date.length > 0 && !esFechaIsoValida(end_date)) {
    campos['end_date'] = 'La fecha de fin no tiene un formato válido.'
  }
  if (
    esFechaIsoValida(start_date) &&
    end_date.length > 0 &&
    esFechaIsoValida(end_date) &&
    end_date < start_date
  ) {
    campos['end_date'] = 'La fecha de fin no puede ser anterior a la de inicio.'
  }

  const indications = leerCampo(formData, 'indications')
  if (indications.length > 1000) campos['indications'] = 'Las indicaciones no pueden superar 1000 caracteres.'

  const prescribed_by = leerCampo(formData, 'prescribed_by')
  if (prescribed_by.length > 140) campos['prescribed_by'] = 'El prescritor no puede superar 140 caracteres.'

  if (Object.keys(campos).length > 0) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Revisa los campos marcados en rojo.', campos }
  }

  const supabase = await createClient()
  if (!(await residenteExiste(supabase, residentId))) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'El residente seleccionado no existe o no tienes acceso a él.' }
  }

  const insercion: TablesInsert<'medications'> = {
    resident_id: residentId,
    name,
    generic_name: generic_name.length > 0 ? generic_name : null,
    presentation: presentation.length > 0 ? presentation : null,
    dosage,
    route,
    schedule_times: scheduleTimes,
    frequency,
    start_date,
    end_date: end_date.length > 0 ? end_date : null,
    prescribed_by: prescribed_by.length > 0 ? prescribed_by : sesion.perfil?.full_name ?? null,
    indications: indications.length > 0 ? indications : null,
    active: true,
    created_by: sesion.userId,
  }

  const { error } = await supabase.from('medications').insert(insercion)
  if (error) {
    return { ...ESTADO_CLINICO_INICIAL, error: normalizarErrorBd(error.message) }
  }

  revalidatePath(`/dashboard/residentes/${residentId}/medicaciones`)
  revalidatePath(`/dashboard/residentes/${residentId}`)
  revalidatePath('/dashboard/medicaciones/administrar')
  revalidatePath('/dashboard')
  redirect(`/dashboard/residentes/${residentId}/medicaciones`)
}

/**
 * Registra la ejecución diaria de una tarea en `task_executions` (bitácora
 * clínica) y actualiza el estado de la tarea. Cualquier rol autenticado
 * registra la ejecución a su nombre (policy `executions_insert_executor`).
 */
export async function executeTask(
  taskId: string,
  outcome: ExecutionOutcome,
  notes: string,
  vitalSigns: VitalSignsRecord,
): Promise<ClinicalFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!/^[0-9a-fA-F-]{36}$/.test(taskId)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Identificador de tarea no válido.' }
  }
  if (!isExecutionOutcome(outcome)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Resultado no válido (debe ser completada, omitida o cancelada).' }
  }
  if (notes.length > 1000) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Las notas no pueden superar 1000 caracteres.' }
  }

  const supabase = await createClient()

  const { data: tarea } = await supabase
    .from('care_tasks')
    .select('id, resident_id, status')
    .eq('id', taskId)
    .maybeSingle<Pick<CareTaskRow, 'id' | 'resident_id' | 'status'>>()
  if (!tarea) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'La tarea no existe o no tienes acceso a ella.' }
  }
  if (tarea.status === 'cancelada') {
    return { ...ESTADO_CLINICO_INICIAL, error: 'No se puede registrar la ejecución de una tarea cancelada.' }
  }

  const insercion: TablesInsert<'task_executions'> = {
    task_id: taskId,
    executed_by: sesion.userId,
    executed_at: new Date().toISOString(),
    outcome,
    notes: notes.length > 0 ? notes : null,
    vital_signs: vitalSigns,
  }

  const { error } = await supabase.from('task_executions').insert(insercion)
  if (error) {
    return { ...ESTADO_CLINICO_INICIAL, error: normalizarErrorBd(error.message) }
  }

  // Sincroniza el estado visible de la tarea con el último resultado registrado.
  const { error: errorEstado } = await supabase
    .from('care_tasks')
    .update({ status: outcome })
    .eq('id', taskId)
  // Si RLS impide actualizar el estado, la bitácora queda igualmente registrada.
  void errorEstado

  revalidatePath('/dashboard/tareas')
  revalidatePath(`/dashboard/residentes/${tarea.resident_id}/planes`)
  revalidatePath('/dashboard')
  return { ...ESTADO_CLINICO_INICIAL, exito: true }
}

/** Wrapper para `<form action>` / `useActionState`: lee el formulario y delega en `executeTask`. */
export async function executeTaskFromForm(
  taskId: string,
  _estadoPrevio: ClinicalFormState,
  formData: FormData,
): Promise<ClinicalFormState> {
  const outcomeRaw = leerCampo(formData, 'outcome')
  if (!isExecutionOutcome(outcomeRaw)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Selecciona un resultado válido para la tarea.' }
  }

  const notes = leerCampo(formData, 'notes')
  const vitalSigns: VitalSignsRecord = {}
  const tension = leerCampo(formData, 'ta')
  if (/^\d{2,3}\/\d{2,3}$/.test(tension)) vitalSigns.tension_arterial = tension
  const fc = leerNumero(formData, 'fc')
  if (fc !== null && !Number.isNaN(fc) && fc >= 20 && fc <= 250) vitalSigns.frecuencia_cardiaca = Math.round(fc)
  const temperatura = leerNumero(formData, 'temperatura')
  if (temperatura !== null && !Number.isNaN(temperatura) && temperatura >= 25 && temperatura <= 45) {
    vitalSigns.temperatura = temperatura
  }
  const satO = leerNumero(formData, 'sat_o2')
  if (satO !== null && !Number.isNaN(satO) && satO >= 50 && satO <= 100) vitalSigns.saturacion_oxigeno = Math.round(satO)
  const glucemia = leerNumero(formData, 'glucemia')
  if (glucemia !== null && !Number.isNaN(glucemia) && glucemia >= 20 && glucemia <= 800) {
    vitalSigns.glucemia = Math.round(glucemia)
  }

  return executeTask(taskId, outcomeRaw, notes, vitalSigns)
}

/**
 * Registra la administración REAL de una medicación en
 * `medication_administrations` (DURO): dosis dada, vía usada, resultado,
 * reacción adversa y hora programada de referencia.
 */
export async function administerMedication(
  medicationId: string,
  dose: string,
  route: MedicationRoute,
  outcome: AdministrationOutcome,
  options: { adverseReaction?: boolean; notes?: string; scheduledAt?: string | null } = {},
): Promise<ClinicalFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_EJECUCION_CLINICA.includes(sesion.rol)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Tu rol no tiene permiso para registrar administraciones de medicación.' }
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(medicationId)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Identificador de medicación no válido.' }
  }

  const ADMIN_OUTCOMES: readonly AdministrationOutcome[] = ['administrada', 'rechazada', 'omitida', 'parcial']
  if (!ADMIN_OUTCOMES.includes(outcome)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Resultado de administración no válido.' }
  }
  const VIAS: readonly MedicationRoute[] = [
    'oral', 'topica', 'intravenosa', 'intramuscular', 'subcutanea',
    'rectal', 'inhalatoria', 'transdermica', 'oftalmica', 'otica',
  ]
  if (!VIAS.includes(route)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Vía de administración no válida.' }
  }

  const dosis = dose.trim()
  if (dosis.length === 0 || dosis.length > 80) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Indica la dosis administrada (entre 1 y 80 caracteres).' }
  }
  const notas = (options.notes ?? '').trim()
  if (notas.length > 1000) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Las notas no pueden superar 1000 caracteres.' }
  }

  const supabase = await createClient()

  const { data: medicamento } = await supabase
    .from('medications')
    .select('id, resident_id, active')
    .eq('id', medicationId)
    .maybeSingle<Pick<MedicationRow, 'id' | 'resident_id' | 'active'>>()
  if (!medicamento) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'La medicación no existe o no tienes acceso a ella.' }
  }
  if (!medicamento.active) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'No se puede administrar un tratamiento suspendido.' }
  }

  let scheduledAt: string | null = null
  if (typeof options.scheduledAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(options.scheduledAt)) {
    const d = new Date(`${options.scheduledAt}:00`)
    if (!Number.isNaN(d.getTime())) scheduledAt = d.toISOString()
  }

  const insercion: TablesInsert<'medication_administrations'> = {
    medication_id: medicationId,
    administered_by: sesion.userId,
    administered_at: new Date().toISOString(),
    scheduled_at: scheduledAt,
    dose_given: dosis,
    route_used: route,
    outcome,
    adverse_reaction: options.adverseReaction === true && outcome === 'administrada',
    notes: notas.length > 0 ? notas : null,
  }

  const { error } = await supabase.from('medication_administrations').insert(insercion)
  if (error) {
    return { ...ESTADO_CLINICO_INICIAL, error: normalizarErrorBd(error.message) }
  }

  revalidatePath('/dashboard/medicaciones/administrar')
  revalidatePath(`/dashboard/residentes/${medicamento.resident_id}/medicaciones`)
  revalidatePath('/dashboard')
  return { ...ESTADO_CLINICO_INICIAL, exito: true }
}

/** Wrapper para `<form action>` / `useActionState`: lee el formulario y delega en `administerMedication`. */
export async function administerMedicationFromForm(
  medicationId: string,
  _estadoPrevio: ClinicalFormState,
  formData: FormData,
): Promise<ClinicalFormState> {
  const dose = leerCampo(formData, 'dose_given')
  const routeRaw = leerCampo(formData, 'route_used')
  const outcomeRaw = leerCampo(formData, 'outcome')
  const scheduledAt = leerCampo(formData, 'scheduled_at')

  const ADMIN_OUTCOMES: readonly string[] = ['administrada', 'rechazada', 'omitida', 'parcial']
  if (!ADMIN_OUTCOMES.includes(outcomeRaw)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Selecciona un resultado de administración válido.' }
  }
  const VIAS: readonly string[] = [
    'oral', 'topica', 'intravenosa', 'intramuscular', 'subcutanea',
    'rectal', 'inhalatoria', 'transdermica', 'oftalmica', 'otica',
  ]
  if (!VIAS.includes(routeRaw)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Selecciona una vía de administración válida.' }
  }

  return administerMedication(
    medicationId,
    dose,
    routeRaw as MedicationRoute,
    outcomeRaw as AdministrationOutcome,
    {
      adverseReaction: formData.get('adverse_reaction') === 'on',
      notes: leerCampo(formData, 'notes'),
      scheduledAt: scheduledAt.length > 0 ? scheduledAt : null,
    },
  )
}

/** Suspende (desactiva) o reactiva una medicación prescrito→activo. Solo roles de prescripción. */
export async function toggleMedicationActive(
  medicationId: string,
): Promise<ClinicalFormState> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ESCRITURA_CLINICA.includes(sesion.rol)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Tu rol no tiene permiso para suspender tratamientos.' }
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(medicationId)) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'Identificador de medicación no válido.' }
  }

  const supabase = await createClient()
  const { data: medicamento } = await supabase
    .from('medications')
    .select('id, resident_id, active')
    .eq('id', medicationId)
    .maybeSingle<Pick<MedicationRow, 'id' | 'resident_id' | 'active'>>()
  if (!medicamento) {
    return { ...ESTADO_CLINICO_INICIAL, error: 'La medicación no existe o no tienes acceso a ella.' }
  }

  const { error } = await supabase
    .from('medications')
    .update({ active: !medicamento.active })
    .eq('id', medicationId)
  if (error) {
    return { ...ESTADO_CLINICO_INICIAL, error: normalizarErrorBd(error.message) }
  }

  revalidatePath(`/dashboard/residentes/${medicamento.resident_id}/medicaciones`)
  revalidatePath('/dashboard/medicaciones/administrar')
  return { ...ESTADO_CLINICO_INICIAL, exito: true }
}
