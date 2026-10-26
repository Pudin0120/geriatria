'use client'

import { useMemo, useState } from 'react'
import { ExecutionModal } from '@/components/ui/ExecutionModal'
import { TaskCard, type TaskCardResident } from '@/components/ui/TaskCard'
import { administerMedicationFromForm, executeTaskFromForm, type ClinicalFormState } from '@/lib/supabase/actions'
import { MEDICATION_ROUTE_LABELS, type CareTaskRow, type MedicationRow } from '@/types'

/* ================================================================== */
/* Tipos de datos serializados que la página (RSC) pasa a este cliente */
/* ================================================================== */

export interface TareaDelDia extends CareTaskRow {
  residents: TaskCardResident | null
}

export interface AdministracionHoy {
  task_id: string
  outcome: string
  administered_at: string
}

export interface DosisDeHoy {
  medication_id: string
  scheduled_at: string | null
  outcome: string
  administered_at: string
}

export interface MedicacionConResidente extends MedicationRow {
  residents: Pick<TaskCardResident, 'id' | 'first_name' | 'last_name' | 'room_number'> | null
}

export interface AgendaInicial {
  fechaIso: string
  tareas: TareaDelDia[]
  ejecucionesHoy: AdministracionHoy[]
  medicaciones: MedicacionConResidente[]
  administracionesHoy: DosisDeHoy[]
  /** true si el rol actual puede registrar administraciones de DURO. */
  puedeAdministrar: boolean
}

interface EstadoTarea {
  ejecutada: boolean
  outcome: string
  hora: string
}

interface EstadoDosis {
  outcome: string
  hora: string
}

/** Turno según la hora del momento de carga. */
function turnoActual(): { nombre: string; icono: string } {
  const h = new Date().getHours()
  if (h < 7) return { nombre: 'Noche', icono: '🌙' }
  if (h < 15) return { nombre: 'Mañana', icono: '☀️' }
  if (h < 22) return { nombre: 'Tarde', icono: '🌆' }
  return { nombre: 'Noche', icono: '🌙' }
}

const CLASES_BOTON_GRUPO =
  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100'

/**
 * Vista interactiva de «Tareas del Día»: agenda agrupada por hora con
 * tarjetas de tarea y modal rápido de ejecución (Server Action +
 * useActionState dentro de ExecutionModal). El estado local de registros
 * se combina con el snapshot inicial para dar feedback inmediato.
 */
