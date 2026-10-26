import type { ReactNode } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { getDashboardMetrics, getResidentsForExport, getTopRiesgo, getVgiParaEvolucion } from '@/lib/supabase/actions'
import { Badge, FrailtyBadge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { MetricCard } from '@/components/ui/MetricCard'
import { BarChart, BarChartHorizontal, type BarChartDataItem } from '@/components/ui/BarChart'
import { ExportButton } from '@/components/ui/ExportButton'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { RESIDENT_STATUS_LABELS, GENDER_LABELS } from '@/types'
import type { FrailtyLevel } from '@/types'
import type { Tone } from '@/lib/reportes'
import type { DistribucionFragilidad, ResidenteRiesgo } from '@/lib/reportes'
import { calcularEdadTexto, formatearFecha } from '@/lib/utils'
import { EvolucionVgi } from './evolucion-client'

export const metadata = {
  title: 'Reportes y analíticas',
  description: 'KPIs del centro, distribución de residentes, evolución VGI y exportación CSV.',
}

/** Los datos son por petición (sesión + métricas del día). */
export const instant = false

/* Iconos SVG decorativos para las tarjetas KPI. */
const ICONO = {
  residents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M16 14.6c2.9-.4 5.5 1.5 5.5 4.4" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 6h4M4 12h4M4 18h4" />
      <path d="m11 5 2 2 4-4M11 11l2 2 4-4M11 17l2 2 4-4" />
    </svg>
  ),
  medications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="2.5" y="9" width="19" height="6.5" rx="3.25" transform="rotate(-45 12 12)" />
      <path d="M8.8 8.8 15.2 15.2" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  ),
}

/** Tono semafórico según porcentaje de ocupación. */
function tonoOcupacion(pct: number | null): Tone {
  if (pct === null) return 'slate'
  if (pct >= 90) return 'rose'
  if (pct >= 70) return 'amber'
  return 'emerald'
}

/** Tono según adherencia a tareas del día. */
function tonoAdherencia(pct: number | null): Tone {
  if (pct === null) return 'slate'
  if (pct >= 80) return 'emerald'
  if (pct >= 50) return 'amber'
  return 'rose'
}

/** Tono según cobertura del DURO (administradas/tomas teóricas). */
function tonoDuro(administradas: number, tomas: number): Tone {
  if (tomas === 0) return 'slate'
  const ratio = administradas / tomas
  if (ratio >= 0.8) return 'emerald'
  if (ratio >= 0.5) return 'amber'
  return 'rose'
}

const FRAGILIDAD_TONO: Readonly<Record<FrailtyLevel, Tone>> = {
  robusto: 'emerald',
  pre_fragil: 'amber',
  fragil: 'rose',
}

function itemsFragilidad(dist: DistribucionFragilidad[]): BarChartDataItem[] {
  return dist.map((d) => ({ etiqueta: d.etiqueta, valor: d.cantidad, tone: FRAGILIDAD_TONO[d.nivel] }))
}

/** Página de reportes (Fase 5): dashboard de métricas del centro. */
export default async function ReportesPage() {
  await connection()
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reportes y analíticas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Indicadores clínicos del centro en tiempo real · <ExportLink />
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            href="/dashboard/tareas"
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Tareas del día
          </Link>
          <button
            type="button"
            onClick={undefined}
            className="hidden"
            aria-hidden
          />
        </div>
      </header>

      <ReportesContenido rolEsAdmin={sesion.rol === 'admin'} />
    </div>
  )

  function ExportLink(): ReactNode {
    return (
      <a href="#exportar" className="font-medium text-teal-700 hover:underline">
        exportar datos ↓
      </a>
    )
  }
}

