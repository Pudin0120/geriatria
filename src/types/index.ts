/**
 * GeriCare · Fase 1 — Tipos de aplicación y modelos de dominio
 *
 * Reexporta los tipos crudos de base de datos (`database.types`) y añade
 * modelos de dominio enriquecidos, etiquetas legibles en español para la UI
 * y utilidades de narrowing. Todo el archivo está 100% tipado: cero `any`.
 */

import type {
  AccessLogMetadata,
  AdministrationOutcome,
  CarePlanStatus,
  CareTaskRow,
  DayOfWeek,
  ExecutionOutcome,
  FrailtyLevel,
  MedicationAdministrationRow,
  MedicationFrequency,
  MedicationRoute,
  MedicationRow,
  ProfileRow,
  ResidentGender,
  ResidentRow,
  ResidentStatus,
  TaskExecutionRow,
  TaskFrequency,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  VgiAssessmentRow,
  VitalSignsRecord,
} from './database.types'

/* ================================================================== */
/* 1. Reexportación de tipos de base de datos                          */
/* ================================================================== */

export type {
  AccessLogMetadata,
  AccessLogRow,
  AdministrationOutcome,
  CarePlanRow,
  CarePlanStatus,
  CareTaskRow,
  CareTaskWithAssignee,
  Database,
  DatabaseSchema,
  DayOfWeek,
  ExecutionOutcome,
  FrailtyLevel,
  GeriCareClient,
  MedicationAdministrationRow,
  MedicationFrequency,
  MedicationRoute,
  MedicationRow,
  MedicationWithResident,
  ProfileRow,
  ResidentGender,
  ResidentRow,
  ResidentStatus,
  ResidentWithLatestVgi,
  Tables,
  TablesInsert,
  TablesUpdate,
  TableName,
  TaskExecutionRow,
  TaskFrequency,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  VgiAssessmentRow,
  VitalSignsRecord,
} from './database.types'

/* ================================================================== */
/* 2. Etiquetas de UI en español (mapas exhaustivos Record<...>)       */
/* ================================================================== */

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Administración',
  nurse_jefe: 'Enfermero/a jefe',
  enfermeria: 'Enfermería',
  auxiliar: 'Auxiliar de enfermería',
  medico: 'Médico/a',
  familiar: 'Familiar',
}

export const TASK_TYPE_LABELS: Readonly<Record<TaskType, string>> = {
  higiene: 'Higiene personal',
  movilizacion: 'Movilización',
  alimentacion: 'Alimentación',
  signos_vitales: 'Signos vitales',
  medicacion: 'Medicación',
  control_esfinteres: 'Control de esfínteres',
  curacion: 'Curación de heridas',
  acompanamiento: 'Acompañamiento',
  otro: 'Otro',
}

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  programada: 'Programada',
  en_curso: 'En curso',
  completada: 'Completada',
  omitida: 'Omitida',
  cancelada: 'Cancelada',
}

export const RESIDENT_STATUS_LABELS: Readonly<Record<ResidentStatus, string>> = {
  activo: 'Activo',
  ingresado: 'Ingresado',
  baja_voluntaria: 'Baja voluntaria',
  fallecido: 'Fallecido',
}

export const MEDICATION_ROUTE_LABELS: Readonly<Record<MedicationRoute, string>> = {
  oral: 'Oral',
  topica: 'Tópica',
  intravenosa: 'Intravenosa',
  intramuscular: 'Intramuscular',
  subcutanea: 'Subcutánea',
  rectal: 'Rectal',
  inhalatoria: 'Inhalatoria',
  transdermica: 'Transdérmica',
  oftalmica: 'Oftálmica',
  otica: 'Ótica',
}

export const CARE_PLAN_STATUS_LABELS: Readonly<Record<CarePlanStatus, string>> = {
  borrador: 'Borrador',
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
}

export const TASK_PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const TASK_FREQUENCY_LABELS: Readonly<Record<TaskFrequency, string>> = {
  unica: 'Única vez',
  diaria: 'Diaria',
  alternodia: 'Días alternos',
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
}

export const MEDICATION_FREQUENCY_LABELS: Readonly<Record<MedicationFrequency, string>> = {
  unica: 'Dosis única',
  diaria: 'Diaria',
  cada_8h: 'Cada 8 horas',
  cada_12h: 'Cada 12 horas',
  cada_24h: 'Cada 24 horas',
  nocturna: 'Nocturna',
  bajo_demanda: 'A demanda',
}

