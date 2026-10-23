import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { getAuditLogs } from '@/lib/supabase/actions'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { criticidadAccion, type AuditLogEntryView, type Tone } from '@/lib/reportes'
import { formatearFecha } from '@/lib/utils'

export const metadata = {
  title: 'Auditoría de accesos',
  description: 'Registro de actividad del sistema (access_logs). Solo administración.',
}

/** Depende de la sesión y de los filtros: se resuelve en cada petición. */
export const instant = false

const TONO_A_BADGE: Readonly<Record<Tone, BadgeTone>> = {
  emerald: 'emerald',
  amber: 'amber',
  rose: 'rose',
  sky: 'sky',
  slate: 'slate',
}

interface AuditoriaPageProps {
  searchParams: Promise<{
    desde?: string
    hasta?: string
    usuario?: string
    accion?: string
    entidad?: string
    pagina?: string
  }>
}

/** Normaliza fechas seguras YYYY-MM-DD para el formulario de filtros. */
function fechaSegura(raw: string | undefined): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

/** Formato compacto fecha + hora local para la columna «Fecha». */
function fechaHora(iso: string): string {
  const d = new Date(iso)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${formatearFecha(iso)} ${hhmm}`
}

/** Página de auditoría (Fase 5): visor paginado de `access_logs`. */
export default async function AuditoriaPage({ searchParams }: AuditoriaPageProps) {
  await connection()
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  /* --- Protección dura: solo is_admin() (rol admin) puede entrar -------- */
  if (sesion.rol !== 'admin') {
    return (
      <Card className="mx-auto max-w-lg border-rose-200 bg-rose-50/60">
        <CardContent className="py-10 text-center">
          <p aria-hidden className="text-4xl">🔒</p>
          <h1 className="mt-3 text-xl font-bold text-rose-800">Acceso denegado</h1>
          <p className="mt-2 text-sm text-rose-700">
            El módulo de auditoría está reservado a la administración del centro. Tu rol actual no tiene permiso para
            consultar el registro de accesos.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900"
          >
            ← Volver al resumen
          </Link>
        </CardContent>
      </Card>
    )
  }

  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1)

  let resultado
  try {
    resultado = await getAuditLogs({
      userId: sp.usuario,
      desde: fechaSegura(sp.desde) || undefined,
      hasta: fechaSegura(sp.hasta) || undefined,
      action: sp.accion,
      entityType: sp.entidad,
      page,
      pageSize: 25,
    })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'No fue posible leer la auditoría.'
    return (
      <Card className="border-rose-200">
        <CardContent className="py-8 text-sm text-rose-700">⚠ {mensaje}</CardContent>
      </Card>
    )
  }

  /** Enlace que conserva los filtros activos cambiando la página. */
  function enlacePagina(destino: number): string {
    const params = new URLSearchParams()
    if (sp.desde) params.set('desde', sp.desde)
    if (sp.hasta) params.set('hasta', sp.hasta)
    if (sp.usuario) params.set('usuario', sp.usuario)
    if (sp.accion) params.set('accion', sp.accion)
    if (sp.entidad) params.set('entidad', sp.entidad)
    if (destino > 1) params.set('pagina', String(destino))
    const qs = params.toString()
    return qs ? `/dashboard/auditoria?${qs}` : '/dashboard/auditoria'
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Auditoría de accesos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Trazabilidad de acciones sobre {resultado.total.toLocaleString('es')} registro
          {resultado.total === 1 ? '' : 's'} de <code className="rounded bg-slate-100 px-1">access_logs</code>. Solo
          visible para administración.
        </p>
      </header>

      {/* Filtros GET (navegación ligera, sin estado cliente adicional) */}
      <Card>
        <CardHeader title="Filtros" subtitle="Aplica rango de fechas, usuario o tipo de acción." />
        <CardContent>
          <form method="get" action="/dashboard/auditoria" className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <label className="block text-xs font-medium text-slate-600">
              Desde
              <input
                type="date"
                name="desde"
                defaultValue={fechaSegura(sp.desde)}
                className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Hasta
              <input
                type="date"
                name="hasta"
                defaultValue={fechaSegura(sp.hasta)}
                className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <label className="col-span-2 block text-xs font-medium text-slate-600">
              Usuario (UUID)
              <input
                type="text"
                name="usuario"
                defaultValue={sp.usuario ?? ''}
                placeholder="id de perfil…"
                className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Acción
              <input
                type="text"
                name="accion"
                defaultValue={sp.accion ?? ''}
                placeholder="login, insert…"
                className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Entidad
              <input
                type="text"
                name="entidad"
                defaultValue={sp.entidad ?? ''}
                placeholder="residents…"
                className="mt-1 block h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-teal-500 focus:outline-none"
              />
            </label>
            <div className="col-span-2 flex items-end gap-2 md:col-span-6">
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Aplicar filtros
              </button>
              <Link
                href="/dashboard/auditoria"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Limpiar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Suspense fallback={<SkeletonTable filas={8} />}>
        <TablaAuditoria logs={resultado.logs} />
      </Suspense>

      {/* Paginación por enlaces */}
      <nav className="flex items-center justify-between" aria-label="Paginación de auditoría">
        <p className="text-xs text-slate-500 tabular-nums">
          Página {resultado.page} de {resultado.totalPages} · {resultado.pageSize} registros por página
        </p>
        <div className="flex gap-2">
          {resultado.page > 1 ? (
            <Link
              href={enlacePagina(resultado.page - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              ← Anterior
            </Link>
          ) : null}
          {resultado.page < resultado.totalPages ? (
            <Link
              href={enlacePagina(resultado.page + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Siguiente →
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  )
}

/** Tabla server-side de la página actual de logs con badges de criticidad. */
function TablaAuditoria({ logs }: { logs: AuditLogEntryView[] }) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-500">
          No hay registros de auditoría que coincidan con los filtros aplicados.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">Registros de auditoría de accesos</caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</th>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Usuario</th>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Acción</th>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Entidad</th>
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {logs.map((l) => (
            <tr key={String(l.id)} className="hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-2.5 align-top tabular-nums text-slate-700">{fechaHora(l.created_at)}</td>
              <td className="px-4 py-2.5 align-top">
                <span className="max-w-48 truncate font-medium text-slate-700" title={l.user_id ?? undefined}>
                  {l.userName ?? 'Sistema / anónimo'}
                </span>
              </td>
              <td className="px-4 py-2.5 align-top">
                <Badge tone={TONO_A_BADGE[criticidadAccion(l.action)]}>{l.action}</Badge>
              </td>
              <td className="px-4 py-2.5 align-top text-slate-600">
                {l.entity_type ?? '—'}
                {l.entity_id ? (
                  <span className="ml-1 font-mono text-[11px] text-slate-400" title={l.entity_id}>
                    #{l.entity_id.slice(0, 8)}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-2.5 align-top font-mono text-xs text-slate-500">{l.ip_address ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
