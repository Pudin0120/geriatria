import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge, FrailtyBadge, ResidentStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SkeletonTable } from '@/components/ui/Skeleton'
import type { ProfileRow, ResidentRow, VgiAssessmentRow } from '@/types'
import { GENDER_LABELS, buildResidentFullName, toVgiAssessmentView } from '@/types'
import { calcularEdadTexto, formatearFecha } from '@/lib/utils'

export const metadata = {
  title: 'Detalle del residente',
  description: 'Información completa e historial de valoraciones.',
}

/** Los metadatos dependen de la sesión (cookies): se resuelven en runtime. */
export const instant = false

/** Verifica que el parámetro dinámico tenga pinta de UUID antes de consultar. */
function esUuid(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

/* ================================================================== */
/* Detalle del residente (Server Component con datos reales)         */
/* ================================================================== */

interface ResidenteDetallePageProps {
  params: Promise<{ id: string }>
}

export default async function ResidenteDetallePage({ params }: ResidenteDetallePageProps) {
  await connection()
  const { id } = await params
  if (!esUuid(id)) notFound()

  const sesion = await obtenerSesionActiva()
  if (!sesion) return null // el layout ya redirige; aquí solo evitamos render sin sesión

  const puedeEditar = ['admin', 'nurse_jefe', 'medico'].includes(sesion.rol)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Migas de navegación">
          <ol className="flex items-center gap-2 text-sm text-slate-500">
            <li>
              <Link href="/dashboard/residentes" className="hover:text-teal-700 hover:underline">
                Residentes
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li className="font-medium text-slate-700">Ficha del residente</li>
          </ol>
        </nav>
        {puedeEditar ? (
          <Link href={`/dashboard/residentes/${id}/vgi`} className="contents">
            <Button>Nueva valoración (VGI)</Button>
          </Link>
        ) : null}
      </header>

      <Suspense fallback={<SkeletonTable filas={6} />}>
        <ContenidoDetalle id={id} />
      </Suspense>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Consulta y renderizado de la ficha + historial VGI                  */
/* ------------------------------------------------------------------ */

async function ContenidoDetalle({ id }: { id: string }) {
  const supabase = await createClient()

  const { data: residentData } = await supabase
    .from('residents')
    .select('*')
    .eq('id', id)
    .maybeSingle<ResidentRow>()

  if (!residentData) notFound()

  const { data: vgiData, error: vgiError } = await supabase
    .from('vgi_assessments')
    .select('*')
    .eq('resident_id', id)
    .order('assessment_date', { ascending: false })
    .returns<VgiAssessmentRow[]>()

  // Nombres de quien registró y de los evaluadores (visible según RLS).
  const evaluadorIds = Array.from(
    new Set((vgiData ?? []).map((v) => v.assessed_by).filter((x): x is string => x !== null)),
  )
  let nombresEvaluadores = new Map<string, string>()
  if (evaluadorIds.length > 0) {
    const { data: perfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', evaluadorIds)
      .returns<Pick<ProfileRow, 'id' | 'full_name'>[]>()
    nombresEvaluadores = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]))
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      {/* Columna 1-2: información personal */}
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader
            title={buildResidentFullName(residentData)}
            subtitle={`${calcularEdadTexto(residentData.birth_date)} · ${GENDER_LABELS[residentData.gender]} · Habitación ${residentData.room_number ?? '—'}`}
            action={<ResidentStatusBadge status={residentData.status} />}
          />
          <CardContent className="space-y-5">
            <SeccionLista titulo="Alergias" elementos={residentData.allergies} vacio="Sin alergias registradas." tone="rose" />
            <SeccionLista titulo="Diagnósticos" elementos={residentData.diagnoses} vacio="Sin diagnósticos registrados." tone="sky" />

            <div>
              <h3 className="text-sm font-semibold text-slate-700">Contacto de emergencia</h3>
              {residentData.emergency_contact_name || residentData.emergency_contact_phone ? (
                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-400">Nombre</dt>
                    <dd className="text-sm font-medium text-slate-800">{residentData.emergency_contact_name ?? '—'}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-400">Teléfono</dt>
                    <dd className="text-sm font-medium text-slate-800">{residentData.emergency_contact_phone ?? '—'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Sin contacto de emergencia registrado.</p>
              )}
            </div>

            {residentData.notes ? (
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Notas de admisión</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{residentData.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Columna 3: metaadministrativa */}
      <Card>
        <CardHeader title="Ficha administrativa" />
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Fecha de ingreso</dt>
              <dd className="font-medium text-slate-800">{formatearFecha(residentData.admission_date)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Nacimiento</dt>
              <dd className="font-medium text-slate-800">{formatearFecha(residentData.birth_date)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Registrado</dt>
              <dd className="font-medium text-slate-800">{formatearFecha(residentData.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Última actualización</dt>
              <dd className="font-medium text-slate-800">{formatearFecha(residentData.updated_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Historial de valoraciones (ocupa todo el ancho debajo) */}
      <div className="xl:col-span-3">
        <Card>
          <CardHeader
            title="Historial de valoraciones geriátricas integrales"
            subtitle={`${(vgiData ?? []).length} valoración${(vgiData ?? []).length === 1 ? '' : 'es'} registrada${(vgiData ?? []).length === 1 ? '' : 's'}`}
          />
          <CardContent>
            {vgiError ? (
              <p className="text-sm text-rose-700">No se pudo cargar el historial: {vgiError.message}</p>
            ) : (vgiData ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-sm font-medium text-slate-600">Sin valoraciones todavía</p>
                <p className="mt-1 text-xs text-slate-400">
                  Registra la primera VGI con el botón «Nueva valoración (VGI)».
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(vgiData ?? []).map((vgi) => (
                  <VgiItem key={vgi.id} vgi={toVgiAssessmentView(vgi)} evaluador={vgi.assessed_by ? nombresEvaluadores.get(vgi.assessed_by) ?? null : null} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sub-componentes                                                     */
/* ------------------------------------------------------------------ */

function SeccionLista({
  titulo,
  elementos,
  vacio,
  tone,
}: {
  titulo: string
  elementos: string[]
  vacio: string
  tone: 'rose' | 'sky'
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
      {elementos.length === 0 ? (
        <p className="mt-1 text-sm text-slate-400">{vacio}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {elementos.map((e) => (
            <Badge key={e} tone={tone}>{e}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

const ETIQUETAS_SEMAFORO: Readonly<Record<string, string>> = {
  dependencia_total: 'Dependencia total',
  dependencia_grave: 'Dependencia grave',
  dependencia_moderada: 'Dependencia moderada',
  dependencia_leve: 'Dependencia leve',
  independiente: 'Independiente',
  deterioro_significativo: 'Deterioro significativo',
  deterioro_leve: 'Deterioro leve',
  normal: 'Normal',
  alto_riesgo: 'Alto riesgo',
  riesgo: 'En riesgo',
  alto: 'Riesgo alto',
  moderado: 'Riesgo moderado',
  bajo: 'Riesgo bajo',
  depresion_probable: 'Depresión probable',
  depresion_posible: 'Depresión posible',
  animo_conservado: 'Ánimo conservado',
}

function escalarEtiqueta(clave: string): string {
  return ETIQUETAS_SEMAFORO[clave] ?? clave
}

interface VgiItemProps {
  vgi: ReturnType<typeof toVgiAssessmentView>
  evaluador: string | null
}

/** Una fila del historial VGI con puntajes y semáforos clínicos. */
function VgiItem({ vgi, evaluador }: VgiItemProps) {
  const escalas: ReadonlyArray<{ nombre: string; valor: number | null; nivel: string | null }> = [
    { nombre: 'Barthel', valor: vgi.barthel_index, nivel: vgi.barthel_index === null ? null : escalarEtiqueta(vgi.barthelLevel) },
    { nombre: 'MMSE', valor: vgi.mmse_score, nivel: vgi.mmse_score === null ? null : escalarEtiqueta(vgi.mmseLevel) },
    { nombre: 'MNA-SF', valor: vgi.mna_sf_score, nivel: vgi.mna_sf_score === null ? null : escalarEtiqueta(vgi.nutritionRisk) },
    { nombre: 'Downton', valor: vgi.downton_score, nivel: vgi.downton_score === null ? null : escalarEtiqueta(vgi.fallRisk) },
    { nombre: 'Yesavage', valor: vgi.yesavage_score, nivel: vgi.yesavage_score === null ? null : escalarEtiqueta(vgi.moodLevel) },
    { nombre: 'Charlson', valor: vgi.charlson_score, nivel: null },
  ]

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Valoración del {formatearFecha(vgi.assessment_date)}</p>
        <div className="flex items-center gap-2">
          {vgi.frailty_level ? <FrailtyBadge level={vgi.frailty_level} /> : null}
          {evaluador ? <span className="text-xs text-slate-400">por {evaluador}</span> : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {escalas.map(({ nombre, valor, nivel }) => (
          <div key={nombre} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">{nombre}</dt>
            <dd className="text-sm font-bold text-slate-800">
              {valor === null ? '—' : valor}
              {nivel ? <span className="ml-1 text-[11px] font-medium text-slate-500">({nivel})</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {vgi.clinical_summary ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{vgi.clinical_summary}</p>
      ) : null}

      {vgi.recommendations && vgi.recommendations.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recomendaciones</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
            {vgi.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}
