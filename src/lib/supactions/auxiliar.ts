'use server'

/**
 * GeriCare · FASE 7 — Server Actions del módulo móvil para auxiliares.
 * --------------------------------------------------------------------------
 * `executeTask` (Fase 7) materializa la ejecución táctica de una tarea desde
 * el celular: valida sesión y rol, exige signos vitales/foto cuando la tarea
 * lo requiere, normaliza los datos con el MISMO esquema Zod del cliente y
 * escribe en `task_executions` + `care_tasks` confiando en RLS (el auxiliar
 * solo puede marcar como ejecutor su propia identidad).
 *
 * Reglas arquitectónicas cumplidas:
 *  - Cero mutación en cliente: todo pasa por esta acción.
 *  - Validación estricta con Zod antes de insertar (`VitalSignsMobileSchema`).
 *  - Auditoría automática en `access_logs` (fire-and-forget, sin PII clínico).
 *  - Un archivo 'use server' solo exporta funciones async.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { normalizarErrorBdPublic } from '@/lib/errores'
import type {
  CareTaskRow,
  ExecuteTaskMobileResult,
  ExecutionOutcome,
  TablesInsert,
  VitalSignsMobileValues,
  VitalSignsRecord,
} from '@/types'
import { isExecutionOutcome } from '@/types'
import {
  RESULTADO_EJECUCION_INICIAL,
  TAMANIO_MAXIMO_FOTO_BASE64,
  VITAL_SIGNS_LABELS,
  VitalSignsMobileSchema,
} from '@/types/auxiliar'

/* ================================================================== */
/* Constantes locales                                                 */
/* ================================================================== */

const ACCION_AUDITORIA = 'task.execute_mobile' as const

/** Roles que pueden operar la vista móvil de ejecución (auxiliar o superior). */
const ROLES_PERMITIDOS_EJECUTAR = ['admin', 'nurse_jefe', 'auxiliar', 'medico'] as const

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/

/* ================================================================== */
/* Normalización de campos (entrada FormData → tipos estrictos)       */
/* ================================================================== */

/** Lee un número de formulario; devuelve null si está vacío o no es numérico. */
function leerNumeroForm(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null
  const texto = String(raw).trim().replace(',', '.')
  if (texto === '') return null
  const n = Number.parseFloat(texto)
  return Number.isFinite(n) ? n : null
}

/**
 * Convierte el FormData a objeto tipado para validarlo con Zod. Los valores
 * no numéricos se dejan como NaN para que el esquema devuelva "Valor no
 * válido." en español en lugar de fallar silenciosamente.
 */
function extraerVitalesForm(formData: FormData): VitalSignsMobileValues {
  const sistolica = leerNumeroForm(formData.get('tension_sistolica'))
  const diastolica = leerNumeroForm(formData.get('tension_diastolica'))
  const fc = leerNumeroForm(formData.get('frecuencia_cardiaca'))
  const temperatura = leerNumeroForm(formData.get('temperatura'))
  const glucemia = leerNumeroForm(formData.get('glucemia'))
  const satO2 = leerNumeroForm(formData.get('saturacion_oxigeno'))

  const salida: Record<string, number | undefined> = {}
  if (sistolica !== null) salida.tension_sistolica = sistolica
  if (diastolica !== null) salida.tension_diastolica = diastolica
  if (fc !== null) salida.frecuencia_cardiaca = fc
  if (temperatura !== null) salida.temperatura = temperatura
  if (glucemia !== null) salida.glucemia = glucemia
  if (satO2 !== null) salida.saturacion_oxigeno = satO2
  return salida as VitalSignsMobileValues
}

/** Traduce el primer error de Zod a un mensaje visible en español. */
function primerErrorZod(error: { issues: readonly { path: readonly (string | number | symbol)[]; message: string }[] }): string {
  const issue = error.issues[0]
  if (!issue) return 'Los signos vitales registrados no son válidos.'
  const campo = issue.path[0]
  const etiqueta =
    typeof campo === 'string' && campo in VITAL_SIGNS_LABELS
      ? VITAL_SIGNS_LABELS[campo as keyof typeof VITAL_SIGNS_LABELS]
      : null
  return etiqueta ? `${etiqueta}: ${issue.message}` : issue.message
}