/** Sección dinámica con streaming (esqueleto mientras llegan las métricas). */
async function ReportesContenido({ rolEsAdmin }: { rolEsAdmin: boolean }) {
  const [metricas, topRiesgo, residentes, vgi] = await Promise.all([
    getDashboardMetrics(),
    getTopRiesgo(5),
    getResidentsForExport(),
    getVgiParaEvolucion(),
  ])

  const pctTexto = (v: number | null): string => (v === null ? '—' : `${v.toLocaleString('es')} %`)

  const barrasEstados: BarChartDataItem[] = metricas.distribucionEstados.map((d) => ({
    etiqueta: d.etiqueta,
    valor: d.cantidad,
    tone: d.estado === 'activo' ? 'emerald' : d.estado === 'ingresado' ? 'sky' : 'slate',
  }))

  const barrasHabitaciones: BarChartDataItem[] = metricas.distribucionHabitaciones.map((h) => ({
    etiqueta: `Hab. ${h.habitacion}`,
    valor: h.residentes,
  }))

  /* Datos del exportador CSV (serializados planos, sin `any`). */
  const csvHeaders = [
    'Nombre',
    'Apellidos',
    'Edad',
    'Género',
    'Habitación',
    'Estado',
    'Fecha de ingreso',
    'Alergias',
    'Diagnósticos',
  ] as const
  const csvRows = residentes.map((r) => [
    r.first_name,
    r.last_name,
    calcularEdadTexto(r.birth_date),
    GENDER_LABELS[r.gender],
    r.room_number,
    RESIDENT_STATUS_LABELS[r.status],
    formatearFecha(r.admission_date),
    r.allergies.join('; '),
    r.diagnoses.join('; '),
  ])

  return (
    <>
      {/* --- Tarjetas KPI ------------------------------------------------ */}
      <section aria-label="Indicadores clave" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          titulo="Residentes activos"
          valor={String(metricas.residentesActivos)}
          subtitulo={`${metricas.totalResidentes} registrados en total`}
          icono={ICONO.residents}
          tone="sky"
        />
        <MetricCard
          titulo="Ocupación"
          valor={pctTexto(metricas.ocupacionPct)}
          subtitulo={`${metricas.distribucionHabitaciones.length} habitaciones ocupadas`}
          icono={ICONO.residents}
          tone={tonoOcupacion(metricas.ocupacionPct)}
        />
        <MetricCard
          titulo="Adherencia a tareas hoy"
          valor={pctTexto(metricas.adherenciaTareasHoyPct)}
          subtitulo={`${metricas.tareasCompletadasHoy} completadas · ${metricas.tareasNoRealizadasHoy} sin realizar · ${metricas.tareasProgramadasHoy} programadas`}
          icono={ICONO.tasks}
          tone={tonoAdherencia(metricas.adherenciaTareasHoyPct)}
        />
        <MetricCard
          titulo="DURO de hoy"
          valor={`${metricas.administradasHoy}/${metricas.tomasMedicacionHoy}`}
          subtitulo={
            metricas.reaccionesAdversasHoy > 0
              ? `⚠ ${metricas.reaccionesAdversasHoy} reacción(es) adversa(s)`
              : 'Sin reacciones adversas registradas'
          }
          icono={metricas.reaccionesAdversasHoy > 0 ? ICONO.alert : ICONO.medications}
          tone={
            metricas.reaccionesAdversasHoy > 0
              ? 'rose'
              : tonoDuro(metricas.administradasHoy, metricas.tomasMedicacionHoy)
          }
        />
      </section>

      {/* --- Gráficos ----------------------------------------------------- */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" aria-label="Distribuciones">
        <Card>
          <CardHeader title="Residentes por estado" subtitle="Unidades convivientes e históricos." />
          <CardContent>
            <BarChart data={barrasEstados} sufijo="" vacioMensaje="Aún no hay residentes registrados." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Nivel de fragilidad (última VGI)" subtitle="Clasificación vigente por residente valorado." />
          <CardContent>
            <BarChart
              data={itemsFragilidad(metricas.distribucionFragilidad)}
              vacioMensaje="Sin valoraciones VGI con nivel de fragilidad."
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Ocupación por habitación" subtitle="Top 12 habitaciones con más residentes activos." />
          <CardContent>
            <BarChartHorizontal data={barrasHabitaciones} sufijo=" residentes" />
          </CardContent>
        </Card>
      </section>

      {/* --- Evolución Barthel/MMSE -------------------------------------- */}
      <Card>
        <CardHeader
          title="Evolución Barthel / MMSE"
          subtitle="Selecciona un residente para ver la línea temporal de sus valoraciones VGI."
        />
        <CardContent>
          <EvolucionVgi opciones={vgi.opciones} historiales={vgi.historiales} />
        </CardContent>
      </Card>

      {/* --- Top riesgo ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Top 5 residentes con mayor riesgo"
          subtitle="Fragilidad «frágil» según última VGI, ordenados por menor índice de Barthel."
        />
        <CardContent className="px-0 pb-0">
          <TablaRiesgo filas={topRiesgo} />
        </CardContent>
      </Card>

      {/* --- Exportación CSV ------------------------------------------------ */}
      <Card id="exportar">
        <CardHeader
          title="Exportación de datos"
          subtitle={`Listado completo de residentes visibles (${residentes.length}) para informe externo.`}
          action={<ExportButton headers={[...csvHeaders]} rows={csvRows} filename="gericare-residentes" />}
        />
        <CardContent>
          <p className="text-xs text-slate-500">
            El archivo CSV se genera en tu navegador con codificación UTF-8 (compatible con Excel) y solo contiene los
            registros que tu rol tiene autorizados ver (RLS).
          </p>
        </CardContent>
      </Card>

      {rolEsAdmin ? (
        <p className="text-right text-xs text-slate-400 print:hidden">
          <Link href="/dashboard/auditoria" className="font-medium text-teal-700 hover:underline">
            Ver auditoría de accesos →
          </Link>
        </p>
      ) : null}
    </>
  )
}

/** Tabla del top de riesgo clínico (Server Component puro). */
function TablaRiesgo({ filas }: { filas: ResidenteRiesgo[] }) {
  if (filas.length === 0) {
    return (
      <div className="px-4 pb-6">
        <SkeletonTable filas={1} />
        <p className="text-center text-sm text-slate-500">
          No hay residentes clasificados como «frágiles» con valoración VGI registrada.
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-b-xl">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">Residentes con mayor riesgo clínico</caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Residente</th>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Habitación</th>
            <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Barthel</th>
            <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">MMSE</th>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Fragilidad</th>
            <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Última VGI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/residentes/${r.id}/reporte`} className="font-semibold text-teal-700 hover:underline">
                  {r.nombre}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-slate-600">{r.habitacion ?? '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.barthel !== null ? (
                  <Badge tone={r.barthel <= 40 ? 'rose' : r.barthel <= 80 ? 'amber' : 'emerald'}>{r.barthel}</Badge>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.mmse ?? '—'}</td>
              <td className="px-4 py-2.5">{r.fragilidad ? <FrailtyBadge level={r.fragilidad} /> : <Badge tone="slate">sin VGI</Badge>}</td>
              <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums">
                {r.diasDesdeUltimaVgi === null ? 'nunca' : `hace ${r.diasDesdeUltimaVgi} d`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