export const ADMIN_OUTCOME_LABELS: Readonly<Record<AdministrationOutcome, string>> = {
  administrada: 'Administrada',
  rechazada: 'Rechazada por el residente',
  omitida: 'Omitida',
  parcial: 'Administración parcial',
}

export const FRAILTY_LEVEL_LABELS: Readonly<Record<FrailtyLevel, string>> = {
  fragil: 'Frágil',
  pre_fragil: 'Pre-frágil',
  robusto: 'Robusto',
}

export const GENDER_LABELS: Readonly<Record<ResidentGender, string>> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
  otro: 'Otro',
}

/** Día ISO (1 = lunes … 7 = domingo) → nombre corto en español. */
export const DAY_OF_WEEK_LABELS: Readonly<Record<DayOfWeek, string>> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
}

/* ================================================================== */
/* 3. Modelos de dominio enriquecidos                                  */
/* ================================================================== */

/** Nombre completo y abreviatura de un residente (para listas y chips). */
export interface ResidentSummary {
  id: string
  fullName: string
  initials: string
  roomNumber: string | null
  status: ResidentStatus
  statusLabel: string
}

/** Perfil de usuario listo para mostrar en la interfaz. */
export interface StaffMember extends ProfileRow {
  roleLabel: string
  initials: string
}

/** Vista de una tarea con campos derivados para tableros y agendas. */
export interface CareTaskView extends CareTaskRow {
  taskTypeLabel: string
  statusLabel: string
  priorityLabel: string
  frequencyLabel: string
  dayLabels: string[]
  /** Tiempo restante respecto a `now` en minutos (negativo = atrasada). */
  minutesUntilDue: number | null
}

/** Signos vitales normalizados para su exhibición. */
export interface VitalSignsDisplay {
  tensionArterial: string | null
  frecuenciaCardiaca: number | null
  temperatura: number | null
  saturacionOxigeno: number | null
  glucemia: number | null
}

/** Ejecución de tarea preparada para la bitácora. */
export interface TaskExecutionView extends TaskExecutionRow {
  outcomeLabel: string
  executorName: string | null
  vitalSigns: VitalSignsDisplay
}

/** Medicación enriquecida para el pase farmacológico. */
export interface MedicationView extends MedicationRow {
  routeLabel: string
  frequencyLabel: string
  residentName: string
  roomNumber: string | null
}

/** Registro de administración para el DURO (verificación de medicación). */
export interface MedicationAdministrationView extends MedicationAdministrationRow {
  outcomeLabel: string
  administratorName: string | null
  medicationName: string | null
  routeLabel: string
}

/** Resumen clínico de una VGI con semáforo por escala. */
export interface VgiAssessmentView extends VgiAssessmentRow {
  barthelLevel: 'dependencia_total' | 'dependencia_grave' | 'dependencia_moderada' | 'dependencia_leve' | 'independiente'
  mmseLevel: 'deterioro_significativo' | 'deterioro_leve' | 'normal'
  nutritionRisk: 'alto_riesgo' | 'riesgo' | 'normal'
  fallRisk: 'alto' | 'moderado' | 'bajo'
  moodLevel: 'depresion_probable' | 'depresion_posible' | 'animo_conservado'
}

/* ================================================================== */
/* 4. Funciones derivadoras (domain mappers)                           */
/* ================================================================== */

/** Construye el nombre completo de un residente. */
export function buildResidentFullName(resident: ResidentRow): string {
  return `${resident.last_name}, ${resident.first_name}`
}

/** Iniciales (máximo 2 letras) a partir de nombre y apellidos. */
export function buildInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0)
  const second = lastName.trim().charAt(0)
  return `${first}${second}`.toUpperCase()
}

/** Convierte un registro de residentes en resúmenes para la UI. */
export function toResidentSummary(resident: ResidentRow): ResidentSummary {
  return {
    id: resident.id,
    fullName: buildResidentFullName(resident),
    initials: buildInitials(resident.first_name, resident.last_name),
    roomNumber: resident.room_number,
    status: resident.status,
    statusLabel: RESIDENT_STATUS_LABELS[resident.status],
  }
}

/** Enriquece un perfil de usuario para su visualización. */
export function toStaffMember(profile: ProfileRow): StaffMember {
  const parts = profile.full_name.trim().split(/\s+/)
  const name = parts[0] ?? ''
  const surname = parts[1] ?? ''
  return {
    ...profile,
    roleLabel: USER_ROLE_LABELS[profile.role],
    initials: buildInitials(name, surname),
  }
}