export function AgendaTareasClient({ inicial }: { inicial: AgendaInicial }) {
  // Snapshot de la agenda (RSC). Tras registrar una ejecución, el servidor
  // revalida la ruta y esta vista se remonta con los datos actualizados.
  const tareas = inicial.tareas
  const ejecuciones = useMemo(() => {
    const mapa: Record<string, EstadoTarea> = {}
    for (const e of inicial.ejecucionesHoy) {
      mapa[e.task_id] = { ejecutada: true, outcome: e.outcome, hora: e.administered_at }
    }
    return mapa
  }, [inicial.ejecucionesHoy])
  const dosisHoy = useMemo(() => {
    const mapa: Record<string, EstadoDosis> = {}
    for (const d of inicial.administracionesHoy) {
      const clave = `${d.medication_id}|${(d.scheduled_at ?? '').slice(0, 16)}`
      mapa[clave] = { outcome: d.outcome, hora: d.administered_at }
    }
    return mapa
  }, [inicial.administracionesHoy])

  const [modalTarea, setModalTarea] = useState<TareaDelDia | null>(null)
  const [modalDosis, setModalDosis] = useState<{ med: MedicacionConResidente; horaIso: string } | null>(null)

  const pendientesTareas = useMemo(
    () => tareas.filter((t) => !ejecuciones[t.id]?.ejecutada || ejecuciones[t.id]?.outcome !== 'completada').length,
    [tareas, ejecuciones],
  )
  const completadasHoy = useMemo(
    () => Object.values(ejecuciones).filter((e) => e.ejecutada && e.outcome === 'completada').length,
    [ejecuciones],
  )

  // Agrupar tareas por hora (HH), orden ascendente.
  const grupos = useMemo(() => {
    const mapa = new Map<string, TareaDelDia[]>()
    for (const t of tareas) {
      const clave = t.scheduled_time.slice(0, 5)
      const lista = mapa.get(clave)
      if (lista) lista.push(t)
      else mapa.set(clave, [t])
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [tareas])

  const accionTarea = (tarea: TareaDelDia) => {
    const accion = executeTaskFromForm.bind(null, tarea.id) as unknown as (
      previa: ClinicalFormState,
      datos: FormData,
    ) => Promise<ClinicalFormState>
    return accion
  }

  const turno = turnoActual()

  return (
    <div className="space-y-6">
      {/* Resumen del día */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Fecha</p>
          <p className="mt-1 text-sm font-bold capitalize text-slate-800">{formatearFechaLarga(inicial.fechaIso)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Turno</p>
          <p className="mt-1 text-sm font-bold text-slate-800">
            {turno.icono} {turno.nombre}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Completadas hoy</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-700">{completadasHoy}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Pendientes</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-amber-700">{pendientesTareas}</p>
        </div>
      </section>

      {/* Agenda por horas */}
      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">No hay tareas programadas para hoy.</p>
          <p className="mt-1 text-xs text-slate-400">Los planes de cuidado activos generan automáticamente la agenda diaria.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([hora, lista]) => (
            <section key={hora}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                <span className="tabular-nums">{hora}</span>
                <span className="text-xs font-medium text-slate-400">
                  {lista.length} {lista.length === 1 ? 'tarea' : 'tareas'}
                </span>
              </h2>
              <div className="space-y-2.5">
                {lista.map((tarea) => {
                  const estado = ejecuciones[tarea.id]
                  return (
                    <TaskCard
                      key={tarea.id}
                      task={tarea}
                      resident={tarea.residents}
                      ejecutadaHoy={estado?.ejecutada ?? false}
                      outcomeHoy={(estado?.outcome as CareTaskRow['status'] | undefined) ?? null}
                      onEjecutar={() => setModalTarea(tarea)}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* DURO pendiente del día */}
      {inicial.puedeAdministrar && inicial.medicaciones.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">💊 Medicación del día (DURO)</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3">Residente</th>
                  <th scope="col" className="px-4 py-3">Medicación</th>
                  <th scope="col" className="px-4 py-3">Dosis / vía</th>
                  <th scope="col" className="px-4 py-3">Horas</th>
                  <th scope="col" className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {inicial.medicaciones.map((med) => {
                  const horarios = [...med.schedule_times].sort()
                  return (
                    <tr key={med.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">
                        {med.residents ? `${med.residents.first_name} ${med.residents.last_name}` : '—'}
                        {med.residents?.room_number ? (
                          <p className="text-xs font-normal text-slate-400">hab. {med.residents.room_number}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span className="font-semibold">{med.name}</span>
                        {med.generic_name ? <p className="text-xs text-slate-400">{med.generic_name}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {med.dosage} · {MEDICATION_ROUTE_LABELS[med.route]}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {horarios.length === 0 ? (
                            <span className="text-xs text-slate-400">A demanda</span>
                          ) : (
                            horarios.map((h) => {
                              const horaIso = `${inicial.fechaIso.slice(0, 10)}T${h.slice(0, 5)}`
                              const registro = dosisHoy[`${med.id}|${horaIso}`]
                              const done = registro?.outcome === 'administrada'
                              const failed = registro?.outcome === 'rechazada' || registro?.outcome === 'omitida'
                              return (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setModalDosis({ med, horaIso })}
                                  className={CLASES_BOTON_GRUPO}
                                  style={
                                    done
                                      ? { backgroundColor: '#d1fae5', color: '#047857' }
                                      : failed
                                        ? { backgroundColor: '#ffe4e6', color: '#be123c' }
                                        : undefined
                                  }
                                  aria-label={`Registrar toma de ${med.name} a las ${h.slice(0, 5)}`}
                                >
                                  {done ? '✓ ' : failed ? '✕ ' : ''}
                                  {h.slice(0, 5)}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setModalDosis({ med, horaIso: `${inicial.fechaIso.slice(0, 10)}T${new Date().toTimeString().slice(0, 5)}` })}
                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700"
                        >
                          Registrar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Modal de ejecución de tarea */}
      {modalTarea ? (
        <ExecutionModal
          abierto
          onCerrar={() => setModalTarea(null)}
          variante="tarea"
          titulo="Registrar tarea"
          subtitulo={`${modalTarea.scheduled_time.slice(0, 5)} · ${modalTarea.title}`}
          contexto={
            modalTarea.residents
              ? `${modalTarea.residents.first_name} ${modalTarea.residents.last_name}${modalTarea.residents.room_number ? ` · hab. ${modalTarea.residents.room_number}` : ''}`
              : modalTarea.title
          }
          accion={accionTarea(modalTarea)}
        />
      ) : null}

      {/* Modal de administración de medicamento */}
      {modalDosis ? (
        <ExecutionModal
          abierto
          onCerrar={() => setModalDosis(null)}
          variante="medicacion"
          titulo="Registrar administración"
          subtitulo={`${modalDosis.med.name} · ${modalDosis.med.dosage}`}
          contexto={
            modalDosis.med.residents
              ? `${modalDosis.med.residents.first_name} ${modalDosis.med.residents.last_name}${modalDosis.med.residents.room_number ? ` · hab. ${modalDosis.med.residents.room_number}` : ''} · toma ${modalDosis.horaIso.slice(11)}`
              : `Toma ${modalDosis.horaIso.slice(11)}`
          }
          valoresIniciales={{
            dose: modalDosis.med.dosage,
            defaultRoute: modalDosis.med.route,
            routeOptions: [
              { value: modalDosis.med.route, label: MEDICATION_ROUTE_LABELS[modalDosis.med.route] },
              ...Object.entries(MEDICATION_ROUTE_LABELS)
                .filter(([v]) => v !== modalDosis.med.route)
                .map(([value, label]) => ({ value, label })),
            ],
          }}
          accion={
            administerMedicationFromForm.bind(null, modalDosis.med.id) as unknown as (
              previa: ClinicalFormState,
              datos: FormData,
            ) => Promise<ClinicalFormState>
          }
        />
      ) : null}
    </div>
  )
}

/** Fecha larga en español ('viernes, 23 de octubre de 2026'). */
function formatearFechaLarga(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}
