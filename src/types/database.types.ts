/**
 * GeriCare · Fase 1 — Tipos de base de datos (Supabase / PostgreSQL 17)
 *
 * Este archivo replica EXACTAMENTE el esquema definido en
 * `supabase/migrations/001_initial_schema.sql`. Equivale al output de
 * `supabase gen types typescript --local`, pero escrito a mano con
 * TypeScript Strict y cero usos de `any`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/* ================================================================== */
/* 1. Enums de PostgreSQL (public.*)                                   */
/* ================================================================== */

/** Rol del usuario dentro del sistema. */
export type UserRole = 'admin' | 'nurse_jefe' | 'auxiliar' | 'medico'

/** Tipo de tarea de cuidado. */
export type TaskType =
  | 'higiene'
  | 'movilizacion'
  | 'alimentacion'
  | 'signos_vitales'
  | 'medicacion'
  | 'control_esfinteres'
  | 'curacion'
  | 'acompanamiento'
  | 'otro'

/** Estado de una tarea o de su ejecución. */
export type TaskStatus = 'programada' | 'en_curso' | 'completada' | 'omitida' | 'cancelada'

/** Situación administrativa del residente en el centro. */
export type ResidentStatus = 'activo' | 'ingresado' | 'baja_voluntaria' | 'fallecido'

/** Vía de administración de un medicamento. */
export type MedicationRoute =
  | 'oral'
  | 'topica'
  | 'intravenosa'
  | 'intramuscular'
  | 'subcutanea'
  | 'rectal'
  | 'inhalatoria'
  | 'transdermica'
  | 'oftalmica'
  | 'otica'

/* ================================================================== */
/* 2. Check constraints modelados como uniones literales               */
/* ================================================================== */

/** Sexo del residente (check: residents.gender). */
export type ResidentGender = 'masculino' | 'femenino' | 'otro'

/** Nivel de fragilidad (check: vgi_assessments.frailty_level). */
export type FrailtyLevel = 'fragil' | 'pre_fragil' | 'robusto'

/** Estado del plan de cuidados (check: care_plans.status). */
export type CarePlanStatus = 'borrador' | 'activo' | 'pausado' | 'cerrado'

/** Frecuencia de una tarea de cuidado (check: care_tasks.frequency). */
export type TaskFrequency =
  | 'unica'
  | 'diaria'
  | 'alternodia'
  | 'semanal'
  | 'quincenal'
  | 'mensual'

/** Prioridad de una tarea (check: care_tasks.priority). */
export type TaskPriority = 'baja' | 'normal' | 'alta' | 'urgente'

/** Frecuencia posológica de una medicación (check: medications.frequency). */
export type MedicationFrequency =
  | 'unica'
  | 'diaria'
  | 'cada_8h'
  | 'cada_12h'
  | 'cada_24h'
  | 'nocturna'
  | 'bajo_demanda'

/** Resultado de la administración de medicación (check: medication_administrations.outcome). */
export type AdministrationOutcome = 'administrada' | 'rechazada' | 'omitida' | 'parcial'

/** Resultado permitido al registrar la ejecución de una tarea. */
export type ExecutionOutcome = Extract<TaskStatus, 'completada' | 'omitida' | 'cancelada'>

/** Día de la semana (ISO: 1 = lunes … 7 = domingo). */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** Signos vitales registrados junto a una ejecución de tarea (columna jsonb). */
export interface VitalSignsRecord {
  tension_arterial?: string
  frecuencia_cardiaca?: number
  temperatura?: number
  saturacion_oxigeno?: number
  glucemia?: number
  [key: string]: string | number | boolean | null | undefined
}

/** Metadatos libres del log de auditoría (columna jsonb). */
export interface AccessLogMetadata {
  [key: string]: string | number | boolean | null | undefined
}

/* ================================================================== */
/* 3. Tipos de fila por tabla                                          */
/* ================================================================== */

