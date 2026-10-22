'use client'

import { Badge, PriorityBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { TASK_TYPE_LABELS, type CareTaskRow, type ResidentRow } from '@/types'

/** Tarea del día con el residente asignado (JOIN plano de Supabase). */
export interface TaskCardResident {
  id: string
  first_name: string
  last_name: string
  room_number: string | null
}

export interface TaskCardProps {
  task: CareTaskRow
  resident: TaskCardResident | null
  /** Nombre del profesional asignado, si existe. */
  assigneeName?: string | null
  /** La tarea ya tiene una ejecución registrada hoy (se muestra atenuada). */
  ejecutadaHoy?: boolean
  /** Resultado registrado hoy ('completada' en verde, 'omitida'/'cancelada' en rojo/ámbar). */
  outcomeHoy?: CareTaskRow['status'] | null
  /** Callback del botón de acción rápida (abre el modal de ejecución). */
  onEjecutar?: (task: CareTaskRow, resident: TaskCardResident | null) => void
  className?: string
}

function nombreCorto(resident: TaskCardResident): string {
  return `${resident.first_name} ${resident.last_name.split(' ')[0] ?? ''}`.trim()
}

/**
 * Tarjeta compacta de tarea pendiente: hora grande, tipo, residente
 * asignado, prioridad y botón de acción («Marcar como completada»).
 * Diseñada para la vista «Tareas del Día» en pantallas táctiles.
 */
export function TaskCard({
  task,
  resident,
  assigneeName,
  ejecutadaHoy = false,
  outcomeHoy = null,
  onEjecutar,
  className,
}: TaskCardProps) {
  const completada = ejecutadaHoy && outcomeHoy === 'completada'
  const noRealizada = ejecutadaHoy && (outcomeHoy === 'omitida' || outcomeHoy === 'cancelada')

  return (
    <article
      className={cn(
        'flex items-stretch gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors sm:p-4',
        completada
          ? 'border-emerald-200 bg-emerald-50/60'
          : noRealizada
            ? 'border-rose-200 bg-rose-50/60'
            : 'border-slate-200 hover:border-teal-300',
        className,
      )}
      aria-label={`Tarea ${task.title} a las ${task.scheduled_time.slice(0, 5)}`}
    >
      {/* Hora de la tarea */}
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-50 py-2">
        <span className="text-lg font-bold leading-none text-slate-800">{task.scheduled_time.slice(0, 5)}</span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
          {task.frequency === 'diaria' ? 'cada día' : task.frequency.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Cuerpo */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-semibold text-slate-900">{task.title}</h3>
          <PriorityBadge priority={task.priority} />
          {completada ? <Badge tone="emerald">✓ Registrada</Badge> : null}
          {noRealizada ? <Badge tone="rose">✕ Sin completar</Badge> : null}
        </div>

        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">{TASK_TYPE_LABELS[task.task_type]}</span>
          {resident ? (
            <>
              {' · '}
              <span className="font-medium text-slate-700">{nombreCorto(resident)}</span>
              {resident.room_number ? ` (hab. ${resident.room_number})` : ''}
            </>
          ) : null}
          {assigneeName ? ` · Asignada a ${assigneeName}` : ''}
        </p>

        {task.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">{task.description}</p>
        ) : null}
      </div>

      {/* Acción rápida */}
      <div className="flex shrink-0 flex-col items-end justify-center gap-2">
        {onEjecutar ? (
          <Button
            size="sm"
            variant={completada ? 'secondary' : 'primary'}
            onClick={() => onEjecutar(task, resident)}
            aria-label={completada ? `Reabrir registro de la tarea ${task.title}` : `Marcar como completada: ${task.title}`}
          >
            {completada ? 'Ver / repetir' : noRealizada ? 'Registrar' : 'Completar'}
          </Button>
        ) : null}
      </div>
    </article>
  )
}

/** Reexporta el tipo de residente para que las páginas lo tipen sin duplicar. */
export type TaskCardResidentRef = ResidentRow['id']
