'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { diagnosticarConfigSupabase } from '@/lib/supabase/env'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import {
  fechaLocalISO,
  nombreResidente,
  tareaProgramadaParaElDia,
  timestampDeFechaYHora,
} from '@/lib/utils'
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
// Los tipos de estado y los rangos VGI viven en módulos propios porque un
// archivo 'use server' solo puede exportar funciones async (requisito de
// Next.js; incumplirlo rompe la compilación del proyecto). Se re-exportan
// como tipos para no romper los imports existentes.
import type {
  ClinicalFormState,
  LoginState,
  ResidentFormState,
  VgiFormState,
} from '@/lib/estados-form'
import { RANGOS_VGI, type CampoVgi } from '@/lib/vgi-rangos'

export type {
  ClinicalFormState,
  LoginState,
  ResidentFormState,
  VgiFormState,
} from '@/lib/estados-form'

/* ================================================================== */
/* Auditoría · bitácora `access_logs`                                  */
/* ================================================================== */

/**
 * Escribe un registro en `public.access_logs` tras una mutación sensible.
 *
 * Diseño:
 *  - Es "fire-and-forget": NUNCA lanza excepciones ni bloquea la acción de
 *    usuario; si la inserción falla solo se registra en el log del servidor.
 *  - Nunca recibe datos clínicos libres: solo identificadores técnicos y
 *    contadores (ver `AUDITORIA_ACCIONES`).
 *  - La RLS (`access_logs_insert_any_authenticated`) permite insertar como
 *    máximo la propia identidad; el actor es siempre `auth.uid()` real.
 */
async function registrarAuditoria(entrada: {
  accion: string
  entidadTipo?: string
  entidadId?: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('access_logs').insert({
      user_id: user.id,
      action: entrada.accion,
      entity_type: entrada.entidadTipo ?? null,
      entity_id: entrada.entidadId ?? null,
      metadata: { source: 'server_action' },
    })
  } catch {
    // La auditoría no debe romper nunca el flujo clínico.
    console.error('[GeriCare] No se pudo escribir en access_logs:', entrada.accion)
  }
}

/**
 * Acciones auditadas del sistema (constantes estables, sin PII).
 * Nota de arquitectura: se mantiene como constante LOCAL porque un módulo
 * `'use server'` solo puede exportar funciones async; exportar objetos o
 * constantes rompe la compilación de Next.js.
 */
const AUDITORIA_ACCIONES = {
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  RESIDENT_CREATE: 'resident.create',
  RESIDENT_UPDATE: 'resident.update',
  VGI_CREATE: 'vgi.create',
  CARE_PLAN_CREATE: 'care_plan.create',
  MEDICATION_CREATE: 'medication.create',
  MEDICATION_TOGGLE: 'medication.toggle_active',
  TASK_EXECUTE: 'task.execute',
  MEDICATION_ADMINISTER: 'medication.administer',
} as const

/* ================================================================== */
/* Tipos de estado de formulario (sin `any`)                           */
/* ================================================================== */

const EMAIL_INVALIDO = 'Introduce un correo electrónico válido.'
const PASSWORD_CORTA = 'La contraseña debe tener al menos 8 caracteres.'
const CREDENCIALES_INCORRECTAS =
  'Credenciales incorrectas. Verifica tu correo y contraseña.'
const ERROR_INTERNO =
  'Ocurrió un problema al comunicarse con el servidor. Inténtalo de nuevo.'

/**
 * Diagnóstico temprano: si faltan o están mal formadas las variables de
 * entorno de Supabase, las Server Actions fallarían con un mensaje genérico
 * («invalid key»). Delegamos en el validador central (`env.ts`) que detecta
 * undefined, URL inválida, secret key expuesta, JWT legacy service_role, etc.
 * Nunca devuelve valores crudos de las claves (no hay fuga al cliente).
 */
function validarConfiguracionSupabase(): string | null {
  const diagnostico = diagnosticarConfigSupabase()
  if (!diagnostico) return null
  return (
    'Falta la configuración válida de Supabase en este entorno. ' +
    'Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key) ' +
    'en .env.local (raíz del proyecto) y reinicia el servidor / vuelve a desplegar. ' +
    `Diagnóstico técnico: ${diagnostico}`
  )
}

/**
 * Valida un destino de redirección post-login: SOLO rutas relativas internas
 * seguras. Rechaza protocolos absolutos (`https://evil.tld`), protocol-relative
 * (`//evil.tld` → open redirect) y backslashes (`\\evil.tld`).
 */
function esRutaRelativaSegura(destino: string): boolean {
  return (
    destino.startsWith('/') &&
    !destino.startsWith('//') &&
    !destino.startsWith('/\\') &&
    !/^\/[a-z][a-z0-9+.-]*:/i.test(destino)
  )
}

