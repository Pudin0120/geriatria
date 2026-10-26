import type { ReactNode } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton'
import { Suspense } from 'react'
import {
  PriorityBadge,
  ResidentStatusBadge,
  TaskStatusBadge,
} from '@/components/ui/Badge'
import {
  buildResidentFullName,
  TASK_TYPE_LABELS,
  type CareTaskRow,
  type ResidentRow,
} from '@/types'
import { calcularEdad, fechaLocalISO, formatearFecha, horaCorta } from '@/lib/utils'

export const metadata = {
  title: 'Resumen',
  description: 'Métricas del día y actividad reciente de la residencia.',
}

/* ================================================================== */
/* Página principal del panel (Server Component con datos reales)      */
/* ================================================================== */

export default async function DashboardPage() {
  await connection()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  if (sesion.rol === 'familiar') {
    return <ResumenFamiliar nombre={sesion.perfil?.full_name ?? 'Familiar'} />
  }

  return (
    <div className="space-y-7">
      <header className="relative overflow-hidden rounded-3xl border border-[#dce9e0] bg-gradient-to-br from-white via-white to-[#e9f3ed] px-5 py-6 sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full border-[34px] border-[#dcebe2]/70" />
        <div className="relative">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#548477]">Resumen de la residencia</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Buen día, {sesion.perfil?.full_name.split(' ')[0] ?? 'colega'} 👋
        </h1>
        <p className="mt-2 text-sm text-[#71817c]">
          Una vista clara de la actividad y las prioridades de cuidado.
        </p>
        </div>
      </header>

      {/* Los datos se resuelven en streaming bajo cacheComponents/PPR. */}
      <Suspense fallback={<ContenidoEsqueleto />}>
        <ContenidoDashboard userId={sesion.userId} rol={sesion.rol} />
      </Suspense>
    </div>
  )
}

