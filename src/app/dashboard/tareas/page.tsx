import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fechaLocalISO, tareaProgramadaParaElDia } from '@/lib/utils'
import type {
  AdministrationOutcome,
  CareTaskRow,
  ExecutionOutcome,
  MedicationRow,
  ResidentRow,
} from '@/types'
import {
  AgendaTareasClient,
  type AdministracionHoy,
  type AgendaInicial,
  type DosisDeHoy,
  type MedicacionConResidente,
  type TareaDelDia,
} from './agenda-client'

export const metadata = {
  title: 'Tareas del día',
  description: 'Agenda clínica diaria: tareas programadas y medicación del turno.',
}

/** Depende de la sesión y de la fecha actual: se resuelve en cada petición. */
export const instant = false

type ResidenteAgenda = Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'>

interface TareaConsulta extends CareTaskRow {
  residents: ResidenteAgenda | null
}

interface MedicacionConsulta extends MedicationRow {
  residents: ResidenteAgenda | null
}

interface TareasPageProps {
  searchParams: Promise<{ fecha?: string }>
}

/** Valida y normaliza el parámetro `fecha` (YYYY-MM-DD); por defecto, hoy. */
function fechaSegura(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return fechaLocalISO()
}

/**
 * Página global «Tareas del Día» (Fase 4): agenda de hoy agrupada por hora,
 * con tarjetas de tarea, acción rápida de ejecución (modal) y bloque DURO
 * del día para enfermería/auxiliares. Los datos se consultan aquí (RSC) y
 * se pasan serializados al cliente interactivo.
 */
export default async function TareasPage({ searchParams }: TareasPageProps) {
  await connection()
  const filtros = await searchParams
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const fechaIso = fechaSegura(filtros?.fecha)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tareas del día</h1>
          <p className="mt-1 text-sm text-slate-500">
            Agenda clínica de hoy: marca las tareas completadas y registra la medicación administrada.
          </p>
        </div>
        {PUEDE_PLANIFICAR.includes(sesion.rol) ? (
          <Link
            href="/dashboard/tareas/nuevo"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            + Nueva tarea
          </Link>
        ) : null}
      </header>

      <Suspense fallback={<SkeletonTable filas={6} />}>
        <ContenidoAgenda fechaIso={fechaIso} rol={sesion.rol} />
      </Suspense>
    </div>
  )
}

/** Roles que pueden planificar/crear tareas (Fase 6). */
const PUEDE_PLANIFICAR: readonly string[] = ['admin', 'nurse_jefe', 'medico']

/* ------------------------------------------------------------------ */
/* Consulta agregada de la agenda diaria                               */
/* ------------------------------------------------------------------ */

interface ContenidoProps {
  fechaIso: string
  rol: string
}

async function ContenidoAgenda({ fechaIso, rol }: ContenidoProps) {
  const supabase = await createClient()
  const inicio = `${fechaIso}T00:00:00`
  const fin = `${fechaIso}T23:59:59.999`

  // 1. Tareas operativas vigentes (la ventana efectiva y los días de la
  //    semana se filtran en memoria con el helper canónico).
  const { data: tareasRaw, error: errTareas } = await supabase
    .from('care_tasks')
    .select(
      '*, residents:residents!care_tasks_resident_id_fkey(id, first_name, last_name, room_number)',
    )
    .in('status', ['pending', 'in_progress'])
    .order('scheduled_time', { ascending: true })
    .limit(500)

  if (errTareas) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        No se pudo cargar la agenda de hoy: <span className="font-medium">{errTareas.message}</span>
      </div>
    )
  }

  const tareasHoy: TareaDelDia[] = (tareasRaw ?? [])
    .map((t) => t as unknown as TareaConsulta)
    .filter((t) => tareaProgramadaParaElDia(t, fechaIso))
    .map((t) => ({ ...t }))

  // 2. Ejecuciones registradas hoy (bitácora → feedback inmediato en tarjetas).
  const { data: ejecucionesRaw } = await supabase
    .from('task_executions')
    .select('task_id, outcome, executed_at')
    .gte('executed_at', inicio)
    .lte('executed_at', fin)
  const ejecucionesHoy: AdministracionHoy[] = (ejecucionesRaw ?? []).map((e) => ({
    task_id: e.task_id,
    outcome: String(e.outcome) as ExecutionOutcome,
    administered_at: e.executed_at,
  }))

  // 3. Medicaciones activas que ya pueden administrarse hoy.
  const { data: medicacionesRaw } = await supabase
    .from('medications')
    .select(
      '*, residents:residents!medications_resident_id_fkey(id, first_name, last_name, room_number)',
    )
    .eq('active', true)
    .lte('start_date', fechaIso)
    .order('name', { ascending: true })
    .limit(500)
  const medicaciones: MedicacionConResidente[] = (medicacionesRaw ?? [])
    .map((m) => m as unknown as MedicacionConsulta)
    .filter((m) => !(m.end_date !== null && m.end_date < fechaIso))
    .map((m) => ({ ...m }))

  // 4. Dosis DURO administradas hoy (para pintar el semáforo por toma).
  const { data: adminRaw } = await supabase
    .from('medication_administrations')
    .select('medication_id, scheduled_at, outcome, administered_at')
    .gte('administered_at', inicio)
    .lte('administered_at', fin)
  const administracionesHoy: DosisDeHoy[] = (adminRaw ?? []).map((a) => ({
    medication_id: a.medication_id,
    scheduled_at: a.scheduled_at,
    outcome: String(a.outcome) as AdministrationOutcome,
    administered_at: a.administered_at,
  }))

  const inicial: AgendaInicial = {
    fechaIso,
    tareas: tareasHoy,
    ejecucionesHoy,
    medicaciones,
    administracionesHoy,
    puedeAdministrar: ['admin', 'nurse_jefe', 'medico', 'auxiliar'].includes(rol),
  }

  return <AgendaTareasClient inicial={inicial} />
}