/** Normaliza errores de Supabase Auth a mensajes comprensibles en español. */
function mensajeErrorAuth(descripcion: string): string {
  const texto = descripcion.toLowerCase()
  if (texto.includes('invalid login credentials')) return CREDENCIALES_INCORRECTAS
  if (texto.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
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
 * En caso de éxito redirige al destino solicitado (`redirectTo` del form,
 * propagado desde `?redirect=` por el proxy) o a `/dashboard` por defecto;
 * en caso contrario devuelve el error.
 */
export async function login(
  _estadoPrevio: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = leerCampo(formData, 'email')
  const password = leerCampo(formData, 'password')
  // Destino opcional inyectado por LoginForm desde la query `?redirect=`.
  const redirectTo = leerCampo(formData, 'redirectTo')

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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.LOGIN, entidadTipo: 'auth' })
  revalidatePath('/', 'layout')
  // Anti open-redirect: solo se acepta una ruta relativa interna segura.
  redirect(esRutaRelativaSegura(redirectTo) ? redirectTo : '/dashboard')
}

/** Cierra la sesión actual y regresa a la pantalla de inicio de sesión. */
export async function logout(): Promise<void> {
  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.LOGOUT, entidadTipo: 'auth' })
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/* ================================================================== */
/* Tipos de estado para formularios de residentes y VGI               */
/* (declarados en @/lib/estados-form, re-exportados arriba)           */
/* ================================================================== */

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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.RESIDENT_CREATE, entidadTipo: 'residents', entidadId: creado.id })
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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.RESIDENT_UPDATE, entidadTipo: 'residents', entidadId: id })
  revalidatePath('/dashboard/residentes')
  revalidatePath(`/dashboard/residentes/${id}`)
  redirect(`/dashboard/residentes/${id}`)
}

/* ================================================================== */
/* Server Actions de valoraciones geriátricas integrales (VGI)         */
/* RANGOS_VGI vive en @/lib/vgi-rangos (módulo 'use server' solo      */
/* puede exportar funciones async).                                   */
/* ================================================================== */

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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.VGI_CREATE, entidadTipo: 'vgi_assessments', entidadId: residentId })
  revalidatePath(`/dashboard/residentes/${residentId}`)
  revalidatePath('/dashboard/residentes')
  redirect(`/dashboard/residentes/${residentId}`)
}

/* ================================================================== */
/* Server Actions de la Fase 4: planes, tareas y medicaciones          */
/* ClinicalFormState vive en @/lib/estados-form (re-exportado arriba). */
/* ================================================================== */

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
    void registrarAuditoria({ accion: AUDITORIA_ACCIONES.CARE_PLAN_CREATE, entidadTipo: 'care_plans', entidadId: rpcResultado.plan_id })
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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.CARE_PLAN_CREATE, entidadTipo: 'care_plans', entidadId: planCreado.id })

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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.MEDICATION_CREATE, entidadTipo: 'medications', entidadId: residentId })
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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.TASK_EXECUTE, entidadTipo: 'task_executions', entidadId: taskId })
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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.MEDICATION_ADMINISTER, entidadTipo: 'medication_administrations', entidadId: medicamento.id })
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

  void registrarAuditoria({ accion: AUDITORIA_ACCIONES.MEDICATION_TOGGLE, entidadTipo: 'medications', entidadId: medicationId })
  revalidatePath(`/dashboard/residentes/${medicamento.resident_id}/medicaciones`)
  revalidatePath('/dashboard/medicaciones/administrar')
  return { ...ESTADO_CLINICO_INICIAL, exito: true }
}

/* ================================================================== */
/* Fase 5 · Acciones de reportes, estadísticas y auditoría             */
/* ================================================================== */

import type {
  AlertSummary,
  AuditFilters,
  AuditPage,
  ClinicalAlert,
  DashboardMetrics,
  DistribucionEstado,
  ResidenteRiesgo,
  ResidentStats,
} from '@/lib/reportes'
import { detectarAnomaliasSignos } from '@/lib/reportes'
import type {
  AccessLogRow,
  MedicationAdministrationRow,
  ProfileRow,
  ResidentRow,
  TaskExecutionRow,
  VgiAssessmentRow,
} from '@/types'
import { FRAILTY_LEVEL_LABELS, RESIDENT_STATUS_LABELS } from '@/types'

/** Ventana por defecto para el cálculo de adherencia (días). */
const DIAS_ADHERENCIA = 30