/** Traduce las claves del jsonb `vital_signs` a un objeto de display. */
export function toVitalSignsDisplay(record: VitalSignsRecord): VitalSignsDisplay {
  const isString = (v: unknown): v is string => typeof v === 'string'
  const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  return {
    tensionArterial: isString(record.tension_arterial) ? record.tension_arterial : null,
    frecuenciaCardiaca: isNumber(record.frecuencia_cardiaca) ? record.frecuencia_cardiaca : null,
    temperatura: isNumber(record.temperatura) ? record.temperatura : null,
    saturacionOxigeno: isNumber(record.saturacion_oxigeno) ? record.saturacion_oxigeno : null,
    glucemia: isNumber(record.glucemia) ? record.glucemia : null,
  }
}

/** Calcula los minutos que faltan (o han pasado) hasta la hora programada. */
export function minutesUntilScheduled(scheduledTime: string, now: Date = new Date()): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(scheduledTime)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 60_000)
}

/** Enriquece una tarea con etiquetas y tiempo restante para el tablero. */
export function toCareTaskView(task: CareTaskRow, now: Date = new Date()): CareTaskView {
  const dayLabels = [...task.days_of_week]
    .sort((a, b) => a - b)
    .filter((d): d is DayOfWeek => d >= 1 && d <= 7)
    .map((d) => DAY_OF_WEEK_LABELS[d])
  return {
    ...task,
    taskTypeLabel: TASK_TYPE_LABELS[task.task_type],
    statusLabel: TASK_STATUS_LABELS[task.status],
    priorityLabel: TASK_PRIORITY_LABELS[task.priority],
    frequencyLabel: TASK_FREQUENCY_LABELS[task.frequency],
    dayLabels,
    minutesUntilDue: minutesUntilScheduled(task.scheduled_time, now),
  }
}

/** Enriquece una ejecución de tarea para la bitácora. */
export function toTaskExecutionView(
  execution: TaskExecutionRow,
  executorName: string | null = null
): TaskExecutionView {
  return {
    ...execution,
    outcomeLabel: TASK_STATUS_LABELS[execution.outcome],
    executorName,
    vitalSigns: toVitalSignsDisplay(execution.vital_signs),
  }
}

/** Enriquece una medicación para el pase farmacológico. */
export function toMedicationView(
  medication: MedicationRow,
  resident: ResidentRow
): MedicationView {
  return {
    ...medication,
    routeLabel: MEDICATION_ROUTE_LABELS[medication.route],
    frequencyLabel: MEDICATION_FREQUENCY_LABELS[medication.frequency],
    residentName: buildResidentFullName(resident),
    roomNumber: resident.room_number,
  }
}

/** Enriquece una administración de medicación para el control DURO. */
export function toMedicationAdministrationView(
  administration: MedicationAdministrationRow,
  options: { administratorName?: string | null; medicationName?: string | null } = {}
): MedicationAdministrationView {
  return {
    ...administration,
    outcomeLabel: ADMIN_OUTCOME_LABELS[administration.outcome],
    routeLabel: MEDICATION_ROUTE_LABELS[administration.route_used],
    administratorName: options.administratorName ?? null,
    medicationName: options.medicationName ?? null,
  }
}

/** Categoriza el índice de Barthel (0–100). */
export function classifyBarthel(score: number | null): VgiAssessmentView['barthelLevel'] | null {
  if (score === null) return null
  if (score <= 20) return 'dependencia_total'
  if (score <= 40) return 'dependencia_grave'
  if (score <= 60) return 'dependencia_moderada'
  if (score <= 85) return 'dependencia_leve'
  return 'independiente'
}

/** Categoriza el MMSE (0–30). */
export function classifyMmse(score: number | null): VgiAssessmentView['mmseLevel'] | null {
  if (score === null) return null
  if (score <= 17) return 'deterioro_significativo'
  if (score <= 23) return 'deterioro_leve'
  return 'normal'
}

/** Categoriza el MNA-SF (0–14). */
export function classifyMnaSf(score: number | null): VgiAssessmentView['nutritionRisk'] | null {
  if (score === null) return null
  if (score <= 7) return 'alto_riesgo'
  if (score <= 11) return 'riesgo'
  return 'normal'
}

/** Categoriza el riesgo de caídas según Downton (0–3 ítems). */
export function classifyFallRisk(score: number | null): VgiAssessmentView['fallRisk'] | null {
  if (score === null) return null
  if (score >= 3) return 'alto'
  if (score === 2) return 'moderado'
  return 'bajo'
}