export interface ProfileRow {
  id: string
  full_name: string
  email: string | null
  role: UserRole
  phone: string | null
  avatar_url: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ResidentRow {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  gender: ResidentGender
  room_number: string | null
  admission_date: string
  status: ResidentStatus
  allergies: string[]
  diagnoses: string[]
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VgiAssessmentRow {
  id: string
  resident_id: string
  assessment_date: string
  assessed_by: string | null
  barthel_index: number | null
  mmse_score: number | null
  mna_sf_score: number | null
  downton_score: number | null
  yesavage_score: number | null
  charlson_score: number | null
  frailty_level: FrailtyLevel | null
  clinical_summary: string | null
  recommendations: string[] | null
  created_at: string
  updated_at: string
}

export interface CarePlanRow {
  id: string
  resident_id: string
  title: string
  description: string | null
  goals: string[]
  start_date: string
  end_date: string | null
  review_date: string | null
  status: CarePlanStatus
  created_by: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

export interface CareTaskRow {
  id: string
  resident_id: string
  care_plan_id: string | null
  task_type: TaskType
  title: string
  description: string | null
  /** Hora del día en formato 'HH:mm:ss'. */
  scheduled_time: string
  days_of_week: number[]
  frequency: TaskFrequency
  assigned_to: string | null
  priority: TaskPriority
  status: TaskStatus
  effective_from: string
  effective_until: string | null
  /** Serie de recurrencia (migración 004): instancias creadas juntas comparten el mismo uuid. */
  recurrence_group_id: string
  /** La ejecución debe capturar signos vitales (migración 004). */
  requires_vitals: boolean
  /** La ejecución debe adjuntar fotografía de evidencia (migración 004). */
  requires_photo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TaskExecutionRow {
  id: string
  task_id: string
  executed_by: string | null
  executed_at: string
  outcome: ExecutionOutcome
  notes: string | null
  vital_signs: VitalSignsRecord
  created_at: string
}

export interface MedicationRow {
  id: string
  resident_id: string
  name: string
  generic_name: string | null
  presentation: string | null
  dosage: string
  route: MedicationRoute
  /** Horas del día en formato 'HH:mm:ss'. */
  schedule_times: string[]
  frequency: MedicationFrequency
  start_date: string
  end_date: string | null
  prescribed_by: string | null
  indications: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MedicationAdministrationRow {
  id: string
  medication_id: string
  administered_by: string | null
  administered_at: string
  scheduled_at: string | null
  dose_given: string
  route_used: MedicationRoute
  outcome: AdministrationOutcome
  adverse_reaction: boolean
  notes: string | null
  created_at: string
}

export interface AccessLogRow {
  id: number
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: AccessLogMetadata
  created_at: string
}

/* ================================================================== */
/* 4. Utilidades Insert / Update                                       */
/* ================================================================== */

/** Claves generadas por la base de datos (defaults/triggers). */
type GeneratedKeys = 'created_at' | 'updated_at'

/**
 * Tipo de inserción: omite las claves autogeneradas (`created_at`,
 * `updated_at`) del payload de insert.
 */
export type TablesInsert<T extends keyof DatabaseSchema> = Omit<
  DatabaseSchema[T]['Insert'],
  GeneratedKeys
>

/** Tipo de actualización: todos los campos opcionales. */
export type TablesUpdate<T extends keyof DatabaseSchema> = DatabaseSchema[T]['Update']

/** Tipo de fila leída desde la base de datos. */
export type Tables<T extends keyof DatabaseSchema> = DatabaseSchema[T]['Row']

/* ================================================================== */
/* 5. Esquema completo (formato compatible con Supabase)               */
/* ================================================================== */

interface ProfilesTable {
  Row: ProfileRow
  Insert: {
    id: string
    full_name?: string
    email?: string | null
    role?: UserRole
    phone?: string | null
    avatar_url?: string | null
    active?: boolean
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    full_name?: string
    email?: string | null
    role?: UserRole
    phone?: string | null
    avatar_url?: string | null
    active?: boolean
    created_at?: string
    updated_at?: string
  }
  Relationships: [{ foreignKey: 'id'; through: 'auth.users' }]
}

interface ResidentsTable {
  Row: ResidentRow
  Insert: {
    id?: string
    first_name: string
    last_name: string
    birth_date: string
    gender: ResidentGender
    room_number?: string | null
    admission_date?: string
    status?: ResidentStatus
    allergies?: string[]
    diagnoses?: string[]
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
    notes?: string | null
    created_by?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<Omit<ResidentsTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'created_by'; references: 'profiles.id' }
  ]
}

interface VgiAssessmentsTable {
  Row: VgiAssessmentRow
  Insert: {
    id?: string
    resident_id: string
    assessment_date?: string
    assessed_by?: string | null
    barthel_index?: number | null
    mmse_score?: number | null
    mna_sf_score?: number | null
    downton_score?: number | null
    yesavage_score?: number | null
    charlson_score?: number | null
    frailty_level?: FrailtyLevel | null
    clinical_summary?: string | null
    recommendations?: string[] | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<Omit<VgiAssessmentsTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'resident_id'; references: 'residents.id' },
    { foreignKey: 'assessed_by'; references: 'profiles.id' }
  ]
}

interface CarePlansTable {
  Row: CarePlanRow
  Insert: {
    id?: string
    resident_id: string
    title: string
    description?: string | null
    goals?: string[]
    start_date?: string
    end_date?: string | null
    review_date?: string | null
    status?: CarePlanStatus
    created_by?: string | null
    reviewed_by?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<Omit<CarePlansTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'resident_id'; references: 'residents.id' },
    { foreignKey: 'created_by'; references: 'profiles.id' },
    { foreignKey: 'reviewed_by'; references: 'profiles.id' }
  ]
}

interface CareTasksTable {
  Row: CareTaskRow
  Insert: {
    id?: string
    resident_id: string
    care_plan_id?: string | null
    task_type: TaskType
    title: string
    description?: string | null
    scheduled_time: string
    days_of_week?: number[]
    frequency?: TaskFrequency
    assigned_to?: string | null
    priority?: TaskPriority
    status?: TaskStatus
    effective_from?: string
    effective_until?: string | null
    recurrence_group_id?: string
    requires_vitals?: boolean
    requires_photo?: boolean
    created_by?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<Omit<CareTasksTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'resident_id'; references: 'residents.id' },
    { foreignKey: 'care_plan_id'; references: 'care_plans.id' },
    { foreignKey: 'assigned_to'; references: 'profiles.id' },
    { foreignKey: 'created_by'; references: 'profiles.id' }
  ]
}

interface TaskExecutionsTable {
  Row: TaskExecutionRow
  Insert: {
    id?: string
    task_id: string
    executed_by?: string | null
    executed_at?: string
    outcome: ExecutionOutcome
    notes?: string | null
    vital_signs?: VitalSignsRecord
    created_at?: string
  }
  Update: Partial<Omit<TaskExecutionsTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'task_id'; references: 'care_tasks.id' },
    { foreignKey: 'executed_by'; references: 'profiles.id' }
  ]
}