/** Diferencia en días naturales entre dos fechas ISO (b - a). */
function diasEntre(isoA: string, isoB: string): number {
  const a = new Date(`${isoA.slice(0, 10)}T00:00:00`)
  const b = new Date(`${isoB.slice(0, 10)}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Porcentaje redondeado a un decimal; null si el total es cero. */
function pct(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

/** UUID canónico (evita valores maliciosos en filtros de PostgREST). */
function esUuidFase5(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

/**
 * KPIs globales del centro: residentes activos, ocupación por habitación,
 * tareas completadas vs pendientes del día y medicaciones administradas hoy.
 *
 * Rendimiento: proyecciones mínimas, conteos agregados y lotes `in(...)`
 * (sin N+1). Se apoya en los índices `idx_residents_status`,
 * `idx_care_tasks_agenda`, `idx_task_executions_executed` e
 * `idx_med_admin_executed` (migración 003_fase5_report_indexes.sql).
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const supabase = await createClient()
  const hoy = fechaLocalISO()
  const inicioDia = `${hoy}T00:00:00`
  const finDia = timestampDeFechaYHora(hoy, '23:59:59')

  /* 1) Residentes visibles (proyección mínima; alimenta ocupación y distribuciones). */
  const { data: residentes, error: errResidentes } = await supabase
    .from('residents')
    .select('id, status, room_number')
    .returns<Pick<ResidentRow, 'id' | 'status' | 'room_number'>[]>()
  if (errResidentes) throw new Error(normalizarErrorBd(errResidentes.message))
  const listaResidentes = residentes ?? []

  const residentesActivos = listaResidentes.filter((r) => r.status === 'activo').length
  const ocupacionPct = pct(residentesActivos, listaResidentes.length)

  const mapaHabitaciones = new Map<string, number>()
  for (const r of listaResidentes) {
    if (r.status !== 'activo' || !r.room_number) continue
    mapaHabitaciones.set(r.room_number, (mapaHabitaciones.get(r.room_number) ?? 0) + 1)
  }
  const distribucionHabitaciones = [...mapaHabitaciones.entries()]
    .map(([habitacion, count]) => ({ habitacion, residentes: count }))
    .sort((a, b) => b.residentes - a.residentes || a.habitacion.localeCompare(b.habitacion, 'es'))
    .slice(0, 12)

  const mapaEstados = new Map<string, number>()
  for (const r of listaResidentes) {
    mapaEstados.set(r.status, (mapaEstados.get(r.status) ?? 0) + 1)
  }
  const distribucionEstados: DistribucionEstado[] = (
    Object.keys(RESIDENT_STATUS_LABELS) as (keyof typeof RESIDENT_STATUS_LABELS)[]
  )
    .filter((estado) => mapaEstados.has(estado))
    .map((estado) => ({
      estado,
      etiqueta: RESIDENT_STATUS_LABELS[estado],
      cantidad: mapaEstados.get(estado) ?? 0,
    }))

  /* 2) Última fragilidad registrada por residente (lote único ordenado por fecha desc). */
  const { data: vgisRecientes, error: errVgi } = await supabase
    .from('vgi_assessments')
    .select('resident_id, frailty_level, assessment_date')
    .not('frailty_level', 'is', null)
    .order('assessment_date', { ascending: false })
    .limit(3000)
    .returns<Pick<VgiAssessmentRow, 'resident_id' | 'frailty_level' | 'assessment_date'>[]>()
  if (errVgi) throw new Error(normalizarErrorBd(errVgi.message))
  const ultimaFragilidad = new Map<string, FrailtyLevel>()
  for (const v of vgisRecientes ?? []) {
    if (v.frailty_level && !ultimaFragilidad.has(v.resident_id)) {
      ultimaFragilidad.set(v.resident_id, v.frailty_level)
    }
  }
  const mapaFragilidad = new Map<FrailtyLevel, number>()
  for (const nivel of ultimaFragilidad.values()) {
    mapaFragilidad.set(nivel, (mapaFragilidad.get(nivel) ?? 0) + 1)
  }
  const distribucionFragilidad = (
    Object.keys(FRAILTY_LEVEL_LABELS) as (keyof typeof FRAILTY_LEVEL_LABELS)[]
  )
    .filter((nivel) => mapaFragilidad.has(nivel))
    .map((nivel) => ({ nivel, etiqueta: FRAILTY_LEVEL_LABELS[nivel], cantidad: mapaFragilidad.get(nivel) ?? 0 }))

  /* 3) Tareas pendientes hoy (days_of_week se filtra en memoria). */
  const { data: tareasHoy, error: errTareas } = await supabase
    .from('care_tasks')
    .select('*')
    .in('status', ['programada', 'en_curso'])
    .lte('effective_from', hoy)
    .or(`effective_until.is.null,effective_until.gte.${hoy}`)
    .returns<CareTaskRow[]>()
  if (errTareas) throw new Error(normalizarErrorBd(errTareas.message))
  const tareasProgramadasHoy = (tareasHoy ?? []).filter((t) => tareaProgramadaParaElDia(t, hoy)).length

  /* 4) Bitácora de ejecuciones de hoy. */
  const { data: ejecucionesHoy, error: errEjec } = await supabase
    .from('task_executions')
    .select('outcome')
    .gte('executed_at', inicioDia)
    .lte('executed_at', finDia)
    .returns<Pick<TaskExecutionRow, 'outcome'>[]>()
  if (errEjec) throw new Error(normalizarErrorBd(errEjec.message))
  const listaEjecuciones = ejecucionesHoy ?? []
  const completadasHoy = listaEjecuciones.filter((e) => e.outcome === 'completada').length
  const noRealizadasHoy = listaEjecuciones.filter((e) => e.outcome !== 'completada').length

  /* 5) Medicaciones activas vigentes → tomas teóricas de hoy. */
  const { data: medicaciones, error: errMeds } = await supabase
    .from('medications')
    .select('schedule_times')
    .eq('active', true)
    .lte('start_date', hoy)
    .or(`end_date.is.null,end_date.gte.${hoy}`)
    .returns<Pick<MedicationRow, 'schedule_times'>[]>()
  if (errMeds) throw new Error(normalizarErrorBd(errMeds.message))
  const tomasMedicacionHoy = (medicaciones ?? []).reduce(
    (acc, m) => acc + m.schedule_times.filter((t) => /^\d{2}:\d{2}(:\d{2})?$/.test(t)).length,
    0,
  )

  /* 6) DURO registrado hoy. */
  const { data: adminsHoy, error: errAdmin } = await supabase
    .from('medication_administrations')
    .select('outcome, adverse_reaction')
    .gte('administered_at', inicioDia)
    .lte('administered_at', finDia)
    .returns<Pick<MedicationAdministrationRow, 'outcome' | 'adverse_reaction'>[]>()
  if (errAdmin) throw new Error(normalizarErrorBd(errAdmin.message))
  const listaAdmins = adminsHoy ?? []
  const administradasHoy = listaAdmins.filter((a) => a.outcome === 'administrada' || a.outcome === 'parcial').length
  const reaccionesAdversasHoy = listaAdmins.filter((a) => a.adverse_reaction).length

  return {
    fecha: hoy,
    totalResidentes: listaResidentes.length,
    residentesActivos,
    ocupacionPct,
    distribucionHabitaciones,
    distribucionEstados,
    distribucionFragilidad,
    tareasProgramadasHoy,
    tareasCompletadasHoy: completadasHoy,
    tareasNoRealizadasHoy: noRealizadasHoy,
    adherenciaTareasHoyPct: pct(completadasHoy, completadasHoy + noRealizadasHoy),
    tomasMedicacionHoy,
    administradasHoy,
    reaccionesAdversasHoy,
  }
}

/**
 * Estadísticas clínicas individuales: historial VGI con deltas, adherencia
 * a tareas en los últimos 30 días y eventos adversos registrados en el DURO.
 */
export async function getResidentStats(residentId: string): Promise<ResidentStats> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!esUuidFase5(residentId)) throw new Error('Identificador de residente no válido.')

  const supabase = await createClient()
  const hoy = fechaLocalISO()
  const desde = new Date()
  desde.setDate(desde.getDate() - DIAS_ADHERENCIA)
  const desdeIso = fechaLocalISO(desde)

  /* 1) Historial VGI (ascendente para calcular deltas consecutivos). */
  const { data: vgis, error: errVgi } = await supabase
    .from('vgi_assessments')
    .select('assessment_date, barthel_index, mmse_score, frailty_level')
    .eq('resident_id', residentId)
    .order('assessment_date', { ascending: true })
    .returns<Pick<VgiAssessmentRow, 'assessment_date' | 'barthel_index' | 'mmse_score' | 'frailty_level'>[]>()
  if (errVgi) throw new Error(normalizarErrorBd(errVgi.message))
  const historial = (vgis ?? []).map((v) => ({
    fecha: v.assessment_date,
    barthel: v.barthel_index,
    mmse: v.mmse_score,
    fragilidad: v.frailty_level,
  }))

  const ultimo = historial.at(-1) ?? null
  const penultimo = historial.at(-2) ?? null
  const deltaBarthel =
    ultimo?.barthel != null && penultimo?.barthel != null ? ultimo.barthel - penultimo.barthel : null
  const deltaMmse =
    ultimo?.mmse != null && penultimo?.mmse != null ? ultimo.mmse - penultimo.mmse : null

  /* 2) Adherencia: ids de tareas → ejecuciones del periodo (batch, sin N+1). */
  const { data: tareas, error: errTareas } = await supabase
    .from('care_tasks')
    .select('id')
    .eq('resident_id', residentId)
    .returns<{ id: string }[]>()
  if (errTareas) throw new Error(normalizarErrorBd(errTareas.message))
  const idsTareas = (tareas ?? []).map((t) => t.id)

  let ejecucionesCompletadas = 0
  let ejecucionesOmitidas = 0
  if (idsTareas.length > 0) {
    const { data: ejecuciones, error: errEjec } = await supabase
      .from('task_executions')
      .select('outcome')
      .in('task_id', idsTareas)
      .gte('executed_at', `${desdeIso}T00:00:00`)
      .lte('executed_at', timestampDeFechaYHora(hoy, '23:59:59'))
      .returns<Pick<TaskExecutionRow, 'outcome'>[]>()
    if (errEjec) throw new Error(normalizarErrorBd(errEjec.message))
    for (const e of ejecuciones ?? []) {
      if (e.outcome === 'completada') ejecucionesCompletadas += 1
      else ejecucionesOmitidas += 1
    }
  }

  /* 3) DURO del residente: ids de medicación → conteos de adversos. */
  const { data: meds, error: errMeds } = await supabase
    .from('medications')
    .select('id, active')
    .eq('resident_id', residentId)
    .returns<Pick<MedicationRow, 'id' | 'active'>[]>()
  if (errMeds) throw new Error(normalizarErrorBd(errMeds.message))
  const idsMeds = (meds ?? []).map((m) => m.id)

  let eventosAdversosTotal = 0
  let eventosAdversos30dias = 0
  if (idsMeds.length > 0) {
    const { data: adversos, error: errAdv } = await supabase
      .from('medication_administrations')
      .select('administered_at')
      .in('medication_id', idsMeds)
      .eq('adverse_reaction', true)
      .returns<{ administered_at: string }[]>()
    if (errAdv) throw new Error(normalizarErrorBd(errAdv.message))
    for (const a of adversos ?? []) {
      eventosAdversosTotal += 1
      if (a.administered_at.slice(0, 10) >= desdeIso) eventosAdversos30dias += 1
    }
  }

  /* 4) Planes activos. */
  const { count: planesActivos, error: errPlanes } = await supabase
    .from('care_plans')
    .select('id', { count: 'exact', head: true })
    .eq('resident_id', residentId)
    .eq('status', 'activo')
  if (errPlanes) throw new Error(normalizarErrorBd(errPlanes.message))

  return {
    residenteId: residentId,
    vgiHistorial: historial,
    ultimoBarthel: ultimo?.barthel ?? null,
    deltaBarthel,
    ultimoMmse: ultimo?.mmse ?? null,
    deltaMmse,
    adherenciaDias: DIAS_ADHERENCIA,
    ejecucionesCompletadas,
    ejecucionesOmitidas,
    adherenciaPct: pct(ejecucionesCompletadas, ejecucionesCompletadas + ejecucionesOmitidas),
    eventosAdversosTotal,
    eventosAdversos30dias,
    planesActivos: planesActivos ?? 0,
    medicacionesActivas: (meds ?? []).filter((m) => m.active).length,
  }
}

/**
 * Consulta paginada de `access_logs` con filtros por usuario, rango de
 * fechas, acción y entidad. Solo administración: se valida el rol además
 * de la RLS `access_logs_select_own_or_admin`.
 */
export async function getAuditLogs(filtros: AuditFilters): Promise<AuditPage> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (sesion.rol !== 'admin') {
    throw new Error('Acceso denegado: solo la administración puede consultar la auditoría.')
  }

  const supabase = await createClient()
  const page = Math.max(1, Math.floor(filtros.page ?? 1))
  const pageSize = Math.min(100, Math.max(5, Math.floor(filtros.pageSize ?? 20)))

  let query = supabase
    .from('access_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filtros.userId && esUuidFase5(filtros.userId)) query = query.eq('user_id', filtros.userId)
  if (filtros.desde && /^\d{4}-\d{2}-\d{2}$/.test(filtros.desde)) {
    query = query.gte('created_at', `${filtros.desde}T00:00:00`)
  }
  if (filtros.hasta && /^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta)) {
    query = query.lte('created_at', `${filtros.hasta}T23:59:59`)
  }
  if (filtros.action && /^[a-z_.:-]{2,60}$/i.test(filtros.action)) {
    query = query.ilike('action', `%${filtros.action}%`)
  }
  if (filtros.entityType && /^[a-z_.:-]{2,60}$/i.test(filtros.entityType)) {
    query = query.eq('entity_type', filtros.entityType)
  }

  const { data, count, error } = await query
    .range((page - 1) * pageSize, page * pageSize - 1)
    .returns<AccessLogRow[]>()
  if (error) throw new Error(normalizarErrorBd(error.message))

  const logs = data ?? []
  /* Enriquecimiento batch: una sola lectura de perfiles para la página. */
  const idsUsuarios = [...new Set(logs.map((l) => l.user_id).filter((u): u is string => u !== null))]
  const nombres = new Map<string, string>()
  if (idsUsuarios.length > 0) {
    const { data: perfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', idsUsuarios)
      .returns<Pick<ProfileRow, 'id' | 'full_name'>[]>()
    for (const p of perfiles ?? []) nombres.set(p.id, p.full_name)
  }

  const total = count ?? logs.length
  return {
    logs: logs.map((l) => ({ ...l, userName: l.user_id ? nombres.get(l.user_id) ?? null : null })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Top N residentes con mayor riesgo clínico (fragilidad «frágil» según la
 * última VGI, ordenados por menor Barthel). Se apoya en el índice
 * `idx_vgi_resident_date` de la migración 003.
 */
export async function getTopRiesgo(limit = 5): Promise<ResidenteRiesgo[]> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const supabase = await createClient()
  const tope = Math.min(20, Math.max(1, Math.floor(limit)))

  const { data: residentes, error: errRes } = await supabase
    .from('residents')
    .select('id, first_name, last_name, room_number')
    .eq('status', 'activo')
    .returns<Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'>[]>()
  if (errRes) throw new Error(normalizarErrorBd(errRes.message))
  const lista = residentes ?? []
  if (lista.length === 0) return []

  /* Última VGI por residente: una sola lectura batch (sin N+1). */
  const { data: vgis, error: errVgi } = await supabase
    .from('vgi_assessments')
    .select('resident_id, assessment_date, barthel_index, mmse_score, frailty_level')
    .in('resident_id', lista.map((r) => r.id))
    .order('assessment_date', { ascending: false })
    .limit(5000)
    .returns<
      Pick<VgiAssessmentRow, 'resident_id' | 'assessment_date' | 'barthel_index' | 'mmse_score' | 'frailty_level'>[]
    >()
  if (errVgi) throw new Error(normalizarErrorBd(errVgi.message))

  const hoy = fechaLocalISO()
  const ultima = new Map<string, Pick<VgiAssessmentRow, 'assessment_date' | 'barthel_index' | 'mmse_score' | 'frailty_level'>>()
  for (const v of vgis ?? []) {
    if (!ultima.has(v.resident_id)) ultima.set(v.resident_id, v)
  }

  return lista
    .map((r) => {
      const v = ultima.get(r.id) ?? null
      return {
        id: r.id,
        nombre: nombreResidente(r),
        habitacion: r.room_number,
        barthel: v?.barthel_index ?? null,
        mmse: v?.mmse_score ?? null,
        fragilidad: v?.frailty_level ?? null,
        diasDesdeUltimaVgi: v ? diasEntre(v.assessment_date.slice(0, 10), hoy) : null,
      }
    })
    .filter((r) => r.fragilidad === 'fragil')
    .sort((a, b) => {
      const ba = a.barthel ?? -1
      const bb = b.barthel ?? -1
      if (ba !== bb) return ba - bb
      return (a.diasDesdeUltimaVgi ?? 9999) - (b.diasDesdeUltimaVgi ?? 9999)
    })
    .slice(0, tope)
}

/**
 * Listado plano de residentes visibles para la exportación CSV del módulo
 * de reportes (proyección mínima; la RLS restringe las filas).
 */
export async function getResidentsForExport(): Promise<ResidentRow[]> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('residents')
    .select('*')
    .order('status', { ascending: true })
    .order('first_name')
    .returns<ResidentRow[]>()
  if (error) throw new Error(normalizarErrorBd(error.message))
  return data ?? []
}

/**
 * Alertas clínicas del turno actual (AlertBanner, Fase 5):
 *  1. Tareas urgentes prioritarias vencidas hace ≥ 2 h sin ejecutar.
 *  2. Tomas de medicación pendientes de administrar en las últimas 2 h.
 *  3. Signos vitales fuera de rango registrados en task_execuciones del día.
 *  4. Reacciones adversas registradas hoy en el DURO.
 *
 * Rendimiento: 4 consultas batch apoyadas en los índices de la migración 003.
 */
export async function getClinicalAlerts(): Promise<AlertSummary> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const supabase = await createClient()
  const ahora = new Date()
  const hoy = fechaLocalISO(ahora)
  const inicioDia = `${hoy}T00:00:00`
  /* Umbral robusto: una tarea urgente se considera vencida si su instante
     programado (fecha + scheduled_time) quedó al menos 2 h atrás. Se filtra
     por fecha en BD y se confirma el instante exacto en memoria, evitando
     falsos positivos cuando las 2 h cruzan la medianoche. */
  const umbralHace2hMs = ahora.getTime() - 2 * 60 * 60 * 1000

  const alerts: ClinicalAlert[] = []

  /* --- 1) Tareas urgentes sin completar (≥2 h de retraso) -------------- */
  type TareaAlerta = Pick<
    CareTaskRow,
    'id' | 'resident_id' | 'title' | 'scheduled_time' | 'priority' | 'effective_from' | 'effective_until' | 'days_of_week'
  > & {
    residents: Pick<ResidentRow, 'id' | 'first_name' | 'last_name'> | null
  }
  const { data: tareasVencidas, error: errT1 } = await supabase
    .from('care_tasks')
    .select('id, resident_id, title, scheduled_time, priority, effective_from, effective_until, days_of_week, residents!inner(id, first_name, last_name)')
    .eq('status', 'programada')
    .eq('priority', 'urgente')
    .lte('effective_from', hoy)
    .or(`effective_until.is.null,effective_until.gte.${hoy}`)
    .returns<TareaAlerta[]>()
  if (errT1) throw new Error(normalizarErrorBd(errT1.message))

  /* Conteos de ejecuciones de HOY en UNA sola consulta (evita N+1). */
  const idsTareasVigentes = [...new Set((tareasVencidas ?? []).map((t) => t.id))]
  const idsTareasEjecutadasHoy = new Set<string>()
  if (idsTareasVigentes.length > 0) {
    const { data: ejecHoy, error: errEH } = await supabase
      .from('task_executions')
      .select('task_id')
      .in('task_id', idsTareasVigentes)
      .gte('executed_at', inicioDia)
      .returns<{ task_id: string }[]>()
    if (errEH) throw new Error(normalizarErrorBd(errEH.message))
    for (const e of ejecHoy ?? []) idsTareasEjecutadasHoy.add(e.task_id)
  }

  let urgentesSinCompletar = 0
  for (const t of tareasVencidas ?? []) {
    // Solo se necesitan los campos que `tareaProgramadaParaElDia` lee
    // (effective_from, effective_until, days_of_week); el resto se rellena
    // con valores neutros para satisfacer CareTaskRow sin `any`.
    if (
      !tareaProgramadaParaElDia(
        {
          id: t.id,
          resident_id: t.resident_id,
          care_plan_id: null,
          task_type: 'otro',
          title: t.title,
          description: null,
          scheduled_time: t.scheduled_time,
          days_of_week: t.days_of_week,
          frequency: 'diaria',
          assigned_to: null,
          priority: t.priority,
          status: 'programada',
          effective_from: t.effective_from,
          effective_until: t.effective_until,
          recurrence_group_id: t.id,
          requires_vitals: false,
          requires_photo: false,
          created_by: null,
          created_at: '',
          updated_at: '',
        },
        hoy,
      )
    )
      continue
    /* El instante programado debe tener ≥2 h de retraso real. */
    const instanteProgramado = new Date(`${t.effective_from}T${t.scheduled_time}`).getTime()
    if (Number.isNaN(instanteProgramado) || instanteProgramado > umbralHace2hMs) continue
    /* ¿Se registró alguna ejecución hoy para esta tarea? (consulta batch única) */
    if (idsTareasEjecutadasHoy.has(t.id)) continue
    urgentesSinCompletar += 1
    if (alerts.length < 8) {
      alerts.push({
        id: `tarea-${t.id}`,
        level: 'critico',
        titulo: 'Tarea urgente sin completar',
        detalle: `${t.title}${t.residents ? ` · ${nombreResidente(t.residents)}` : ''} (programada ${t.scheduled_time.slice(0, 5)}, más de 2 h de retraso)`,
        href: '/dashboard/tareas',
      })
    }
  }

  /* --- 2) Medicaciones pendientes del turno ----------------------------- */
  type MedAlerta = Pick<MedicationRow, 'id' | 'name' | 'dosage' | 'schedule_times'> & {
    residents: Pick<ResidentRow, 'id' | 'first_name' | 'last_name'> | null
  }
  const { data: medsPendientes, error: errM2 } = await supabase
    .from('medications')
    .select('id, name, dosage, schedule_times, residents!inner(id, first_name, last_name)')
    .eq('active', true)
    .lte('start_date', hoy)
    .or(`end_date.is.null,end_date.gte.${hoy}`)
    .returns<MedAlerta[]>()
  if (errM2) throw new Error(normalizarErrorBd(errM2.message))

  const idsMeds = (medsPendientes ?? []).map((m) => m.id)
  const adminsHoyPorMed = new Map<string, Set<string>>()
  if (idsMeds.length > 0) {
    const { data: admins, error: errA2 } = await supabase
      .from('medication_administrations')
      .select('medication_id, scheduled_at')
      .in('medication_id', idsMeds)
      .gte('administered_at', inicioDia)
      .returns<Pick<MedicationAdministrationRow, 'medication_id' | 'scheduled_at'>[]>()
    if (errA2) throw new Error(normalizarErrorBd(errA2.message))
    for (const a of admins ?? []) {
      const set = adminsHoyPorMed.get(a.medication_id) ?? new Set<string>()
      if (a.scheduled_at) set.add(a.scheduled_at.slice(11, 16))
      adminsHoyPorMed.set(a.medication_id, set)
    }
  }

  let medicacionesPendientes = 0
  for (const m of medsPendientes ?? []) {
    const registradas = adminsHoyPorMed.get(m.id) ?? new Set<string>()
    for (const horaSql of m.schedule_times) {
      if (!/^\d{2}:\d{2}/.test(horaSql)) continue
      const hhmm = horaSql.slice(0, 5)
      if (horaSql >= `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`) {
        continue // toma futura
      }
      if (registradas.has(hhmm)) continue
      medicacionesPendientes += 1
      if (alerts.length < 8) {
        alerts.push({
          id: `med-${m.id}-${hhmm}`,
          level: 'advertencia',
          titulo: 'Medicación pendiente de administrar',
          detalle: `${m.name} ${m.dosage}${m.residents ? ` · ${nombreResidente(m.residents)}` : ''} (toma de las ${hhmm})`,
          href: '/dashboard/medicaciones/administrar',
        })
      }
    }
  }

  /* --- 3) Signos vitales fuera de rango (ejecuciones de hoy) ------------ */
  const { data: ejecucionesHoy, error: errE3 } = await supabase
    .from('task_executions')
    .select('id, vital_signs')
    .gte('executed_at', inicioDia)
    .not('vital_signs', 'is', null)
    .limit(1000)
    .returns<Pick<TaskExecutionRow, 'id' | 'vital_signs'>[]>()
  if (errE3) throw new Error(normalizarErrorBd(errE3.message))

  let signosFueraDeRango = 0
  for (const e of ejecucionesHoy ?? []) {
    const anomalías = detectarAnomaliasSignos(e.vital_signs)
    if (anomalías.length === 0) continue
    signosFueraDeRango += 1
    if (alerts.length < 10) {
      alerts.push({
        id: `vital-${e.id}`,
        level: 'critico',
        titulo: 'Signos vitales fuera de rango',
        detalle: anomalías.join(' · '),
        href: '/dashboard/tareas',
      })
    }
  }

  /* --- 4) Reacciones adversas de hoy ------------------------------------ */
  const { count: adversasHoy, error: errA4 } = await supabase
    .from('medication_administrations')
    .select('id', { count: 'exact', head: true })
    .eq('adverse_reaction', true)
    .gte('administered_at', inicioDia)
  if (errA4) throw new Error(normalizarErrorBd(errA4.message))
  const totalAdversas = adversasHoy ?? 0
  if (totalAdversas > 0) {
    alerts.unshift({
      id: 'adversas-hoy',
      level: 'critico',
      titulo: `Reacciones adversas hoy: ${totalAdversas}`,
      detalle: 'Registros DURO con reacción adversa en el día. Revise el historial de administración.',
      href: '/dashboard/medicaciones/administrar',
    })
  }

  return {
    generatedAt: ahora.toISOString(),
    alerts,
    urgentesSinCompletar,
    medicacionesPendientes,
    signosFueraDeRango,
  }
}

/**
 * Datos para el gráfico de evolución Barthel/MMSE (reportes, Fase 5).
 * Una sola pasada sobre vgi_assessments ordenada por fecha (sin N+1).
 */
export async function getVgiParaEvolucion(): Promise<{
  opciones: { id: string; nombre: string }[]
  historiales: Record<string, { fecha: string; barthel: number | null; mmse: number | null }[]>
}> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vgi_assessments')
    .select('resident_id, assessment_date, barthel_index, mmse_score, residents!inner(id, first_name, last_name)')
    .order('assessment_date', { ascending: true })
    .limit(5000)
    .returns<
      {
        resident_id: string
        assessment_date: string
        barthel_index: number | null
        mmse_score: number | null
        residents: Pick<ResidentRow, 'id' | 'first_name' | 'last_name'> | null
      }[]
    >()
  if (error) throw new Error(normalizarErrorBd(error.message))

  const opcionesMap = new Map<string, { id: string; nombre: string }>()
  const historiales: Record<string, { fecha: string; barthel: number | null; mmse: number | null }[]> = {}
  for (const v of data ?? []) {
    const rid = v.resident_id
    if (!opcionesMap.has(rid) && v.residents) {
      opcionesMap.set(rid, { id: rid, nombre: nombreResidente(v.residents) })
    }
    ;(historiales[rid] ??= []).push({ fecha: v.assessment_date, barthel: v.barthel_index, mmse: v.mmse_score })
  }
  return { opciones: [...opcionesMap.values()], historiales }
}
