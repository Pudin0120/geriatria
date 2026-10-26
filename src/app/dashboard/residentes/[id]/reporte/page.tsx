import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { getResidentStats } from '@/lib/supabase/actions'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge, FrailtyBadge, ResidentStatusBadge } from '@/components/ui/Badge'
import { MetricCard } from '@/components/ui/MetricCard'
import { Timeline, type TimelineEvent } from '@/components/ui/Timeline'
import { ExportButton } from '@/components/ui/ExportButton'
import type { CarePlanRow, MedicationRow, ResidentRow, VgiAssessmentRow } from '@/types'
import {
  CARE_PLAN_STATUS_LABELS,
  GENDER_LABELS,
  MEDICATION_ROUTE_LABELS,
  buildResidentFullName,
} from '@/types'
import type { Tone } from '@/lib/reportes'
import { calcularEdadTexto, formatearFecha } from '@/lib/utils'

export const metadata = {
  title: 'Reporte clínico individual',
  description: 'Resumen clínico completo del residente con timeline de eventos.',
}

/** Datos por petición (sesión + estadísticas clínicas). */
export const instant = false

function esUuid(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

interface ReportePageProps {
  params: Promise<{ id: string }>
}

/* Iconos SVG decorativos para las métricas. */
const ICONO_ADHERENCIA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="9" />
  </svg>
)
const ICONO_VGI = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
    <path d="M4 19V5m0 14h16" strokeLinecap="round" />
    <path d="M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICONO_EVENTOS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
    <path d="M12 9v4m0 4h.01" strokeLinecap="round" />
    <path d="M10.3 3.9L2.6 17.2A1.9 1.9 0 004.3 20h15.4a1.9 1.9 0 001.7-2.8L13.7 3.9a1.9 1.9 0 00-3.4 0z" strokeLinejoin="round" />
  </svg>
)