interface MedicationsTable {
  Row: MedicationRow
  Insert: {
    id?: string
    resident_id: string
    name: string
    generic_name?: string | null
    presentation?: string | null
    dosage: string
    route?: MedicationRoute
    schedule_times?: string[]
    frequency?: MedicationFrequency
    start_date?: string
    end_date?: string | null
    prescribed_by?: string | null
    indications?: string | null
    active?: boolean
    created_by?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: Partial<Omit<MedicationsTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'resident_id'; references: 'residents.id' },
    { foreignKey: 'created_by'; references: 'profiles.id' }
  ]
}

interface MedicationAdministrationsTable {
  Row: MedicationAdministrationRow
  Insert: {
    id?: string
    medication_id: string
    administered_by?: string | null
    administered_at?: string
    scheduled_at?: string | null
    dose_given: string
    route_used: MedicationRoute
    outcome?: AdministrationOutcome
    adverse_reaction?: boolean
    notes?: string | null
    created_at?: string
  }
  Update: Partial<Omit<MedicationAdministrationsTable['Insert'], 'id'>> & { id?: string }
  Relationships: [
    { foreignKey: 'medication_id'; references: 'medications.id' },
    { foreignKey: 'administered_by'; references: 'profiles.id' }
  ]
}

interface AccessLogsTable {
  Row: AccessLogRow
  Insert: {
    id?: never
    user_id?: string | null
    action: string
    entity_type?: string | null
    entity_id?: string | null
    ip_address?: string | null
    user_agent?: string | null
    metadata?: AccessLogMetadata
    created_at?: string
  }
  Update: Partial<Omit<AccessLogsTable['Insert'], 'id'>> & { id?: never }
  Relationships: [{ foreignKey: 'user_id'; references: 'profiles.id' }]
}

/** Mapa de tablas del esquema `public` de GeriCare. */
export interface DatabaseSchema {
  profiles: ProfilesTable
  residents: ResidentsTable
  vgi_assessments: VgiAssessmentsTable
  care_plans: CarePlansTable
  care_tasks: CareTasksTable
  task_executions: TaskExecutionsTable
  medications: MedicationsTable
  medication_administrations: MedicationAdministrationsTable
  access_logs: AccessLogsTable
}

/** Nombre literal de cada tabla pública. */
export type TableName = keyof DatabaseSchema

/** Parámetros de la RPC transaccional de planes de cuidado (migración 002). */
export interface CreateCarePlanWithTasksArgs {
  p_resident_id: string
  p_title: string
  p_description?: string | null
  p_goals?: string[]
  p_start_date?: string
  p_end_date?: string | null
  p_review_date?: string | null
  p_status?: CarePlanStatus
  p_tasks?: readonly Record<string, unknown>[]
}

/** Resultado de la RPC `create_care_plan_with_tasks`. */
export interface CreateCarePlanWithTasksResult {
  plan_id: string
  task_count: number
}

/** Esquema completo en el formato estándar de Supabase (`public.tables`). */
export interface Database {
  public: {
    Tables: DatabaseSchema
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_nurse_or_above: { Args: Record<string, never>; Returns: boolean }
      current_user_role: { Args: Record<string, never>; Returns: UserRole }
      create_care_plan_with_tasks: {
        Args: CreateCarePlanWithTasksArgs
        Returns: CreateCarePlanWithTasksResult
      }
    }
    Enums: {
      user_role: UserRole
      task_type: TaskType
      task_status: TaskStatus
      resident_status: ResidentStatus
      medication_route: MedicationRoute
    }
  }
}

/** Cliente Supabase tipado con el esquema de GeriCare. */
export type GeriCareClient = SupabaseClient<Database>

/* ================================================================== */
/* 6. Helpers de tipos para consultas frecuentes                       */
/* ================================================================== */

/** Residente + su última valoración geriátrica integral. */
export type ResidentWithLatestVgi = ResidentRow & {
  vgi_assessments: VgiAssessmentRow[]
}

/** Tarea con el nombre del profesional asignado. */
export type CareTaskWithAssignee = CareTaskRow & {
  assignee: Pick<ProfileRow, 'id' | 'full_name' | 'role'> | null
}

/** Medicación con el nombre completo del residente. */
export type MedicationWithResident = MedicationRow & {
  resident: Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'>
}
