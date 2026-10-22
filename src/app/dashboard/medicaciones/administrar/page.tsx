import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fechaLocalISO, nombreResidente } from '@/lib/utils'
import { MEDICATION_ROUTE_LABELS, type AdministrationOutcome, type MedicationRow, type ResidentRow } from '@/types'
import { AdministracionClient, type RegistroDosis, type TomaPendiente } from './administrar-client'

export const metadata = {
  title: 'Administración de medicamentos',
  description: 'DURO del turno: tomas pendientes y registro rápido de administración.',
}

/** Depende de la sesión y de la hora actual: se resuelve en cada petición. */
export const instant = false

interface AdministrarPageProps {
  searchParams: Promise<{ turno?: string }>
}

type TurnoNombre = 'manana' | 'tarde' | 'noche'

const TURNOS: Record<TurnoNombre, { label: string; desde: number; hasta: number; icono: string }> = {
  manana: { label: 'Mañana (07–15)', desde: 7, hasta: 15, icono: '☀️' },
  tarde: { label: 'Tarde (15–22)', desde: 15, hasta: 22, icono: '🌆' },
  noche: { label: 'Noche (22–07)', desde: 22, hasta: 7, icono: '🌙' },
}

function turnoDeHora(h: number): TurnoNombre {
  if (h >= 7 && h < 15) return 'manana'
  if (h >= 15 && h < 22) return 'tarde'
  return 'noche'
}

/**
 * Vista «Administrar medicación» (Fase 4) para enfermería y auxiliares:
 * lista las tomas DURO pendientes del turno con botón grande por toma
 * (modal rápido con dosis, hora real y reacción adversa).
 */
export default async function AdministrarPage({ searchParams }: AdministrarPageProps) {
  await connection()
  const filtros = await searchParams
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!['admin', 'nurse_jefe', 'medico', 'auxiliar'].includes(sesion.rol)) {
    redirect('/dashboard/tareas')
  }

  const hoyIso = fechaLocalISO()
  const turnoParam: TurnoNombre =
    filtros?.turno === 'manana' || filtros?.turno === 'tarde' || filtros?.turno === 'noche'
      ? filtros.turno
      : turnoDeHora(new Date().getHours())

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Administración de medicamentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registro DURO del turno. Marca cada toma al administrarla; usa ✕ si se omite o rechaza.
          </p>
        </div>
        <Link href="/dashboard/tareas" className="text-sm font-medium text-teal-700 hover:underline">
          Ver agenda completa del día →
        </Link>
      </header>

      {/* Selector de turno */}
      <nav aria-label="Turno" className="flex flex-wrap gap-2">
        {(Object.keys(TURNOS) as TurnoNombre[]).map((t) => (
          <Link
            key={t}
            href={`/dashboard/medicaciones/administrar?turno=${t}`}
            className={
              t === turnoParam
                ? 'rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white'
                : 'rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50'
            }
            aria-current={t === turnoParam ? 'true' : undefined}
          >
            {TURNOS[t].icono} {TURNOS[t].label}
          </Link>
        ))}
      </nav>

      <Suspense fallback={<SkeletonTable filas={6} />}>
        <ContenidoAdministrar hoyIso={hoyIso} turno={turnoParam} />
      </Suspense>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Consulta de tomas pendientes                                        */
/* ------------------------------------------------------------------ */

interface ContenidoProps {
  hoyIso: string
  turno: TurnoNombre
}

async function ContenidoAdministrar({ hoyIso, turno }: ContenidoProps) {
  const supabase = await createClient()

  const { data: medsRaw, error } = await supabase
    .from('medications')
    .select(
      '*, residents:residents!medications_resident_id_fkey(id, first_name, last_name, room_number)',
    )
    .eq('active', true)
    .lte('start_date', hoyIso)
    .order('name', { ascending: true })
    .limit(500)

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        No se pudieron cargar las medicaciones: <span className="font-medium">{error.message}</span>
      </div>
    )
  }

  // Expande cada tratamiento activo en sus tomas del turno seleccionado.
  const rango = TURNOS[turno]
  const tomas: TomaPendiente[] = []
  for (const m of medsRaw ?? []) {
    const med = m as unknown as MedicationRow & {
      residents: Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'> | null
    }
    if (med.end_date !== null && med.end_date < hoyIso) continue
    for (const h of [...med.schedule_times].sort()) {
      const horaNum = Number(h.slice(0, 2))
      const enTurno =
        rango.desde < rango.hasta
          ? horaNum >= rango.desde && horaNum < rango.hasta
          : horaNum >= rango.desde || horaNum < rango.hasta
      if (!enTurno) continue
      tomas.push({
        medication_id: med.id,
        name: med.name,
        dosage: med.dosage,
        route: med.route,
        routeLabel: MEDICATION_ROUTE_LABELS[med.route],
        scheduled_at: `${hoyIso.slice(0, 10)}T${h.slice(0, 5)}`,
        resident: med.residents ? { ...med.residents, nombre: nombreResidente(med.residents) } : null,
      })
    }
  }

  // Registros DURO de hoy para marcar qué tomas ya están cubiertas.
  const { data: adminRaw } = await supabase
    .from('medication_administrations')
    .select('medication_id, scheduled_at, outcome, administered_at')
    .gte('administered_at', `${hoyIso}T00:00:00`)
    .lte('administered_at', `${hoyIso}T23:59:59.999`)
  const registros: RegistroDosis[] = (adminRaw ?? []).map((a) => ({
    medication_id: a.medication_id,
    scheduled_at: a.scheduled_at,
    outcome: String(a.outcome) as AdministrationOutcome,
    administered_at: a.administered_at,
  }))

  return <AdministracionClient hoyIso={hoyIso} turnoLabel={`${rango.icono} ${rango.label}`} tomas={tomas} registros={registros} />
}