/**
 * Serializa los signos vitales validados al formato JSONB canónico de la BD
 * (`VitalSignsRecord`), reutilizado por reportes y bitácoras de las Fases 3–5.
 */
function vitalesAJsonb(v: VitalSignsMobileValues): VitalSignsRecord {
  const jsonb: VitalSignsRecord = {}
  if (v.tension_sistolica !== undefined && v.tension_diastolica !== undefined) {
    jsonb.tension_arterial = `${Math.round(v.tension_sistolica)}/${Math.round(v.tension_diastolica)}`
  } else if (v.tension_sistolica !== undefined) {
    jsonb.tension_sistolica = Math.round(v.tension_sistolica)
  } else if (v.tension_diastolica !== undefined) {
    jsonb.tension_diastolica = Math.round(v.tension_diastolica)
  }
  if (v.frecuencia_cardiaca !== undefined) jsonb.frecuencia_cardiaca = Math.round(v.frecuencia_cardiaca)
  if (v.temperatura !== undefined) jsonb.temperatura = v.temperatura
  if (v.glucemia !== undefined) jsonb.glucemia = Math.round(v.glucemia)
  if (v.saturacion_oxigeno !== undefined) jsonb.saturacion_oxigeno = Math.round(v.saturacion_oxigeno)
  return jsonb
}

/** Valida el data URL de la foto de evidencia (solo imagen, tamaño acotado). */
function validarFoto(raw: FormDataEntryValue | null): { valor: string | null; error: string | null } {
  if (raw === null) return { valor: null, error: null }
  // El cliente (modal móvil) siempre envía un data URL ya leído con FileReader.
  if (typeof raw !== 'string') {
    return { valor: null, error: 'Adjunta la fotografía nuevamente desde la cámara.' }
  }
  const texto = raw.trim()
  if (texto === '') return { valor: null, error: null }
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(texto)) {
    return { valor: null, error: 'La evidencia adjunta debe ser una imagen (JPG, PNG o WEBP).' }
  }
  if (texto.length > TAMANIO_MAXIMO_FOTO_BASE64) {
    return { valor: null, error: 'La fotografía es demasiado grande. Toma otra más ligera.' }
  }
  return { valor: texto, error: null }
}

/* ================================================================== */
/* Auditoría interna (fire-and-forget)                                */
/* ================================================================== */

async function registrarAuditoriaEjecucion(entrada: {
  entidadId: string
  outcome: ExecutionOutcome
}): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('access_logs').insert({
      user_id: user.id,
      action: ACCION_AUDITORIA,
      entity_type: 'task_executions',
      entity_id: entrada.entidadId,
      metadata: { source: 'server_action', outcome: entrada.outcome },
    })
  } catch {
    console.error('[GeriCare] No se pudo auditar la ejecución móvil de tarea.')
  }
}

/* ================================================================== */
/* Server Action principal                                            */
/* ================================================================== */

/**
 * Ejecuta una tarea desde el móvil del auxiliar.
 *
 * Recibe por FormData:
 *  - `taskId` (obligatorio, uuid)
 *  - `outcome`: 'completada' | 'omitida' | 'cancelada'
 *  - `notes` (opcional, ≤ 1000 caracteres)
 *  - campos de signos vitales (ver `VitalSignsMobileSchema`)
 *  - `photo_data_url` (opcional; data URL de imagen ≤ 250 KB)
 *
 * Reglas de negocio:
 *  - Si la tarea `requires_vitals`, los signos vitales son obligatorios y
 *    deben pasar el esquema Zod (rangos fisiológicos).
 *  - Si la tarea `requires_photo`, la foto es obligatoria al completar.
 *  - Al omitir/cancelar se permite notes vacías pero se registra igualmente.
 */
