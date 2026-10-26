'use server'

/**
 * GeriCare · FASE 6 — Server Actions de planificación de tareas
 * ------------------------------------------------------------------
 * `createTaskWithRecurrence` genera INSTANCIAS FÍSICAS de `care_tasks` para
 * los próximos 30 días (estrategia "materializar ventana"): evita cron jobs
 * en Supabase y garantiza que el móvil del auxiliar (Fase 7) encuentre las
 * tareas ya sincronizadas. Todas las instancias de una misma serie comparten
 * `recurrence_group_id`, lo que permite cancelar/actualizar la serie completa.
 *
 * Reglas arquitectónicas cumplidas:
 *  - Cero lógica de mutación en el cliente: todo pasa por aquí.
 *  - Validación estricta con Zod (`CreateTaskSchema` de `@/types`) antes de insertar.
 *  - Auditoría automática en `access_logs` (fire-and-forget, sin PII clínico).
 *  - Confianza total en RLS: las inserciones se hacen con la sesión del usuario.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { normalizarErrorBdPublic } from '@/lib/errores'
import type {
  CreateTaskInput,
  CreateTaskResult,
  TablesInsert,
  UserRole,
} from '@/types'
import {
  CreateTaskSchema,
  DIAS_LMV,
  VENTANA_RECURRENCIA_DIAS,
} from '@/types'

/* ================================================================== */
/* Constantes locales (un archivo 'use server' solo exporta funciones) */
/* ================================================================== */

const ROLES_ASIGNACION_TAREA: readonly UserRole[] = ['admin', 'nurse_jefe', 'medico']

const RESULTADO_INICIAL: CreateTaskResult = { exito: false, mensaje: '', instanciasCreadas: 0 }

const ACCION_AUDITORIA = 'task.create_recurrence' as const

/* ================================================================== */
/* Motor de recurrencia (puro, tipado, testeable)                     */
/* ================================================================== */

/** Día ISO-8601 (1 = lunes … 7 = domingo) de una fecha local YYYY-MM-DD. */
function diaIsoDeFecha(fechaIso: string): number {
  // Mediodía local evita saltos de zona horaria al calcular el día.
  const d = new Date(`${fechaIso}T12:00:00`)
  return d.getDay() === 0 ? 7 : d.getDay()
}

/** Suma `n` días a una fecha YYYY-MM-DD devolviendo YYYY-MM-DD (sin deriva horaria). */
function sumarDias(fechaIso: string, n: number): string {
  const [y, m, day] = fechaIso.split('-').map((p) => Number.parseInt(p, 10))
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() + n)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Días activos según el patrón elegido (custom usa recurrence_days tal cual). */
function diasDelPatron(input: CreateTaskInput): number[] {
  switch (input.recurrence) {
    case 'none':
      return [diaIsoDeFecha(input.scheduled_time.slice(0, 10))]
    case 'daily':
      return [1, 2, 3, 4, 5, 6, 7]
    case 'lmi_vie':
      return [...DIAS_LMV]
    case 'custom':
      return [...new Set(input.recurrence_days)].sort((a, b) => a - b)
  }
}

/** Fecha local de hoy en formato YYYY-MM-DD (para validar series futuras). */
function hoyLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Calcula las fechas efectivas de la serie dentro de la ventana de 30 días.
 * - 'none': una única instancia en la fecha indicada.
 * - patrones recurrentes: cada día coincidente desde la fecha inicial hasta
 *   `VENTANA_RECURRENCIA_DIAS` días después (inclusive), sin duplicados.
 */
function fechasDeLaSerie(input: CreateTaskInput): string[] {
  const inicio = input.scheduled_time.slice(0, 10)
  if (input.recurrence === 'none') return [inicio]

  const dias = new Set(diasDelPatron(input))
  const fechas: string[] = []
  for (let i = 0; i <= VENTANA_RECURRENCIA_DIAS; i++) {
    const f = sumarDias(inicio, i)
    if (dias.has(diaIsoDeFecha(f))) fechas.push(f)
  }
  return fechas
}

/* ================================================================== */
/* Auditoría interna (fire-and-forget)                                */
/* ================================================================== */

/**
 * Escribe en `public.access_logs` la creación de una serie de tareas.
 * Respeta la política RLS `access_logs_insert_any_authenticated`: el actor es
 * siempre `auth.uid()` real y no se registra información clínica libre.
 */
async function registrarAuditoriaTarea(entrada: {
  entidadId: string
  detalle: Record<string, string | number>
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
      entity_type: 'care_task_series',
      entity_id: entrada.entidadId,
      metadata: { source: 'server_action', ...entrada.detalle },
    })
  } catch {
    console.error('[GeriCare] No se pudo auditar la creación de serie de tareas.')
  }
}

/* ================================================================== */
/* Acción principal                                                   */
/* ================================================================== */

/**
 * Crea una tarea (o serie materializada de hasta 30 días) en `public.care_tasks`.
 * Valida con Zod, comprueba rol/sesión/destinatarios, genera las instancias con
 * un mismo `recurrence_group_id`, audita y redirige a la agenda.
 */