/** Página de reporte clínico individual (Fase 5). Server Component. */
export default async function ReporteIndividualPage({ params }: ReportePageProps) {
  await connection()
  const { id } = await params
  if (!esUuid(id)) notFound()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const supabase = await createClient()

  const { data: residente, error: errRes } = await supabase
    .from('residents')
    .select('*')
    .eq('id', id)
    .maybeSingle<ResidentRow>()
  if (errRes) throw new Error(`Error al cargar el residente: ${errRes.message}`)
  if (!residente) notFound()

  /* Consultas batch paralelas: sin N+1. */
  const [stats, vgis, planes, meds] = await Promise.all([
    getResidentStats(id),
    supabase
      .from('vgi_assessments')
      .select('*')
      .eq('resident_id', id)
      .order('assessment_date', { ascending: false })
      .limit(10)
      .returns<VgiAssessmentRow[]>(),
    supabase
      .from('care_plans')
      .select('*')
      .eq('resident_id', id)
      .in('status', ['activo', 'pausado'])
      .order('start_date', { ascending: false })
      .returns<CarePlanRow[]>(),
    supabase
      .from('medications')
      .select('*')
      .eq('resident_id', id)
      .eq('active', true)
      .order('name')
      .returns<MedicationRow[]>(),
  ])
  if (vgis.error) throw new Error(`Error al cargar valoraciones: ${vgis.error.message}`)
  if (planes.error) throw new Error(`Error al cargar planes: ${planes.error.message}`)
  if (meds.error) throw new Error(`Error al cargar medicaciones: ${meds.error.message}`)

  const nombreCompleto = buildResidentFullName(residente)
  const ultimasTres = (vgis.data ?? []).slice(0, 3)
  const historialPlanes = planes.data ?? []
  const historialMeds = meds.data ?? []

  /* --- Timeline de eventos (ingreso, VGI, planes, adversos) -------------- */
  const eventos: TimelineEvent[] = []
  eventos.push({
    id: `ingreso-${residente.id}`,
    fecha: formatearFecha(residente.admission_date),
    titulo: 'Ingreso en el centro',
    descripcion: `Habitación ${residente.room_number ?? '—'} · ${GENDER_LABELS[residente.gender]}`,
    tone: 'sky',
  })
  for (const v of vgis.data ?? []) {
    eventos.push({
      id: `vgi-${v.id}`,
      fecha: formatearFecha(v.assessment_date),
      titulo: 'Valoración Geriátrica Integral',
      descripcion: `Barthel ${v.barthel_index ?? '—'} · MMSE ${v.mmse_score ?? '—'}${
        v.frailty_level ? ` · fragilidad: ${v.frailty_level}` : ''
      }`,
      tone: v.frailty_level === 'fragil' ? 'rose' : v.frailty_level === 'pre_fragil' ? 'amber' : 'emerald',
    })
  }
  for (const p of historialPlanes) {
    eventos.push({
      id: `plan-${p.id}`,
      fecha: formatearFecha(p.start_date),
      titulo: `Plan de cuidado: ${p.title}`,
      descripcion: CARE_PLAN_STATUS_LABELS[p.status],
      tone: p.status === 'activo' ? 'emerald' : 'amber',
    })
  }
  if (stats.eventosAdversos30dias > 0) {
    eventos.push({
      id: `adversos-${residente.id}`,
      fecha: 'Últimos 30 días',
      titulo: `${stats.eventosAdversos30dias} evento(s) adverso(s) registrado(s)`,
      descripcion: 'Reacciones adversas documentadas en la administración de medicamentos.',
      tone: 'rose',
    })
  }
  eventos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  /* --- CSV del reporte ---------------------------------------------------- */
  const csvHeaders = ['Campo', 'Valor'] as const
  const csvRows: (string | number | null)[][] = [
    ['Residente', nombreCompleto],
    ['Edad', calcularEdadTexto(residente.birth_date)],
    ['Estado', residente.status],
    ['Habitación', residente.room_number ?? ''],
    ['Ingreso', residente.admission_date],
    ['Barthel actual', stats.ultimoBarthel],
    ['Delta Barthel', stats.deltaBarthel],
    ['MMSE actual', stats.ultimoMmse],
    ['Delta MMSE', stats.deltaMmse],
    [`Adherencia (${stats.adherenciaDias} días) %`, stats.adherenciaPct],
    ['Ejecuciones completadas', stats.ejecucionesCompletadas],
    ['Ejecuciones omitidas', stats.ejecucionesOmitidas],
    ['Eventos adversos totales', stats.eventosAdversosTotal],
    ['Eventos adversos 30 días', stats.eventosAdversos30dias],
    ['Planes activos', stats.planesActivos],
    ['Medicaciones activas', stats.medicacionesActivas],
  ]

  const tonoAdherencia: Tone =
    stats.adherenciaPct === null ? 'slate' : stats.adherenciaPct >= 80 ? 'emerald' : stats.adherenciaPct >= 50 ? 'amber' : 'rose'

  return (
    <div className="space-y-6 print:max-w-none">
      {/* Cabecera imprimible */}
      <header className="flex flex-wrap items-start justify-between gap-3 print:items-center">
        <div>
          <nav aria-label="Migas de navegación" className="mb-1 text-sm text-slate-500 print:hidden">
            <Link href="/dashboard/residentes" className="hover:text-teal-700 hover:underline">
              Residentes
            </Link>{' '}
            ›{' '}
            <Link href={`/dashboard/residentes/${residente.id}`} className="hover:text-teal-700 hover:underline">
              Ficha
            </Link>{' '}
            › <span className="font-medium text-slate-700">Reporte clínico</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-800">Reporte clínico — {nombreCompleto}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <ResidentStatusBadge status={residente.status} />
            <span>{calcularEdadTexto(residente.birth_date)}</span>
            <span aria-hidden>·</span>
            <span>Habitación {residente.room_number ?? '—'}</span>
            <span aria-hidden>·</span>
            <span>Ingreso: {formatearFecha(residente.admission_date)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <ExportButton headers={[...csvHeaders]} rows={csvRows} filename={`reporte-${nombreCompleto.toLowerCase().replace(/\s+/g, '-')}`} />
        </div>
      </header>

      {/* KPIs individuales */}
      <section aria-label="Indicadores clínicos" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <MetricCard
          titulo="Índice de Barthel"
          valor={stats.ultimoBarthel === null ? '—' : String(stats.ultimoBarthel)}
          subtitulo="Dependencia en actividades básicas (0–100)"
          tone={stats.ultimoBarthel === null ? 'slate' : stats.ultimoBarthel >= 60 ? 'emerald' : stats.ultimoBarthel >= 40 ? 'amber' : 'rose'}
          tendencia={stats.deltaBarthel === null ? undefined : `${stats.deltaBarthel >= 0 ? '+' : ''}${stats.deltaBarthel} vs VGI anterior`}
          tendenciaDireccion={stats.deltaBarthel === null ? undefined : stats.deltaBarthel >= 0 ? 'arriba' : 'abajo'}
          icono={ICONO_VGI}
        />
        <MetricCard
          titulo="MMSE"
          valor={stats.ultimoMmse === null ? '—' : String(stats.ultimoMmse)}
          subtitulo="Capacidad cognitiva (0–30)"
          tone={stats.ultimoMmse === null ? 'slate' : stats.ultimoMmse >= 24 ? 'emerald' : stats.ultimoMmse >= 18 ? 'amber' : 'rose'}
          tendencia={stats.deltaMmse === null ? undefined : `${stats.deltaMmse >= 0 ? '+' : ''}${stats.deltaMmse} vs VGI anterior`}
          tendenciaDireccion={stats.deltaMmse === null ? undefined : stats.deltaMmse >= 0 ? 'arriba' : 'abajo'}
          icono={ICONO_VGI}
        />
        <MetricCard
          titulo={`Adherencia ${stats.adherenciaDias} días`}
          valor={stats.adherenciaPct === null ? '—' : `${stats.adherenciaPct} %`}
          subtitulo={`${stats.ejecucionesCompletadas} completadas · ${stats.ejecucionesOmitidas} omitidas`}
          tone={tonoAdherencia}
          icono={ICONO_ADHERENCIA}
        />
        <MetricCard
          titulo="Eventos adversos"
          valor={String(stats.eventosAdversosTotal)}
          subtitulo={`${stats.eventosAdversos30dias} en los últimos 30 días`}
          tone={stats.eventosAdversos30dias > 0 ? 'rose' : 'emerald'}
          icono={ICONO_EVENTOS}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Datos personales */}
        <Card>
          <CardHeader title="Datos personales y clínicos" />
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">Nombre completo</dt>
                <dd className="text-slate-800">{nombreCompleto}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Género</dt>
                <dd className="text-slate-800">{GENDER_LABELS[residente.gender]}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Fecha de nacimiento</dt>
                <dd className="text-slate-800">
                  {formatearFecha(residente.birth_date)} ({calcularEdadTexto(residente.birth_date)})
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Contacto de emergencia</dt>
                <dd className="text-slate-800">
                  {residente.emergency_contact_name ?? '—'}
                  {residente.emergency_contact_phone ? ` · ${residente.emergency_contact_phone}` : ''}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-slate-500">Diagnósticos</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {residente.diagnoses.length === 0 ? (
                    <span className="text-slate-400">Sin diagnósticos registrados.</span>
                  ) : (
                    residente.diagnoses.map((d) => (
                      <Badge key={d} tone="sky">
                        {d}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-slate-500">Alergias</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {residente.allergies.length === 0 ? (
                    <span className="text-slate-400">Sin alergias conocidas.</span>
                  ) : (
                    residente.allergies.map((a) => (
                      <Badge key={a} tone="rose">
                        {a}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Últimas 3 VGI con comparativa */}
        <Card>
          <CardHeader
            title="Últimas valoraciones VGI"
            subtitle="Comparativa entre las tres valoraciones más recientes."
          />
          <CardContent className="px-0 pb-0">
            {ultimasTres.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-400">Este residente aún no tiene valoraciones VGI registradas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-5 py-2">Fecha</th>
                    <th scope="col" className="px-3 py-2">Barthel</th>
                    <th scope="col" className="px-3 py-2">MMSE</th>
                    <th scope="col" className="px-5 py-2">Fragilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimasTres.map((v, i) => {
                    const previa = ultimasTres[i + 1]
                    const deltaB = previa && v.barthel_index !== null && previa.barthel_index !== null
                      ? v.barthel_index - previa.barthel_index
                      : null
                    const deltaM = previa && v.mmse_score !== null && previa.mmse_score !== null
                      ? v.mmse_score - previa.mmse_score
                      : null
                    return (
                      <tr key={v.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-5 py-2.5 font-medium text-slate-700">{formatearFecha(v.assessment_date)}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {v.barthel_index ?? '—'}
                          {deltaB !== null ? (
                            <span className={deltaB >= 0 ? 'ml-1 text-emerald-600' : 'ml-1 text-rose-600'}>
                              {deltaB >= 0 ? '▲' : '▼'}
                              {Math.abs(deltaB)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {v.mmse_score ?? '—'}
                          {deltaM !== null ? (
                            <span className={deltaM >= 0 ? 'ml-1 text-emerald-600' : 'ml-1 text-rose-600'}>
                              {deltaM >= 0 ? '▲' : '▼'}
                              {Math.abs(deltaM)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-2.5">
                          {v.frailty_level ? <FrailtyBadge level={v.frailty_level} /> : <span className="text-slate-400">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Planes activos */}
        <Card>
          <CardHeader
            title={`Planes de cuidado activos (${historialPlanes.length})`}
            action={
              <Link
                href={`/dashboard/residentes/${residente.id}/planes`}
                className="text-sm font-medium text-teal-700 hover:underline print:hidden"
              >
                Ver planes
              </Link>
            }
          />
          <CardContent>
            {historialPlanes.length === 0 ? (
              <p className="text-sm text-slate-400">Sin planes de cuidado activos.</p>
            ) : (
              <ul className="space-y-3">
                {historialPlanes.map((p) => (
                  <li key={p.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800">{p.title}</p>
                      <Badge tone={p.status === 'activo' ? 'emerald' : 'amber'}>{CARE_PLAN_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Desde {formatearFecha(p.start_date)}
                      {p.end_date ? ` hasta ${formatearFecha(p.end_date)}` : ''}
                      {p.goals.length > 0 ? ` · ${p.goals.length} objetivo(s)` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Medicaciones vigentes */}
        <Card>
          <CardHeader
            title={`Medicaciones vigentes (${historialMeds.length})`}
            action={
              <Link
                href={`/dashboard/residentes/${residente.id}/medicaciones`}
                className="text-sm font-medium text-teal-700 hover:underline print:hidden"
              >
                Ver medicaciones
              </Link>
            }
          />
          <CardContent>
            {historialMeds.length === 0 ? (
              <p className="text-sm text-slate-400">Sin medicaciones activas.</p>
            ) : (
              <ul className="space-y-3">
                {historialMeds.map((m) => (
                  <li key={m.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800">
                        {m.name} <span className="font-normal text-slate-500">{m.dosage}</span>
                      </p>
                      <Badge tone="sky">{MEDICATION_ROUTE_LABELS[m.route]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Horarios: {m.schedule_times.map((t) => t.slice(0, 5)).join(' · ') || '—'}
                      {m.end_date ? ` · Alta: ${formatearFecha(m.end_date)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline de eventos */}
      <Card>
        <CardHeader
          title="Línea de tiempo clínica"
          subtitle="Ingresos, valoraciones VGI, planes de cuidado y eventos adversos."
        />
        <CardContent>
          <Timeline eventos={eventos} vacioMensaje="Sin eventos registrados para este residente." />
        </CardContent>
      </Card>

      <footer className="hidden text-xs text-slate-400 print:block">
        GeriCare · Reporte generado el {formatearFecha(new Date().toISOString().slice(0, 10))} · {nombreCompleto}
      </footer>
    </div>
  )
}
