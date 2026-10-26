import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/reportes'

const PUNTOS: Readonly<Record<Tone, string>> = {
  emerald: 'bg-emerald-500 ring-emerald-100',
  amber: 'bg-amber-500 ring-amber-100',
  rose: 'bg-rose-500 ring-rose-100',
  sky: 'bg-sky-500 ring-sky-100',
  slate: 'bg-slate-400 ring-slate-100',
}

export interface TimelineEvent {
  id: string
  /** Fecha/hora ya formateada en español (ej. «12/03/2026 08:30»). */
  fecha: string
  titulo: string
  descripcion?: string
  tone?: Tone
  icono?: ReactNode
}

interface TimelineProps {
  eventos: readonly TimelineEvent[]
  /** Mensaje cuando la lista está vacía. */
  vacioMensaje?: string
}

/**
 * Línea de tiempo clínica vertical (Fase 5): eventos cronológicos con
 * punto de color, fecha, título y detalle. Usada en el reporte individual
 * (ingresos, valoraciones VGI, cambios de estado, adversos…).
 */
export function Timeline({ eventos, vacioMensaje = 'Sin eventos registrados.' }: TimelineProps) {
  if (eventos.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">{vacioMensaje}</p>
  }
  return (
    <ol className="relative space-y-6 border-l-2 border-slate-200 pl-6 print:break-inside-avoid">
      {eventos.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4',
              PUNTOS[e.tone ?? 'slate'],
            )}
          >
            {e.icono ? <span className="h-2.5 w-2.5 text-white">{e.icono}</span> : null}
          </span>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{e.fecha}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800">{e.titulo}</p>
          {e.descripcion ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{e.descripcion}</p> : null}
        </li>
      ))}
    </ol>
  )
}