export async function createTaskWithRecurrence(
  _previo: CreateTaskResult,
  formData: FormData,
): Promise<CreateTaskResult> {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_ASIGNACION_TAREA.includes(sesion.rol)) {
    return {
      ...RESULTADO_INICIAL,
      mensaje:
        'Tu rol no tiene permiso para planificar tareas. Solo administración, enfermera jefe o médico pueden hacerlo.',
    }
  }

  /* --- Validación estricta con Zod (misma fuente que el cliente) --------- */
  const raw: Record<string, unknown> = {
    resident_id: String(formData.get('resident_id') ?? ''),
    assigned_to: String(formData.get('assigned_to') ?? ''),
    task_type: String(formData.get('task_type') ?? ''),
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    scheduled_time: String(formData.get('scheduled_time') ?? ''),
    recurrence: String(formData.get('recurrence') ?? 'none'),
    requires_vitals: formData.get('requires_vitals') === 'on',
    requires_photo: formData.get('requires_photo') === 'on',
    priority: String(formData.get('priority') ?? 'normal'),
  }
  raw.recurrence_days = formData
    .getAll('recurrence_days')
    .map((v) => Number.parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n))

  const parse = CreateTaskSchema.safeParse(raw)
  if (!parse.success) {
    const primer = parse.error.issues[0]
    return {
      ...RESULTADO_INICIAL,
      mensaje: primer ? primer.message : 'Los datos del formulario no son válidos.',
    }
  }
  const input: CreateTaskInput = parse.data

  /* --- Normalización de horario a columnas reales de la BD --------------- */
  // El input datetime-local llega como 'YYYY-MM-DDTHH:mm' en hora LOCAL de la
  // institución. Se descompone en effective_from (date) + scheduled_time (time)
  // sin conversión a UTC, para que la agenda muestre la hora wall-clock correcta.
  const fechaInicio = input.scheduled_time.slice(0, 10)
  const horaSql = `${input.scheduled_time.slice(11, 16)}:00`

  if (input.recurrence !== 'none' && fechaInicio < hoyLocalIso()) {
    return {
      ...RESULTADO_INICIAL,
      mensaje: 'Una serie recurrente debe comenzar hoy o en una fecha futura.',
    }
  }

  const supabase = await createClient()

  /* --- Verificación de existencias (residente y auxiliar) ---------------- */
  const { data: residente } = await supabase
    .from('residents')
    .select('id')
    .eq('id', input.resident_id)
    .maybeSingle()
  if (!residente) {
    return {
      ...RESULTADO_INICIAL,
      mensaje: 'El residente seleccionado no existe o no tienes acceso a él.',
    }
  }

  if (input.assigned_to !== '') {
    const { data: auxiliar } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', input.assigned_to)
      .maybeSingle<{ id: string; role: UserRole }>()
    if (!auxiliar) {
      return { ...RESULTADO_INICIAL, mensaje: 'El auxiliar seleccionado no existe en el sistema.' }
    }
    if (auxiliar.role !== 'auxiliar' && auxiliar.role !== 'nurse_jefe') {
      return {
        ...RESULTADO_INICIAL,
        mensaje: 'Solo auxiliares o la enfermera jefe pueden recibir tareas asignadas.',
      }
    }
  }

  /* --- Generación de instancias físicas ---------------------------------- */
  const fechas = fechasDeLaSerie(input)
  if (fechas.length === 0) {
    return {
      ...RESULTADO_INICIAL,
      mensaje: 'El patrón de recurrencia no genera ninguna tarea dentro de la ventana de 30 días.',
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const groupId = crypto.randomUUID()
  const filas: TablesInsert<'care_tasks'>[] = fechas.map((f) => ({
    resident_id: input.resident_id,
    care_plan_id: null,
    task_type: input.task_type,
    title: input.title,
    description: input.description && input.description.length > 0 ? input.description : null,
    scheduled_time: horaSql,
    days_of_week: diasDelPatron(input),
    frequency: input.recurrence === 'none' ? 'unica' : 'diaria',
    assigned_to: input.assigned_to === '' ? null : input.assigned_to,
    priority: input.priority,
    status: 'programada',
    effective_from: f,
    effective_until:
      input.recurrence === 'none' ? f : sumarDias(fechaInicio, VENTANA_RECURRENCIA_DIAS),
    recurrence_group_id: groupId,
    requires_vitals: input.requires_vitals,
    requires_photo: input.requires_photo,
    created_by: user?.id ?? sesion.userId,
  }))

  const { error: errorInsercion } = await supabase.from('care_tasks').insert(filas)
  if (errorInsercion) {
    return { ...RESULTADO_INICIAL, mensaje: normalizarErrorBdPublic(errorInsercion.message) }
  }

  /* --- Auditoría (nunca rompe el flujo clínico) --------------------------- */
  void registrarAuditoriaTarea({
    entidadId: groupId,
    detalle: {
      resident_id: input.resident_id,
      task_type: input.task_type,
      recurrence: input.recurrence,
      instancias: filas.length,
    },
  })

  revalidatePath('/dashboard/tareas')
  revalidatePath(`/dashboard/residentes/${input.resident_id}`, 'page')
  redirect('/dashboard/tareas')
}
