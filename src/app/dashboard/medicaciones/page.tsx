import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fechaLocalISO, nombreResidente } from '@/lib/utils'
import {
  MEDICATION_FREQUENCY_LABELS,
  MEDICATION_ROUTE_LABELS,
  type MedicationRow,
  type ResidentRow,
} from '@/types'

export const metadata = {
  title: 'Kardex de medicación',
  description: 'Vista general de todos los tratamientos farmacológicos activos de la residencia.',
}

/** Depende de la sesión y de la fecha actual: se resuelve en cada petición. */
export const instant = false

type MedicacionConResidente = MedicationRow & {
  residents: Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'> | null
}

interface FilaKardex {
  medicationId: string
  nombre: string
  generico: string | null
  presentacion: string | null
  dosage: string
  via: string
  frecuencia: string
  /** Horas del día formateadas (HH:mm) para lectura rápida. */
  horarios: string[]
  inicio: string
  fin: string | null
  indicaciones: string | null
  residenteId: string
  residenteNombre: string
  habitacion: string | null
}

/** Normaliza las horas SQL ('HH:mm:ss') a 'HH:mm' ordenadas. */
function formatearHoras(scheduleTimes: string[]): string[] {
  return [...scheduleTimes]
    .map((h) => h.slice(0, 5))
    .sort()
}

interface ContenidoKardexProps {
  hoyIso: string
  soloActivos: boolean
}

/**
 * Consulta real del kardex (Fase 8): todas las medicaciones con su residente.
 * La visibilidad la decide la RLS de la Fase 1; aquí no se filtran datos por
 * cuenta propia más allá del estado activo/vencido mostrado como badge.
 */
async function ContenidoKardex({ hoyIso, soloActivos }: ContenidoKardexProps) {
  const supabase = await createClient()

  let consulta = supabase
    .from('medications')
    .select(
      '*, residents:residents!medications_resident_id_fkey(id, first_name, last_name, room_number)',
    )
    .order('name', { ascending: true })
    .limit(500)

  if (soloActivos) consulta = consulta.eq('active', true)

  const { data, error } = await consulta

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        No se pudo cargar el kardex: <span className="font-medium">{error.message}</span>
      </div>
    )
  }

  const filas: FilaKardex[] = (data ?? []).map((m) => {
    const med = m as unknown as MedicacionConResidente
    return {
      medicationId: med.id,
      nombre: med.name,
      generico: med.generic_name,
      presentacion: med.presentation,
      dosage: med.dosage,
      via: MEDICATION_ROUTE_LABELS[med.route],
      frecuencia: MEDICATION_FREQUENCY_LABELS[med.frequency],
      horarios: formatearHoras(med.schedule_times),
      inicio: med.start_date,
      fin: med.end_date,
      indicaciones: med.indications,
      residenteId: med.resident_id,
      residenteNombre: med.residents ? nombreResidente(med.residents) : 'Sin residente',
      habitacion: med.residents?.room_number ?? null,
    }
  })

  if (filas.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-slate-500">
          {soloActivos
            ? 'No hay tratamientos activos registrados todavía.'
            : 'No hay medicaciones registradas (o tu rol no puede verlas).'}
        </CardContent>
      </Card>
    )
  }

  // Agrupa por residente para lectura tipo kardex (una sección por persona).
  const porResidente = new Map<string, FilaKardex[]>()
  for (const f of filas) {
    const grupo = porResidente.get(f.residenteId) ?? []
    grupo.push(f)
    porResidente.set(f.residenteId, grupo)
  }

  return (
    <div className="space-y-6">
      {filas.length >= 40 && (
        <p className="text-xs text-slate-500">
          Mostrando las primeras {filas.length} medicaciones (límite de seguridad de 500 registros).
        </p>
      )}
      {[...porResidente.entries()].map(([residenteId, meds]) => {
        const primera = meds[0]
        return (
          <Card key={residenteId}>
            <CardHeader
              title={primera.residenteNombre}
              subtitle={
                primera.habitacion
                  ? `Habitación ${primera.habitacion} · ${meds.length} tratamiento${meds.length === 1 ? '' : 's'}`
                  : `${meds.length} tratamiento${meds.length === 1 ? '' : 's'}`
              }
              action={
                <Link
                  href={`/dashboard/residentes/${residenteId}/medicaciones`}
                  className="text-sm font-medium text-teal-700 hover:underline"
                >
                  Gestionar →
                </Link>
              }
            />
            <CardContent>
              <ul className="divide-y divide-slate-100">
                {meds.map((m) => {
                  const vencida = m.fin !== null && m.fin < hoyIso
                  return (
                    <li key={m.medicationId} className="flex flex-wrap items-start gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {m.nombre}{' '}
                          {m.generico ? (
                            <span className="font-normal text-slate-500">({m.generico})</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {m.dosage} · vía {m.via.toLowerCase()}
                          {m.presentacion ? ` · ${m.presentacion}` : ''}
                        </p>
                        {m.indicaciones ? (
                          <p className="mt-1 text-xs italic text-slate-500">{m.indicaciones}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Badge tone={vencida ? 'rose' : 'emerald'}>
                          {vencida ? 'Pauta vencida' : 'Activo'}
                        </Badge>
                        <p className="text-xs font-medium text-slate-600">{m.frecuencia}</p>
                        <p className="text-right text-xs tabular-nums text-slate-500">
                          {m.horarios.join(' · ')}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

interface KardexPageProps {
  searchParams: Promise<{ historico?: string }>
}

/**
 * Fase 8 — Kardex electrónico general: todos los tratamientos de la
 * residencia agrupados por residente, con horarios, vía y frecuencia.
 * Solo lectura: el alta/administración vive en la ficha del residente y en
 * «Administrar medicamentos» (DURO). Server Component: cero datos en cliente.
 */
export default async function KardexPage({ searchParams }: KardexPageProps) {
  await connection()
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const filtros = await searchParams
  const incluirHistorico = filtros?.historico === '1'
  const hoyIso = fechaLocalISO()

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kardex de medicación</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vista general de tratamientos por residente. Alta y administración se gestionan desde
            cada ficha o desde «Administrar medicamentos».
          </p>
        </div>
        <nav aria-label="Filtro de kardex" className="flex gap-2">
          <Link
            href="/dashboard/medicaciones"
            className={
              !incluirHistorico
                ? 'rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white'
                : 'rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50'
            }
          >
            Activos
          </Link>
          <Link
            href="/dashboard/medicaciones?historico=1"
            className={
              incluirHistorico
                ? 'rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white'
                : 'rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50'
            }
          >
            Con históricos
          </Link>
          <Link
            href="/dashboard/medicaciones/administrar"
            className="rounded-full border border-teal-300 bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-100"
          >
            Registrar toma DURO →
          </Link>
        </nav>
      </header>

      <Suspense fallback={<SkeletonTable filas={6} />}>
        <ContenidoKardex hoyIso={hoyIso} soloActivos={!incluirHistorico} />
      </Suspense>
    </div>
  )
}
