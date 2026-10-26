'use client'

/**
 * GeriCare · FASE 7 — Lista móvil de tareas del auxiliar.
 * ----------------------------------------------------------------------
 * Optimizada para 375–430 px y operación con una sola mano:
 *  - Tarjetas apiladas verticalmente por hora ascendente.
 *  - Botón "Ejecutar Tarea" gigante (≥ 56 px de alto, ancho completo).
 *  - Badges de advertencia si la tarea exige signos vitales o fotografía.
 *  - Al tocar Ejecutar se abre el bottom-sheet (`TaskExecutionSheet` + `TaskExecutionModal`).
 */

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { TASK_TYPE_LABELS } from '@/types'
import type { TaskType } from '@/types/database.types'
import type { TareaMovilAuxiliar } from '@/types'
import { TaskExecutionSheet } from '@/components/auxiliar/task-execution-sheet'

interface AuxiliarTareasListProps {
  tareas: TareaMovilAuxiliar[]
}

/** Extrae HH:mm de un timestamp ISO sin depender de zona horaria del cliente. */
function horaDe(timestamp: string): string {
  // El Server Component ya serializa 'YYYY-MM-DDTHH:mm:ss' en hora local.
  const idx = timestamp.indexOf('T')
  return idx >= 0 ? timestamp.slice(idx + 1, idx + 6) : timestamp.slice(0, 5)
}

export function AuxiliarTareasList({ tareas }: AuxiliarTareasListProps) {
  const [activa, setActiva] = useState<TareaMovilAuxiliar | null>(null)

  if (tareas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          ✅
        </p>
        <h2 className="mt-3 text-lg font-bold text-slate-800">Sin tareas pendientes</h2>
        <p className="mt-1 text-sm text-slate-500">
          No tienes tareas asignadas para hoy. Revisa nuevamente al inicio del próximo turno.
        </p>
      </div>
    )
  }

  return (
    <>
      <ol className="space-y-4" aria-label="Lista de tareas asignadas para hoy">
        {tareas.map((tarea) => {
          const tipo = TASK_TYPE_LABELS[tarea.task_type as TaskType] ?? tarea.task_type
          return (
            <li key={tarea.id}>
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {/* Encabezado: hora + badges de requisitos */}
                <div className="flex items-start justify-between gap-3">
                  <time
                    dateTime={tarea.scheduled_time}
                    className="text-2xl font-black tabular-nums tracking-tight text-teal-700"
                  >
                    {horaDe(tarea.scheduled_time)}
                  </time>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {tarea.requires_vitals ? <Badge tone="rose">Requiere signos vitales</Badge> : null}
                    {tarea.requires_photo ? <Badge tone="violet">Requiere foto</Badge> : null}
                  </div>
                </div>

                {/* Cuerpo: residente + tarea */}
                <h3 className="mt-2 text-base font-bold leading-snug text-slate-900">
                  {tarea.resident_name}
                  {tarea.room_number ? (
                    <span className="font-medium text-slate-500"> · Hab. {tarea.room_number}</span>
                  ) : null}
                </h3>
                <p className="mt-0.5 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">{tipo}:</span> {tarea.title}
                </p>

                {/* Acción principal gigante: un toque abre el sheet */}
                <button
                  type="button"
                  onClick={() => setActiva(tarea)}
                  className="mt-4 min-h-14 w-full rounded-2xl bg-teal-700 text-lg font-bold text-white transition-colors active:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  aria-label={`Ejecutar tarea ${tarea.title} de ${tarea.resident_name} a las ${horaDe(tarea.scheduled_time)}`}
                >
                  ▶ Ejecutar Tarea
                </button>
              </article>
            </li>
          )
        })}
      </ol>

      <TaskExecutionSheet task={activa} />
    </>
  )
}
