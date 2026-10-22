import type { ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { MEDICATION_ROUTE_LABELS, type MedicationRow } from '@/types'

/** Estado derivado de una medicación según su actividad y ventana temporal. */
export type MedicationState = 'activo' | 'suspendido' | 'pendiente' | 'finalizado'

export function medicationStateOf(med: MedicationRow, hoyIso: string): MedicationState {
  if (!med.active) return 'suspendido'
  if (med.start_date > hoyIso) return 'pendiente'
  if (med.end_date !== null && med.end_date < hoyIso) return 'finalizado'
  return 'activo'
}

const TONOS_ESTADO: Readonly<Record<MedicationState, BadgeTone>> = {
  activo: 'emerald',
  suspendido: 'slate',
  pendiente: 'sky',
  finalizado: 'amber',
}

const ETIQUETAS_ESTADO: Readonly<Record<MedicationState, string>> = {
  activo: 'Activo',
  suspendido: 'Suspendido',
  pendiente: 'Pendiente',
  finalizado: 'Finalizado',
}

/** Horarios 'HH:mm:ss' → lista legible '08:00 · 14:00 · 22:00'. */
export function formatearHorarios(scheduleTimes: readonly string[]): string {
  if (scheduleTimes.length === 0) return 'Sin horarios fijos'
  return [...scheduleTimes].sort().map((t) => t.slice(0, 5)).join(' · ')
}

export interface MedicationRowProps {
  medication: MedicationRow
  /** Fecha ISO 'YYYY-MM-DD' de referencia (la del turno/vista actual). */
  hoyIso: string
  /** Enlace al detalle del residente (para el nombre, si se muestra). */
  residentHref?: string
  residentName?: string
  /** Columna extra opcional (p. ej. botón «Administrar» en la vista de enfermería). */
  action?: ReactNode
}

/**
 * Fila de tabla para un medicamento con badges de estado
 * (Activo/Suspendido/Pendiente/Finalizado), vía, dosis y horarios.
 * Es un Server Component puro (solo presentación).
 */
export function MedicationRowItem({
  medication,
  hoyIso,
  residentHref,
  residentName,
  action,
}: MedicationRowProps) {
  const estado = medicationStateOf(medication, hoyIso)

  return (
    <tr className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70">
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{medication.name}</p>
        {medication.generic_name ? (
          <p className="text-xs text-slate-400">{medication.generic_name}</p>
        ) : null}
        {residentName ? (
          residentHref ? (
            <Link
              href={residentHref}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              {residentName}
            </Link>
          ) : (
            <p className="text-xs text-slate-500">{residentName}</p>
          )
        ) : null}
      </td>

      <td className="px-4 py-3 text-sm text-slate-700">
        <span className="font-medium">{medication.dosage}</span>
        {medication.presentation ? (
          <p className="text-xs text-slate-400">{medication.presentation}</p>
        ) : null}
      </td>

      <td className="px-4 py-3 text-sm text-slate-700">
        {MEDICATION_ROUTE_LABELS[medication.route]}
      </td>

      <td className="px-4 py-3">
        <p className="text-sm tabular-nums text-slate-700">{formatearHorarios(medication.schedule_times)}</p>
        <p className="text-xs capitalize text-slate-400">{medication.frequency.replace(/_/g, ' ')}</p>
      </td>

      <td className="px-4 py-3">
        <Badge tone={TONOS_ESTADO[estado]}>{ETIQUETAS_ESTADO[estado]}</Badge>
        {medication.end_date ? (
          <p className="mt-1 text-xs text-slate-400">hasta {medication.end_date.slice(0, 10)}</p>
        ) : null}
      </td>

      {action !== undefined ? <td className="px-4 py-3 text-right">{action}</td> : null}
    </tr>
  )
}

/** Cabecera estándar de la tabla de medicaciones (coincide con MedicationRowItem). */
export function MedicationTableHead({ withAction = false }: { withAction?: boolean }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
        <th scope="col" className="px-4 py-3">Medicamento</th>
        <th scope="col" className="px-4 py-3">Dosis</th>
        <th scope="col" className="px-4 py-3">Vía</th>
        <th scope="col" className="px-4 py-3">Horarios</th>
        <th scope="col" className="px-4 py-3">Estado</th>
        {withAction ? <th scope="col" className="px-4 py-3 text-right">Acción</th> : null}
      </tr>
    </thead>
  )
}
