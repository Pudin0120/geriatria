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
 *  - La auditoría de cambios clínicos se realiza en PostgreSQL de forma transaccional.
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
import { CreateTaskSchema } from '@/types'
import {
  diasDelPatron,
  fechasDeLaSerie,
  hoyLocalIso,
  sumarDias,
  VENTANA_RECURRENCIA_DIAS,
} from '@/lib/task-schedule.mjs'

/* ================================================================== */
/* Constantes locales (un archivo 'use server' solo exporta funciones) */
/* ================================================================== */

const ROLES_ASIGNACION_TAREA: readonly UserRole[] = ['admin', 'nurse_jefe', 'medico']

const RESULTADO_INICIAL: CreateTaskResult = { exito: false, mensaje: '', instanciasCreadas: 0 }


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
    const { data: personal } = await supabase.rpc('list_assignable_staff')
    const auxiliar = (personal as Array<{ id: string; role: UserRole }> | null)
      ?.find((miembro) => miembro.id === input.assigned_to)
    if (!auxiliar) {
      return { ...RESULTADO_INICIAL, mensaje: 'El auxiliar seleccionado no existe en el sistema.' }
    }
    if (!['auxiliar', 'nurse_jefe', 'enfermeria'].includes(auxiliar.role)) {
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

  revalidatePath('/dashboard/tareas')
  revalidatePath(`/dashboard/residentes/${input.resident_id}`, 'page')
  redirect('/dashboard/tareas')
}