/** Categoriza la escala de Yesavage GDS-15 (0–15). */
export function classifyYesavage(score: number | null): VgiAssessmentView['moodLevel'] | null {
  if (score === null) return null
  if (score >= 10) return 'depresion_probable'
  if (score >= 5) return 'depresion_posible'
  return 'animo_conservado'
}

/** Enriquece una VGI con los semáforos clínicos por escala. */
export function toVgiAssessmentView(assessment: VgiAssessmentRow): VgiAssessmentView {
  const barthelLevel = classifyBarthel(assessment.barthel_index)
  const mmseLevel = classifyMmse(assessment.mmse_score)
  const nutritionRisk = classifyMnaSf(assessment.mna_sf_score)
  const fallRisk = classifyFallRisk(assessment.downton_score)
  const moodLevel = classifyYesavage(assessment.yesavage_score)
  return {
    ...assessment,
    barthelLevel: barthelLevel ?? 'dependencia_total',
    mmseLevel: mmseLevel ?? 'normal',
    nutritionRisk: nutritionRisk ?? 'normal',
    fallRisk: fallRisk ?? 'bajo',
    moodLevel: moodLevel ?? 'animo_conservado',
  }
}

/* ================================================================== */
/* 5. Guards de tipo (narrowing seguro, sin `any`)                     */
/* ================================================================== */

const USER_ROLE_VALUES: readonly UserRole[] = ['admin', 'nurse_jefe', 'auxiliar', 'medico']
const TASK_STATUS_VALUES: readonly TaskStatus[] = [
  'programada',
  'en_curso',
  'completada',
  'omitida',
  'cancelada',
]
const RESIDENT_STATUS_VALUES: readonly ResidentStatus[] = [
  'activo',
  'ingresado',
  'baja_voluntaria',
  'fallecido',
]

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLE_VALUES as readonly string[]).includes(value)
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUS_VALUES as readonly string[]).includes(value)
}

export function isExecutionOutcome(value: unknown): value is ExecutionOutcome {
  return isTaskStatus(value) && value !== 'programada' && value !== 'en_curso'
}

export function isResidentStatus(value: unknown): value is ResidentStatus {
  return typeof value === 'string' && (RESIDENT_STATUS_VALUES as readonly string[]).includes(value)
}

const RESIDENT_GENDER_VALUES = ['masculino', 'femenino', 'otro'] as const satisfies readonly ResidentGender[]

export function isResidentGender(value: unknown): value is ResidentGender {
  return typeof value === 'string' && (RESIDENT_GENDER_VALUES as readonly string[]).includes(value)
}

const FRAILTY_LEVEL_VALUES = ['fragil', 'pre_fragil', 'robusto'] as const satisfies readonly FrailtyLevel[]

export function isFrailtyLevel(value: unknown): value is FrailtyLevel {
  return typeof value === 'string' && (FRAILTY_LEVEL_VALUES as readonly string[]).includes(value)
}

export function isDayOfWeek(value: unknown): value is DayOfWeek {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
}

/* ================================================================== */
/* 6. Utilidades transversales de la aplicación                        */
/* ================================================================== */

/** Estado de carga genérico para vistas (evita banderas booleanas sueltas). */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }

/** Resultado tipo Rust para flujos de servicio. */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }

/** Entrada de navegación lateral según rol. */
export interface NavItem {
  href: string
  label: string
  icon: string
  allowedRoles: readonly UserRole[]
}

/** Filtros de la agenda diaria de tareas. */
export interface DailyAgendaFilters {
  date: string // 'YYYY-MM-DD'
  residentId?: string
  assignedTo?: string
  statuses?: readonly TaskStatus[]
  taskTypes?: readonly TaskType[]
}

/** Payload para registrar la ejecución de una tarea desde la UI. */
export interface RecordTaskExecutionInput {
  taskId: string
  outcome: ExecutionOutcome
  notes?: string
  vitalSigns?: VitalSignsRecord
}

/** Payload para registrar una administración de medicación (DURO). */
export interface RecordMedicationAdministrationInput {
  medicationId: string
  doseGiven: string
  routeUsed: MedicationRoute
  outcome: AdministrationOutcome
  scheduledAt?: string
  adverseReaction?: boolean
  notes?: string
}

/** Fila de auditoría lista para pintar en la tabla administrativa. */
export interface AuditLogEntry {
  id: number
  when: string
  who: string
  action: string
  entity: string
  metadata: AccessLogMetadata
}

/* ================================================================== */
/* FASE 6 · Planificación de tareas con recurrencia                    */
/* ================================================================== */

/** Patrón de recurrencia soportado por el formulario de creación de tareas. */
export type RecurrencePattern = 'none' | 'daily' | 'lmi_vie' | 'custom'

