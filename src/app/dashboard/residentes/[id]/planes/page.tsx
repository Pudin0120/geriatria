import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { Badge, PriorityBadge, TaskStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { TASK_TYPE_LABELS } from '@/types'
import type { CarePlanRow, CareTaskRow } from '@/types'
import { fechaLocalISO, formatearFecha, horaCorta } from '@/lib/utils'

export const metadata = {
  title: 'Planes de cuidado',
  description: 'Planes de cuidado activos y sus tareas recurrentes.',
}

/** Los metadatos dependen de la sesión (cookies): se resuelven en runtime. */
export const instant = false

/** Verifica formato UUID antes de consultar la BD. */
function esUuid(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

interface PlanesPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ver?: string }>
}

/**
 * Página de planes de cuidado de un residente (Fase 4).
 * Lista los planes con sus tareas recurrentes y ofrece la creación de un
 * nuevo plan (página separada `/planes/nuevo`) que define las tareas en el
 * propio formulario.
 */
export default async function PlanesPage({ params, searchParams }: PlanesPageProps) {
  await connection()
  const { id } = await params
  if (!esUuid(id)) notFound()

  const filtros = await searchParams
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const puedeCrear = ['admin', 'nurse_jefe', 'medico'].includes(sesion.rol)
  const mostrarTodos = filtros?.ver === 'todos'

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
          <li className="font-medium text-slate-700">Planes de cuidado</li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Planes de cuidado</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mostrarTodos
              ? 'Histórico completo de planes del residente.'
              : 'Planes activos o pausados con sus tareas recurrentes.'}{' '}
            <Link href="/dashboard/tareas" className="font-medium text-teal-700 hover:underline">
              Ver tareas del día →
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={mostrarTodos ? `/dashboard/residentes/${id}/planes` : `/dashboard/residentes/${id}/planes?ver=todos`}
          >
            <Button variant="secondary" size="sm">
              {mostrarTodos ? 'Solo activos' : 'Ver historial'}
            </Button>
          </Link>
          {puedeCrear ? (
            <Link href={`/dashboard/residentes/${id}/planes/nuevo`}>
              <Button size="sm">+ Nuevo plan</Button>
            </Link>
          ) : null}
        </div>
      </header>

      <Suspense fallback={<SkeletonTable filas={4} />}>
        <ContenidoPlanes id={id} mostrarTodos={mostrarTodos} />
      </Suspense>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Consulta y renderizado                                              */
/* ------------------------------------------------------------------ */

interface ContenidoProps {
  id: string
  mostrarTodos: boolean
}

async function ContenidoPlanes({ id, mostrarTodos }: ContenidoProps) {
  const supabase = await createClient()

  let consultaPlanes = supabase
    .from('care_plans')
    .select('*')
    .eq('resident_id', id)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!mostrarTodos) {
    consultaPlanes = consultaPlanes.in('status', ['activo', 'pausado'])
  }
  const { data: planes, error: errorPlanes } = await consultaPlanes.returns<CarePlanRow[]>()

  if (errorPlanes) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardContent>
          <p className="text-sm font-medium text-rose-700">
            No se pudieron cargar los planes: {errorPlanes.message}
          </p>
        </CardContent>
      </Card>
    )
  }

  const listaPlanes = planes ?? []
  if (listaPlanes.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-medium text-slate-600">
              {mostrarTodos
                ? 'Este residente no tiene planes de cuidado registrados.'
                : 'Sin planes activos ni pausados.'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Crea un plan con sus tareas recurrentes desde «Nuevo plan» para organizar los cuidados diarios.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Tareas asociadas a los planes mostrados + nombres de responsables.
  const planIds = listaPlanes.map((p) => p.id)
  const { data: tareas } = await supabase
    .from('care_tasks')
    .select('*')
    .in('care_plan_id', planIds)
    .neq('status', 'cancelada')
    .order('scheduled_time', { ascending: true })
    .returns<CareTaskRow[]>()

  const asignados = Array.from(
    new Set((tareas ?? []).map((t) => t.assigned_to).filter((x): x is string => x !== null)),
  )
  let nombres = new Map<string, string>()
  if (asignados.length > 0) {
    const { data: perfiles } = await supabase.rpc('get_staff_display_names', { target_profile_ids: asignados })
    nombres = new Map((perfiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]))
  }

  const hoy = fechaLocalISO()

  return (
    <div className="space-y-5">
      {listaPlanes.map((plan) => {
        const tareasPlan = (tareas ?? []).filter((t) => t.care_plan_id === plan.id)
        return (
          <CarePlanCard key={plan.id} plan={plan} hoyIso={hoy}>
            {tareasPlan.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-400">Este plan no tiene tareas vigentes.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {tareasPlan.map((tarea) => (
                  <li key={tarea.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <span className="w-14 shrink-0 text-sm font-bold tabular-nums text-slate-800">
                      {horaCorta(tarea.scheduled_time)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{tarea.title}</span>
                    <Badge tone="slate">{TASK_TYPE_LABELS[tarea.task_type]}</Badge>
                    <PriorityBadge priority={tarea.priority} />
                    <span className="text-xs text-slate-400">{diasSemanaTexto(tarea.days_of_week)}</span>
                    <TaskStatusBadge status={tarea.status} />
                    {tarea.assigned_to ? (
                      <span className="text-xs text-slate-500">
                        {nombres.get(tarea.assigned_to) ?? 'Asignada'}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CarePlanCard>
        )
      })}
    </div>
  )
}

/** Traducción compacta de days_of_week (smallint[]) a texto español. */
function diasSemanaTexto(dias: readonly number[]): string {
  if (dias.length === 7) return 'Todos los días'
  const nombres: Readonly<Record<number, string>> = { 1: 'Lu', 2: 'Ma', 3: 'Mi', 4: 'Ju', 5: 'Vi', 6: 'Sá', 7: 'Do' }
  return [...dias].sort((a, b) => a - b).map((d) => nombres[d] ?? String(d)).join(' ')
}

interface CarePlanCardProps {
  plan: CarePlanRow
  hoyIso: string
  children?: ReactNode
}

const TONO_STATUS_PLAN: Readonly<Record<CarePlanRow['status'], 'emerald' | 'amber' | 'sky' | 'slate'>> = {
  activo: 'emerald',
  pausado: 'amber',
  cerrado: 'slate',
  borrador: 'sky',
}

const ETIQUETA_STATUS_PLAN: Readonly<Record<CarePlanRow['status'], string>> = {
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
  borrador: 'Borrador',
}

function CarePlanCard({ plan, hoyIso, children }: CarePlanCardProps) {
  const vencido = plan.end_date !== null && plan.end_date < hoyIso && plan.status === 'activo'
  return (
    <Card>
      <CardHeader
        title={plan.title}
        subtitle={`Vigencia: ${formatearFecha(plan.start_date)} → ${
          plan.end_date ? formatearFecha(plan.end_date) : 'sin fecha fin'
        }${plan.review_date ? ` · Revisión: ${formatearFecha(plan.review_date)}` : ''}`}
        action={
          <div className="flex items-center gap-2">
            {vencido ? <Badge tone="rose">Vencido</Badge> : null}
            <Badge tone={TONO_STATUS_PLAN[plan.status]}>{ETIQUETA_STATUS_PLAN[plan.status]}</Badge>
          </div>
        }
      />
      <CardContent className="space-y-3">
        {plan.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{plan.description}</p>
        ) : null}
        {plan.goals.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Objetivos</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
              {plan.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      {children}
    </Card>
  )
}
