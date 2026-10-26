'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ExecutionModal } from '@/components/ui/ExecutionModal'
import { administerMedicationFromForm, type ClinicalFormState } from '@/lib/supabase/actions'
import { MEDICATION_ROUTE_LABELS, type AdministrationOutcome, type MedicationRoute } from '@/types'

/* ================================================================== */
/* Tipos serializados desde la página RSC                              */
/* ================================================================== */

export interface TomaPendiente {
  medication_id: string
  name: string
  dosage: string
  route: MedicationRoute
  routeLabel: string
  /** Hora programada de la toma (YYYY-MM-DDTHH:mm local). */
  scheduled_at: string
  resident: {
    id: string
    first_name: string
    last_name: string
    room_number: string | null
    nombre: string
  } | null
}

export interface RegistroDosis {
  medication_id: string
  scheduled_at: string | null
  outcome: AdministrationOutcome
  administered_at: string
}

interface Props {
  hoyIso: string
  turnoLabel: string
  tomas: TomaPendiente[]
  registros: RegistroDosis[]
}

/** Clave de toma: medicamento + hora programada al minuto. */
function clave(medicationId: string, scheduledAt: string): string {
  return `${medicationId}|${scheduledAt.slice(0, 16)}`
}

const RESULTADO_ESTILO: Record<string, { fondo: string; texto: string; icono: string }> = {
  administrada: { fondo: '#d1fae5', texto: '#047857', icono: '✓' },
  parcial: { fondo: '#fef3c7', texto: '#b45309', icono: '◐' },
  omitida: { fondo: '#ffe4e6', texto: '#be123c', icono: '✕' },
  rechazada: { fondo: '#ffe4e6', texto: '#be123c', icono: '✕' },
}

/**
 * Vista rápida de administración DURO del turno (Fase 4): una tarjeta por
 * residente con sus tomas; cada botón abre el modal de registro (dosis,
 * hora real, reacción adversa). Verde = administrada, rojo = omitida.
 */
export function AdministracionClient({ hoyIso, turnoLabel, tomas, registros }: Props) {
  const [modal, setModal] = useState<TomaPendiente | null>(null)

  // Mapa de registros (snapshot inicial + los que acaban de guardarse en esta sesión).
  const [extra, setExtra] = useState<RegistroDosis[]>([])
  const mapa = useMemo(() => {
    const m = new Map<string, RegistroDosis>()
    for (const r of [...registros, ...extra]) {
      if (r.scheduled_at) m.set(clave(r.medication_id, r.scheduled_at), r)
    }
    return m
  }, [registros, extra])

  // Agrupar por residente para minimizar traslados (UX clínica).
  const porResidente = useMemo(() => {
    const grupos = new Map<string, { nombre: string; habitacion: string | null; tomas: TomaPendiente[] }>()
    for (const t of tomas) {
      const id = t.resident?.id ?? 'sin-asignar'
      const existente = grupos.get(id)
      if (existente) existente.tomas.push(t)
      else {
        grupos.set(id, {
          nombre: t.resident ? `${t.resident.first_name} ${t.resident.last_name}` : 'Sin residente asignado',
          habitacion: t.resident?.room_number ?? null,
          tomas: [t],
        })
      }
    }
    return [...grupos.values()]
  }, [tomas])

  const pendientes = tomas.filter((t) => {
    const r = mapa.get(clave(t.medication_id, t.scheduled_at))
    return !r || (r.outcome !== 'administrada' && r.outcome !== 'parcial')
  }).length
  const cubiertas = tomas.length - pendientes

  return (
    <div className="space-y-5">
      {/* Resumen del turno */}
      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Turno</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{turnoLabel}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Cubiertas</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-700">{cubiertas}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Pendientes</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-amber-700">{pendientes}</p>
        </div>
      </section>

      {tomas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">No hay tomas programadas en este turno.</p>
          <p className="mt-1 text-xs text-slate-400">
            Fecha actual: {hoyIso.slice(0, 10)} · cambia de turno arriba o revisa la{' '}
            <Link href="/dashboard/tareas" className="text-teal-700 hover:underline">
              agenda del día
            </Link>
            .
          </p>
        </div>
      ) : (
        porResidente.map((grupo) => (
          <section key={grupo.nombre} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">
                {grupo.nombre}
                {grupo.habitacion ? (
                  <span className="ml-2 text-xs font-medium text-slate-400">hab. {grupo.habitacion}</span>
                ) : null}
              </h2>
              <span className="text-xs text-slate-400">
                {grupo.tomas.length} {grupo.tomas.length === 1 ? 'toma' : 'tomas'}
              </span>
            </header>
            <ul className="divide-y divide-slate-100">
              {grupo.tomas.map((t) => {
                const registro = mapa.get(clave(t.medication_id, t.scheduled_at))
                const estilo = registro ? RESULTADO_ESTILO[registro.outcome] : undefined
                return (
                  <li key={`${t.medication_id}-${t.scheduled_at}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-14 shrink-0 text-lg font-extrabold tabular-nums text-slate-900">
                      {t.scheduled_at.slice(11, 16)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500">
                        {t.dosage} · {t.routeLabel || MEDICATION_ROUTE_LABELS[t.route]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModal(t)}
                      className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-100"
                      style={estilo ? { backgroundColor: estilo.fondo, color: estilo.texto } : undefined}
                      aria-label={`Registrar toma de ${t.name} a las ${t.scheduled_at.slice(11, 16)}`}
                    >
                      {estilo ? `${estilo.icono} ${registro ? String(registro.outcome) : ''}` : 'Registrar'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {modal ? (
        <ExecutionModal
          abierto
          onCerrar={() => setModal(null)}
          variante="medicacion"
          titulo="Registrar administración"
          subtitulo={`${modal.name} · ${modal.dosage}`}
          contexto={`${modal.resident ? `${modal.resident.nombre}${modal.resident.room_number ? ` · hab. ${modal.resident.room_number}` : ''}` : 'Sin residente'} · toma ${modal.scheduled_at.slice(11, 16)}`}
          valoresIniciales={{
            dose: modal.dosage,
            scheduledAt: modal.scheduled_at,
            defaultRoute: modal.route,
            routeOptions: Object.entries(MEDICATION_ROUTE_LABELS).map(([value, label]) => ({ value, label })),
          }}
          accion={
            ((previa: ClinicalFormState, datos: FormData) =>
              administerMedicationFromForm(modal.medication_id, previa, datos).then((res) => {
                if (res.exito) {
                  // Feedback inmediato aunque el servidor aún no haya revalidado.
                  const outcome = String(datos.get('outcome') ?? 'administrada') as AdministrationOutcome
                  setExtra((prev) => [
                    ...prev,
                    {
                      medication_id: modal.medication_id,
                      scheduled_at: modal.scheduled_at,
                      outcome,
                      administered_at: new Date().toISOString(),
                    },
                  ])
                }
                return res
              })) as (previa: ClinicalFormState, datos: FormData) => Promise<ClinicalFormState>
          }
        />
      ) : null}
    </div>
  )
}