export async function executeTask(
  _estadoPrevio: ExecuteTaskMobileResult,
  formData: FormData,
): Promise<ExecuteTaskMobileResult> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!(ROLES_PERMITIDOS_EJECUTAR as readonly string[]).includes(sesion.rol)) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'Tu rol no puede ejecutar tareas desde esta vista.' }
  }

  const taskId = String(formData.get('taskId') ?? '').trim()
  if (!UUID_REGEX.test(taskId)) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'Identificador de tarea no válido.' }
  }

  const outcomeRaw = String(formData.get('outcome') ?? 'completada').trim()
  if (!isExecutionOutcome(outcomeRaw)) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'Resultado no válido para la tarea.' }
  }

  const notes = String(formData.get('notes') ?? '').trim()
  if (notes.length > 1000) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'Las notas no pueden superar 1000 caracteres.' }
  }

  const supabase = await createClient()

  // 1. Leer la tarea objetivo (RLS decide visibilidad).
  const { data: tarea } = await supabase
    .from('care_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle<CareTaskRow>()
  if (!tarea) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'La tarea no existe o no tienes acceso a ella.' }
  }
  if (tarea.status === 'cancelada') {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'No se puede registrar la ejecución de una tarea cancelada.' }
  }

  // 2. Signos vitales: obligatorios si la tarea lo exige.
  const vitales = extraerVitalesForm(formData)
  const hayAlgunVital = Object.values(vitales).some((v) => v !== undefined)
  if (tarea.requires_vitals && outcomeRaw === 'completada' && !hayAlgunVital) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'Esta tarea requiere registrar al menos un signo vital.' }
  }
  const parseo = VitalSignsMobileSchema.safeParse(vitales)
  if (!parseo.success) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: primerErrorZod(parseo.error) }
  }

  // 3. Foto de evidencia: obligatoria si la tarea lo exige al completar.
  const foto = validarFoto(formData.get('photo_data_url'))
  if (foto.error) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: foto.error }
  }
  if (tarea.requires_photo && outcomeRaw === 'completada' && foto.valor === null) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: 'Esta tarea requiere adjuntar una fotografía de evidencia.' }
  }

  // 4. Inserción en la bitácora (DURO) + actualización del estado visible.
  const insercion: TablesInsert<'task_executions'> = {
    task_id: taskId,
    executed_by: sesion.userId,
    executed_at: new Date().toISOString(),
    outcome: outcomeRaw,
    notes: notes.length > 0 ? notes : null,
    vital_signs: vitalesAJsonb(parseo.data),
  }

  const { error } = await supabase.from('task_executions').insert(insercion)
  if (error) {
    return { ...RESULTADO_EJECUCION_INICIAL, mensaje: normalizarErrorBdPublic(error.message) }
  }

  const { error: errorEstado } = await supabase
    .from('care_tasks')
    .update({ status: outcomeRaw })
    .eq('id', taskId)
  // Si RLS impide actualizar el estado, la bitácora queda igualmente registrada.
  void errorEstado

  // 5. Guardar la referencia de la foto junto a la ejecución cuando exista.
  if (foto.valor !== null) {
    const { error: errorFoto } = await supabase
      .from('task_executions')
      .update({ vital_signs: { ...insercion.vital_signs, photo_url: foto.valor } })
      .eq('task_id', taskId)
      .eq('executed_by', sesion.userId)
      .order('executed_at', { ascending: false })
      .limit(1)
    void errorFoto
  }

  void registrarAuditoriaEjecucion({ entidadId: taskId, outcome: outcomeRaw })

  revalidatePath('/auxiliar')
  revalidatePath('/dashboard/tareas')
  revalidatePath(`/dashboard/residentes/${tarea.resident_id}/planes`)
  revalidatePath('/dashboard')

  return {
    exito: true,
    mensaje:
      outcomeRaw === 'completada'
        ? 'Tarea completada correctamente.'
        : outcomeRaw === 'omitida'
          ? 'Tarea registrada como omitida.'
          : 'Tarea registrada como cancelada.',
  }
}
