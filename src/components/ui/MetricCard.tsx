import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/reportes'

/** Clases de fondo/texto por tono semafórico (coherente con Badge y BarChart). */
const TONOS: Readonly<Record<Tone, { chip: string; barra: string }>> = {
  emerald: { chip: 'bg-emerald-50 text-emerald-700', barra: 'bg-emerald-500' },
  amber: { chip: 'bg-amber-50 text-amber-800', barra: 'bg-amber-500' },
  rose: { chip: 'bg-rose-50 text-rose-700', barra: 'bg-rose-500' },
  sky: { chip: 'bg-sky-50 text-sky-700', barra: 'bg-sky-500' },
  slate: { chip: 'bg-slate-100 text-slate-600', barra: 'bg-slate-400' },
}

export type MetricTendencia = 'arriba' | 'abajo' | 'plana'

interface MetricCardProps {
  /** Título del indicador (ej. «Residentes activos»). */
  titulo: string
  /** Valor grande ya formateado en español (ej. «24» o «87,5 %»). */
  valor: string
  subtitulo?: string
  /** Icono SVG decorativo (viewBox 24). */
  icono?: ReactNode
  tone?: Tone
  /** Texto de tendencia opcional (ej. «+3 vs ayer»). */
  tendencia?: string
  tendenciaDireccion?: MetricTendencia
}

/** Flecha de tendencia según dirección. */
function Flecha({ direccion }: { direccion: MetricTendencia }) {
  if (direccion === 'arriba') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
        <path d="M12 19V5m0 0-6 6m6-6 6 6" />
      </svg>
    )
  }
  if (direccion === 'abajo') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
        <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
      <path d="M5 12h14" />
    </svg>
  )
}

/**
 * Tarjeta de KPI (Fase 5): título, valor destacado, icono, tono semafórico
 * y tendencia opcional ↑/↓. Legible e imprimible.
 */
export function MetricCard({
  titulo,
  valor,
  subtitulo,
  icono,
  tone = 'slate',
  tendencia,
  tendenciaDireccion = 'plana',
}: MetricCardProps) {
  const tonos = TONOS[tone]
  return (
    <article
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
        {icono ? (
          <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tonos.chip)}>
            <span className="h-5 w-5">{icono}</span>
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{valor}</p>
      {subtitulo ? <p className="mt-1 text-xs text-slate-500">{subtitulo}</p> : null}
      {tendencia ? (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
            tonos.chip,
          )}
        >
          <Flecha direccion={tendenciaDireccion} />
          {tendencia}
        </p>
      ) : null}
    </article>
  )
}
