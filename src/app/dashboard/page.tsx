/**
 * GeriCare · Fase 2 — Dashboard principal (Server Component con datos reales)
 *
 * Cero datos simulados: todas las métricas provienen de consultas tipadas a
 * Supabase bajo RLS. El layout ya resolvió la sesión; aquí se vuelve a leer
 * mediante `obtenerSesionActiva()` (memoizada con `cache()` por petición).
 */

import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import {
  buildResidentFullName,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from '@/types'
import type { CareTaskRow, ResidentRow } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EstadoResidenteBadge, PrioridadBadge } from '@/components/ui/Badge'

export const metadata: Metadata = {
  title: 'Panel',
}

// Este dashboard depende de la sesión del usuario (cookies) y de consultas
// en tiempo real, por lo que no puede prerendererse de forma instantánea.
export const instant = false

/* --------------------------------------------------------------- */
/* Utilidades de fecha                                             */
/* --------------------------------------------------------------- */

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatearFecha(cadena: string): string {
  const fecha = new Date(`${cadena.slice(0, 10)}T00:00:00`)
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(fecha)
}

/* --------------------------------------------------------------- */
/* Consultas reales (paralelas)                                    */
/* --------------------------------------------------------------- */

interface DatosPanel {
  totalResidentes: number
  tareasPendientesHoy: number
  medicacionesActivas: number
  ultimosResidentes: ResidentRow[]
  urgentesAsignadas: CareTaskRow[]
}

async function cargarDatosPanel(userId: string): Promise<DatosPanel> {
  const supabase = await createClient()
  const hoy = hoyISO()

  const [
    residentes,
    pendientes,
    medicaciones,
    recientes,
    urgentes,
  ] = await Promise.all([
    supabase
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'activo'),

    supabase
      .from('care_tasks')
      .select('id', { count: 'exact', head: true })
      .in('status', ['programada', 'en_curso'])
      .lte('effective_from', hoy)
      .or(`effective_until.is.null,effective_until.gte.${hoy}`),

    supabase
      .from('medications')
      .select('id', { count: 'exact', head: true })
      .eq('active', true),

    supabase
      .from('residents')
      .select('*')
      .order('admission_date', { ascending: false })
      .limit(5),

    supabase
      .from('care_tasks')
      .select('*')
      .eq('assigned_to', userId)
      .eq('priority', 'urgente')
      .in('status', ['programada', 'en_curso'])
      .lte('effective_from', hoy)
      .or(`effective_until.is.null,effective_until.gte.${hoy}`)
      .order('scheduled_time', { ascending: true })
      .limit(8),
  ])

  // Si alguna consulta devuelve error de red/permisos, lo propagamos para
  // mostrar el estado de error controlado del panel.
  const errores = [residentes, pendientes, medicaciones, recientes, urgentes].find(
    (consulta) => consulta.error,
  )
  if (errores?.error) {
    throw new Error(errores.error.message)
  }

  return {
    totalResidentes: residentes.count ?? 0,
    tareasPendientesHoy: pendientes.count ?? 0,
    medicacionesActivas: medicaciones.count ?? 0,
    ultimosResidentes: recientes.data ?? [],
    urgentesAsignadas: urgentes.data ?? [],
  }
}

/* --------------------------------------------------------------- */
/* Página                                                          */
/* --------------------------------------------------------------- */

export default async function DashboardPage() {
  const sesion = await obtenerSesionActiva()

  // El layout ya protege la ruta; este guard es redundante pero seguro.
  if (!sesion) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent>
          <p className="text-sm text-amber-800">
            Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.
          </p>
        </CardContent>
      </Card>
    )
  }

  let datos: DatosPanel
  try {
    datos = await cargarDatosPanel(sesion.userId)
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">
          Hola, {sesion.perfil?.full_name ?? 'de nuevo'} 👋
        </h1>
        <Card className="border-red-200 bg-red-50">
          <CardContent>
            <p className="text-sm font-medium text-red-700">
              No pudimos cargar los datos del panel en este momento.
            </p>
            <p className="mt-1 text-xs text-red-600">
              Comprueba tu conexión o inténtalo de nuevo en unos segundos. El
              resto de la aplicación sigue disponible.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const nombrePila = sesion.perfil?.full_name.split(' ')[0] ?? 'colega'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Resumen del día
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Buenos días, {nombrePila}. Aquí tienes la situación actual de la
          residencia ({formatearFecha(hoyISO())}).
        </p>
      </div>

      {/* Tarjetas de resumen */}
      <section
        aria-label="Indicadores principales"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <TarjetaResumen
          titulo="Residentes activos"
          valor={datos.totalResidentes}
          detalle="Personas con estado «activo» en la residencia."
        />
        <TarjetaResumen
          titulo="Tareas pendientes hoy"
          valor={datos.tareasPendientesHoy}
          detalle="Programadas o en curso vigentes para hoy."
        />
        <TarjetaResumen
          titulo="Medicaciones activas"
          valor={datos.medicacionesActivas}
          detalle="Prescripciones vigentes en tratamiento."
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Últimos ingresos */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Últimos residentes ingresados</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {datos.ultimosResidentes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                Aún no hay residentes registrados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">
                        Nombre
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Habitación
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Ingreso
                      </th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.ultimosResidentes.map((residente) => (
                      <tr
                        key={residente.id}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-5 py-3 font-medium text-slate-900">
                          {buildResidentFullName(residente)}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {residente.room_number ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {formatearFecha(residente.admission_date)}
                        </td>
                        <td className="px-5 py-3">
                          <EstadoResidenteBadge estado={residente.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Urgentes asignadas al usuario */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tareas urgentes asignadas a ti</CardTitle>
          </CardHeader>
          <CardContent>
            {datos.urgentesAsignadas.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No tienes tareas urgentes pendientes. 🎉
              </p>
            ) : (
              <ul className="space-y-3">
                {datos.urgentesAsignadas.map((tarea) => (
                  <li
                    key={tarea.id}
                    className="rounded-lg border border-slate-100 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {tarea.title}
                      </p>
                      <PrioridadBadge prioridad={tarea.priority} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {TASK_TYPE_LABELS[tarea.task_type]} ·{' '}
                      {tarea.scheduled_time.slice(0, 5)} h ·{' '}
                      {TASK_STATUS_LABELS[tarea.status]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- */
/* Subcomponentes                                                  */
/* --------------------------------------------------------------- */

function TarjetaResumen({
  titulo,
  valor,
  detalle,
}: {
  titulo: string
  valor: number
  detalle: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
        <p className="text-3xl font-bold tabular-nums text-slate-900">
          {valor.toLocaleString('es-ES')}
        </p>
        <p className="text-xs text-slate-400">{detalle}</p>
      </CardContent>
    </Card>
  )
}
