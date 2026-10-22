'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MedicationRowItem, MedicationTableHead } from '@/components/ui/MedicationRow'
import { ExecutionModal } from '@/components/ui/ExecutionModal'
import { administerMedicationFromForm, toggleMedicationActive, type ClinicalFormState } from '@/lib/supabase/actions'
import type { DosisDeHoy, MedicacionConResidente } from '@/app/dashboard/tareas/agenda-client'
import { MEDICATION_ROUTE_LABELS } from '@/types'

const CLASES_BOTON_GRUPO = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100'

interface Props {
  residentId: string
  hoyIso: string
  medicaciones: MedicacionConResidente[]
  /** Dosis DURO registradas hoy (para pintar el semáforo por toma). */
  administracionesHoy: DosisDeHoy[]
  puedePrescribir: boolean
  puedeAdministrar: boolean
}

/**
 * Tabla interactiva de medicamentos del residente: badges de estado,
 * botón «Suspender/Reactivar» (Server Action) y registro rápido de la
 * toma por horario con semáforo verde (administrada) / rojo (omitida).
 */
export function MedicacionesCliente({
  residentId,
  hoyIso,
  medicaciones,
  administracionesHoy,
  puedePrescribir,
  puedeAdministrar,
}: Props) {
  const [modal, setModal] = useState<{ med: MedicacionConResidente; horaIso: string } | null>(null)
  const [pendingToggle, setPendingToggle] = useState<string | null>(null)
  const [toggleMsg, setToggleMsg] = useState<string | null>(null)

  const onToggle = async (medicationId: string) => {
    setPendingToggle(medicationId)
    setToggleMsg(null)
    const res = await toggleMedicationActive(medicationId)
    setPendingToggle(null)
    if (res.error) setToggleMsg(res.error)
  }

  return (
    <div className="space-y-4">
      {toggleMsg ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {toggleMsg}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left">
          <MedicationTableHead withAction={puedePrescribir || puedeAdministrar} />
          <tbody>
            {medicaciones.map((med) => {
              const horarios = [...med.schedule_times].sort()
              return (
                <MedicationRowItem
                  key={med.id}
                  medication={med}
                  hoyIso={hoyIso}
                  action={
                    <div className="flex flex-col items-end gap-2">
                      {puedePrescribir ? (
                        <button
                          type="button"
                          disabled={pendingToggle === med.id}
                          onClick={() => void onToggle(med.id)}
                          className={
                            med.active
                              ? 'rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50'
                              : 'rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50'
                          }
                        >
                          {pendingToggle === med.id ? '…' : med.active ? 'Suspender' : 'Reactivar'}
                        </button>
                      ) : null}
                      {puedeAdministrar && med.active ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {horarios.length === 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setModal({ med, horaIso: `${hoyIso}T${new Date().toTimeString().slice(0, 5)}` })
                              }
                              className={CLASES_BOTON_GRUPO}
                            >
                              Registrar a demanda
                            </button>
                          ) : (
                            horarios.map((h) => {
                              const horaIso = `${hoyIso.slice(0, 10)}T${h.slice(0, 5)}`
                              const registro = buscarDosis(administracionesHoy, med.id, horaIso)
                              const done = registro?.outcome === 'administrada' || registro?.outcome === 'parcial'
                              const failed = registro?.outcome === 'omitida' || registro?.outcome === 'rechazada'
                              return (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => setModal({ med, horaIso })}
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
                      ) : null}
                      {!puedePrescribir && !puedeAdministrar ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : null}
                    </div>
                  }
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {medicaciones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No hay tratamientos registrados.{''}
          {puedePrescribir ? (
            <Link
              href={`/dashboard/residentes/${residentId}/medicaciones/nueva`}
              className="ml-1 font-medium text-teal-700 hover:underline"
            >
              Prescribir el primero →
            </Link>
          ) : null}
        </p>
      ) : null}

      {modal ? (
        <ExecutionModal
          abierto
          onCerrar={() => setModal(null)}
          variante="medicacion"
          titulo="Registrar administración"
          subtitulo={`${modal.med.name} · ${modal.med.dosage}`}
          contexto={`Toma ${modal.horaIso.slice(11)} · ${modal.med.residents ? `${modal.med.residents.first_name} ${modal.med.residents.last_name}` : 'residente'}`}
          valoresIniciales={{
            dose: modal.med.dosage,
            scheduledAt: modal.horaIso,
            defaultRoute: modal.med.route,
            routeOptions: Object.entries(MEDICATION_ROUTE_LABELS).map(([value, label]) => ({ value, label })),
          }}
          accion={
            administerMedicationFromForm.bind(null, modal.med.id) as unknown as (
              previa: ClinicalFormState,
              datos: FormData,
            ) => Promise<ClinicalFormState>
          }
        />
      ) : null}
    </div>
  )
}

/** Resultado de la búsqueda del registro DURO de una toma (medicamento + hora programada). */
interface RegistroToma {
  outcome: string
  administered_at: string
}

/** Busca el registro DURO de una toma concreta (medicamento + hora programada). */
function buscarDosis(
  registros: readonly DosisDeHoy[],
  medicationId: string,
  horaIso: string,
): RegistroToma | undefined {
  const found = registros.find(
    (r) => r.medication_id === medicationId && (r.scheduled_at ?? '').slice(0, 16) === horaIso.slice(0, 16),
  )
  return found ? { outcome: found.outcome, administered_at: found.administered_at } : undefined
}