/** Etiquetas en español para cada patrón de recurrencia. */
export const RECURRENCE_PATTERN_LABELS: Readonly<Record<RecurrencePattern, string>> = {
  none: 'Sin repetición (tarea única)',
  daily: 'Diaria',
  lmi_vie: 'Lunes · Miércoles · Viernes',
  custom: 'Personalizada (elegir días)',
}

/** Constantes compartidas con el motor puro de fechas de recurrencia. */
export { DIAS_LMV, VENTANA_RECURRENCIA_DIAS } from '@/lib/task-schedule.mjs'

/**
 * Payload validado que acepta la Server Action `createTaskWithRecurrence`.
 * `scheduled_time` es un timestamp ISO-8601 completo (fecha + hora locales
 * convertidas a UTC); la BD lo descompone en `effective_from` + `scheduled_time`.
 */
export interface CreateTaskPayload {
  resident_id: string
  assigned_to: string | null
  task_type: TaskType
  title: string
  description: string | null
  scheduled_time: string
  recurrence: RecurrencePattern
  /** Solo aplicable cuando recurrence === 'custom'. Días ISO 1–7. */
  recurrence_days: number[]
  requires_vitals: boolean
  requires_photo: boolean
  priority: TaskPriority
}

/** Resultado de la creación: nº de instancias físicas generadas. */
export interface CreateTaskResult {
  exito: boolean
  mensaje: string
  instanciasCreadas: number
}

/* ================================================================== */
/* FASE 6 · Esquema Zod del formulario de creación de tareas           */
/* ================================================================== */

import { z } from 'zod'

const PATRONES_RECURRENCIA = ['none', 'daily', 'lmi_vie', 'custom'] as const
const TIPOS_TAREA = Object.keys(TASK_TYPE_LABELS) as [TaskType, ...TaskType[]]
const PRIORIDADES_TAREA = ['baja', 'normal', 'alta', 'urgente'] as const
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const FECHA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/**
 * Esquema compartido (cliente y servidor) para crear una tarea con recurrencia.
 * `scheduled_time` es un datetime local sin segundos ('YYYY-MM-DDTHH:mm'),
 * tal como lo entrega `<input type="datetime-local">`.
 */
export const CreateTaskSchema = z
  .object({
    resident_id: z.string().regex(UUID_RE, 'Selecciona un residente válido de la lista.'),
    assigned_to: z
      .union([z.string().regex(UUID_RE, 'Selecciona un auxiliar válido.'), z.literal('')])
      .refine((v) => v === '' || UUID_RE.test(v), 'Selecciona un auxiliar válido o deja vacío.'),
    task_type: z.enum(TIPOS_TAREA, { message: 'El tipo de tarea no es válido.' }),
    title: z
      .string()
      .trim()
      .min(3, 'El título debe tener al menos 3 caracteres.')
      .max(140, 'El título no puede superar 140 caracteres.'),
    description: z
      .string()
      .trim()
      .max(1000, 'La descripción no puede superar 1000 caracteres.')
      .optional()
      .or(z.literal('')),
    scheduled_time: z
      .string()
      .regex(FECHA_HORA_RE, 'Indica fecha y hora válidas (formato AAAA-MM-DDThh:mm).')
      .refine((v) => !Number.isNaN(new Date(v).getTime()), 'La fecha y hora indicadas no son válidas.'),
    recurrence: z.enum(PATRONES_RECURRENCIA, {
      message: 'El patrón de recurrencia no es válido.',
    }),
    recurrence_days: z
      .array(z.number().int().min(1, 'Día fuera de rango (1–7).').max(7, 'Día fuera de rango (1–7).'))
      .default([]),
    requires_vitals: z.boolean().default(false),
    requires_photo: z.boolean().default(false),
    priority: z.enum(PRIORIDADES_TAREA, { message: 'La prioridad seleccionada no es válida.' }),
  })
  .superRefine((val, ctx) => {
    if (val.recurrence === 'custom' && val.recurrence_days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrence_days'],
        message: 'En recurrencia personalizada debes marcar al menos un día.',
      })
    }
    if (val.recurrence !== 'custom' && val.recurrence_days.length > 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrence_days'],
        message: 'No puedes seleccionar más de 7 días.',
      })
    }
  })

/** Tipo inferido por Zod para los valores crudos del formulario. */
export type CreateTaskFormValues = z.input<typeof CreateTaskSchema>

/** Payload ya validado que consume la Server Action. */
export type CreateTaskInput = z.output<typeof CreateTaskSchema>
