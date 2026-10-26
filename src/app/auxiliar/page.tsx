import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { fechaLocalISO, tareaProgramadaParaElDia, nombreResidente } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import type { CareTaskRow, ResidentRow, TareaMovilAuxiliar } from '@/types'
import { AuxiliarTareasList } from '@/components/auxiliar/auxiliar-tareas-list'

export const metadata = {
  title: 'Mi turno',
  description: 'Tareas asignadas de hoy para ejecución en dispositivo móvil.',
}

/** Depende de la sesión y de la fecha actual: se resuelve en cada petición. */
export const instant = false

type ResidenteCompacto = Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'>
interface TareaConsulta extends CareTaskRow {
  residents: ResidenteCompacto | null
}

/**
 * FASE 7 — Vista móvil del auxiliar (CRÍTICA).
 * ------------------------------------------------------------------
 * Ruta protegida fuera del layout de escritorio: pantalla completa,
 * pensada para 375–430 px y operación con una sola mano. Muestra las
 * tareas de HOY asignadas directamente al usuario; los roles superiores
 * (enfermera jefe/médico/admin) también pueden usarla como supervisor.
 * Los datos se consultan aquí (RSC) y se serializan a la lista cliente.
 */
export default async function AuxiliarPage() {
  await connection()
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const fechaIso = fechaLocalISO()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-slate-100">
      {/* Cabecera fija compacta con identidad del turno */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-teal-800 px-4 py-3 text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-200">GeriCare · Mi turno</p>
            <h1 className="text-lg font-bold leading-tight">
              {sesion.perfil ? `${sesion.perfil.full_name}` : 'Auxiliar'}
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="min-h-14 inline-flex items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white transition-colors active:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Panel
          </Link>
        </div>
        <p className="mt-1 text-xs text-teal-200">
          Fecha: {new Date(`${fechaIso}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      <section className="px-4 py-5">
        <Suspense fallback={<ListaEsqueleto />}>
          <ContenidoTareas userId={sesion.userId} fechaIso={fechaIso} />
        </Suspense>
      </section>
    </main>
  )
}

/** Esqueleto de carga mientras el Server Component resuelve la consulta. */
function ListaEsqueleto() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando tareas">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-3 h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="mt-4 h-14 w-full rounded-2xl" />
        </div>
      ))}
    </div>
  )
}

interface ContenidoProps {
  userId: string
  fechaIso: string
}

async function ContenidoTareas({ userId, fechaIso }: ContenidoProps) {
  const supabase = await createClient()

  // Solo tareas pendientes/en curso ASIGNADAS a este usuario, ordenadas por hora.
  const { data: tareasRaw, error } = await supabase
    .from('care_tasks')
    .select(
      '*, residents:residents!care_tasks_resident_id_fkey(id, first_name, last_name, room_number)',
    )
    .eq('assigned_to', userId)
    .in('status', ['programada', 'en_curso'])
    .order('scheduled_time', { ascending: true })
    .limit(100)

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800" role="alert">
        No se pudo cargar tu agenda: <span className="font-medium">{error.message}</span>. Verifica tu conexión e inténtalo de nuevo.
      </div>
    )
  }

  // La ventana efectiva y los días de la semana se filtran en memoria con el
  // helper canónico (misma lógica que la agenda de escritorio → una sola fuente).
  const tareas: TareaMovilAuxiliar[] = (tareasRaw ?? [])
    .map((t) => t as unknown as TareaConsulta)
    .filter((t) => tareaProgramadaParaElDia(t, fechaIso))
    .map((t) => ({
      id: t.id,
      title: t.title,
      task_type: t.task_type,
      scheduled_time: t.scheduled_time,
      requires_vitals: t.requires_vitals,
      requires_photo: t.requires_photo,
      resident_name: t.residents ? nombreResidente(t.residents) : 'Residente no disponible',
      room_number: t.residents?.room_number ?? null,
    }))

  return <AuxiliarTareasList tareas={tareas} />
}