async function ResumenFamiliar({ nombre }: { nombre: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_linked_resident_summaries')
  const residentes: Array<{ id: string; first_name: string; last_name: string; room_number: string | null; status: string }> = data ?? []
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[#dce9e0] bg-gradient-to-br from-white to-[#e9f3ed] px-5 py-7 sm:px-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#548477]">GeriCare · Portal familiar</p><h1>Hola, {nombre.split(' ')[0]}</h1><p className="mt-2 text-sm text-[#71817c]">Resumen de la persona residente vinculada a tu cuenta.</p>
      </header>
      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">No se pudo cargar el resumen. Contacta con la administración.</p> : null}
      {residentes.map((residente) => <Card key={residente.id} className="max-w-2xl"><CardHeader title={`${residente.first_name} ${residente.last_name}`} subtitle={residente.room_number ? `Habitación ${residente.room_number}` : 'Habitación no asignada'} /><CardContent><p className="text-sm text-slate-600">Estado: {residente.status}</p></CardContent></Card>)}
      {!error && residentes.length === 0 ? <Card className="max-w-2xl border-dashed"><CardContent><p className="text-sm font-medium text-slate-700">No hay un residente vinculado a esta cuenta.</p><p className="mt-1 text-sm text-slate-500">Contacta con la administración para completar la asignación.</p></CardContent></Card> : null}
    </div>
  )
}

function ContenidoEsqueleto() {
  return (
    <div className="space-y-6">
      <SkeletonStats cantidad={4} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SkeletonTable filas={5} />
        <SkeletonTable filas={4} />
      </div>
    </div>
  )
}

/* ================================================================== */
/* Consulta real de datos (RLS aplica según el rol del usuario)        */
/* ================================================================== */

interface ContenidoProps {
  userId: string
  rol: Awaited<ReturnType<typeof obtenerSesionActiva>> extends null
    ? never
    : NonNullable<Awaited<ReturnType<typeof obtenerSesionActiva>>>['rol']
}

async function ContenidoDashboard({ userId }: ContenidoProps) {
  const supabase = await createClient()
  const hoy = fechaLocalISO()

  // 1) Total de residentes activos
  const { count: residentesActivos, error: errResidentes } = await supabase
    .from('residents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'activo')

  // 2) Tareas pendientes hoy (programadas o en curso, vigentes a la fecha)
  const { count: tareasPendientesHoy, error: errTareasConteo } = await supabase
    .from('care_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['programada', 'en_curso'])
    .lte('effective_from', hoy)
    .or(`effective_until.is.null,effective_until.gte.${hoy}`)

  // 3) Medicaciones activas
  const { count: medicacionesActivas, error: errMedicacion } = await supabase
    .from('medications')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)

  // 4) Últimos 5 residentes ingresados
  const { data: ultimosResidentes, error: errUltimos } = await supabase
    .from('residents')
    .select('*')
    .order('admission_date', { ascending: false })
    .limit(5)
    .returns<ResidentRow[]>()

  // 5) Tareas urgentes asignadas al usuario actual
  const { data: tareasUrgentes, error: errUrgentes } = await supabase
    .from('care_tasks')
    .select('*')
    .eq('assigned_to', userId)
    .in('status', ['programada', 'en_curso'])
    .in('priority', ['urgente', 'alta'])
    .order('scheduled_time', { ascending: true })
    .limit(8)
    .returns<CareTaskRow[]>()

  const errores = [
    errResidentes,
    errTareasConteo,
    errMedicacion,
    errUltimos,
    errUrgentes,
  ].find((e) => e !== null)

  if (errores) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardContent>
          <p className="text-sm font-medium text-rose-700">
            No fue posible cargar los datos del panel:{' '}
            {errores.message || 'error desconocido de conexión.'}
          </p>
          <p className="mt-1 text-xs text-rose-600">
            Verifica que la migración esté aplicada y tu sesión siga activa.
          </p>
        </CardContent>
      </Card>
    )
  }

  const residentes = ultimosResidentes ?? []
  const urgentes = tareasUrgentes ?? []

  return (
    <div className="space-y-6">
      {/* Tarjetas de resumen */}
      <section
        aria-label="Métricas principales"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <TarjetaMetrica
          etiqueta="Residentes activos"
          valor={residentesActivos ?? 0}
          detalle="Con estado activo en la residencia"
          color="text-teal-700"
        />
        <TarjetaMetrica
          etiqueta="Tareas pendientes hoy"
          valor={tareasPendientesHoy ?? 0}
          detalle="Programadas o en curso a la fecha"
          color="text-sky-700"
        />
        <TarjetaMetrica
          etiqueta="Urgentes asignadas a ti"
          valor={urgentes.length}
          detalle="Prioridad alta u urgente sin completar"
          color="text-rose-700"
        />
        <TarjetaMetrica
          etiqueta="Medicaciones activas"
          valor={medicacionesActivas ?? 0}
          detalle="Esquemas vigentes en tratamiento"
          color="text-violet-700"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Tabla últimos residentes */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="Últimos residentes ingresados"
            subtitle="Los 5 más recientes por fecha de ingreso"
          />
          <CardContent className="px-0 py-0">
            {residentes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                Aún no hay residentes registrados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Residente
                      </th>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Habitación
                      </th>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Ingreso
                      </th>
                      <th scope="col" className="px-5 py-3 font-semibold">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {residentes.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">
                            {buildResidentFullName(r)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {calcularEdad(r.birth_date)} años ·{' '}
                            {r.diagnoses[0] ?? 'Sin diagnóstico registrado'}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {r.room_number ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {formatearFecha(r.admission_date)}
                        </td>
                        <td className="px-5 py-3">
                          <ResidentStatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tareas urgentes del usuario */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Tareas urgentes asignadas a ti"
            subtitle="Prioridad alta u pendiente de ejecución"
          />
          <CardContent className="px-0 py-0">
            {urgentes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No tienes tareas urgentes pendientes. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {urgentes.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {t.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {TASK_TYPE_LABELS[t.task_type]} ·{' '}
                        {horaCorta(t.scheduled_time)} h
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <PriorityBadge priority={t.priority} />
                      <TaskStatusBadge status={t.status} />
                    </div>
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

interface TarjetaMetricaProps {
  etiqueta: string
  valor: number
  detalle: string
  color: string
}

function TarjetaMetrica({ etiqueta, valor, detalle, color }: TarjetaMetricaProps): ReactNode {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {etiqueta}
        </p>
        <p className={`mt-2 text-3xl font-bold tabular-nums ${color}`}>{valor}</p>
        <p className="mt-1 text-xs text-slate-500">{detalle}</p>
      </CardContent>
    </Card>
  )
}
