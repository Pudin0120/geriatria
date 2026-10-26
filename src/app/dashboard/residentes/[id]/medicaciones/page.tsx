import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { Button } from '@/components/ui/Button'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fechaLocalISO } from '@/lib/utils'
import type { MedicationRow, ResidentRow } from '@/types'
import type { DosisDeHoy, MedicacionConResidente } from '@/app/dashboard/tareas/agenda-client'
import { MedicacionesCliente } from './medicaciones-client'

export const metadata = {
  title: 'Medicaciones',
  description: 'Tratamientos medicamentosos activos del residente.',
}

/** Los metadatos dependen de la sesión (cookies): se resuelven en runtime. */
export const instant = false

/** Verifica formato UUID antes de consultar la BD. */
function esUuid(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

interface MedicacionesPageProps {
  params: Promise<{ id: string }>
}

/**
 * Página de medicaciones de un residente (Fase 4): tabla de tratamientos
 * (nombre, dosis, vía, horarios) con badges de estado, formulario de nueva
 * prescripción (`/nueva`) y registro rápido DURO por toma.
 */
export default async function MedicacionesPage({ params }: MedicacionesPageProps) {
  await connection()
  const { id } = await params
  if (!esUuid(id)) notFound()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const puedePrescribir = ['admin', 'nurse_jefe', 'medico'].includes(sesion.rol)
  const puedeAdministrar = ['admin', 'nurse_jefe', 'enfermeria'].includes(sesion.rol)

  return (
    <div className="space-y-6">
      <nav aria-label="Migas de navegación">
        <ol className="flex items-center gap-2 text-sm text-slate-500">
          <li>
            <Link href="/dashboard/residentes" className="hover:text-teal-700 hover:underline">
              Residentes
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href={`/dashboard/residentes/${id}`} className="hover:text-teal-700 hover:underline">
              Ficha del residente
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li className="font-medium text-slate-700">Medicaciones</li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Medicaciones</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tratamientos del residente con sus horarios.{' '}
            <Link href="/dashboard/medicaciones/administrar" className="font-medium text-teal-700 hover:underline">
              Vista de administración del turno →
            </Link>
          </p>
        </div>
        {puedePrescribir ? (
          <Link href={`/dashboard/residentes/${id}/medicaciones/nueva`}>
            <Button size="sm">+ Nueva prescripción</Button>
          </Link>
        ) : null}
      </header>

      <Suspense fallback={<SkeletonTable filas={5} />}>
        <ContenidoMedicaciones
          id={id}
          puedePrescribir={puedePrescribir}
          puedeAdministrar={puedeAdministrar}
        />
      </Suspense>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Consulta y renderizado                                              */
/* ------------------------------------------------------------------ */

interface ContenidoProps {
  id: string
  puedePrescribir: boolean
  puedeAdministrar: boolean
}

async function ContenidoMedicaciones({ id, puedePrescribir, puedeAdministrar }: ContenidoProps) {
  const supabase = await createClient()
  const hoyIso = fechaLocalISO()

  const { data: residente } = await supabase
    .from('residents')
    .select('id, first_name, last_name')
    .eq('id', id)
    .maybeSingle<Pick<ResidentRow, 'id' | 'first_name' | 'last_name'>>()
  if (!residente) notFound()

  // Todos los tratamientos (activos e inactivos): el badge indica el estado.
  const { data: medsRaw, error } = await supabase
    .from('medications')
    .select('*')
    .eq('resident_id', id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        No se pudieron cargar las medicaciones: <span className="font-medium">{error.message}</span>
      </div>
    )
  }

  const medicaciones: MedicacionConResidente[] = (medsRaw ?? []).map((m) => ({
    ...(m as unknown as MedicationRow),
    residents: { ...residente, room_number: null },
  }))

  // Dosis DURO registradas hoy para pintar el semáforo por toma.
  const ids = medicaciones.map((m) => m.id)
  let administracionesHoy: DosisDeHoy[] = []
  if (ids.length > 0) {
    const { data } = await supabase
      .from('medication_administrations')
      .select('medication_id, scheduled_at, outcome, administered_at')
      .in('medication_id', ids)
      .gte('administered_at', `${hoyIso}T00:00:00`)
      .lte('administered_at', `${hoyIso}T23:59:59.999`)
    administracionesHoy = (data ?? []).map((a) => ({
      medication_id: a.medication_id,
      scheduled_at: a.scheduled_at,
      outcome: String(a.outcome) as DosisDeHoy['outcome'],
      administered_at: a.administered_at,
    }))
  }

  return (
    <MedicacionesCliente
      residentId={id}
      hoyIso={hoyIso}
      medicaciones={medicaciones}
      administracionesHoy={administracionesHoy}
      puedePrescribir={puedePrescribir}
      puedeAdministrar={puedeAdministrar}
    />
  )
}
