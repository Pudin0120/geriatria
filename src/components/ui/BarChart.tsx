import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/reportes'

/** Clases de color por tono para las barras. */
const BARRAS: Readonly<Record<Tone, string>> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  slate: 'bg-slate-400',
}

export interface BarChartDataItem {
  etiqueta: string
  valor: number
  tone?: Tone
}

interface BarChartProps {
  data: readonly BarChartDataItem[]
  /** Altura del área de trazado en píxeles (por defecto 160). */
  alto?: number
  /** Sufijo para los valores (ej. « residentes», « tomas»). */
  sufijo?: string
  /** Texto cuando no hay datos. */
  vacioMensaje?: string
}

/**
 * Gráfico de barras verticales construido únicamente con divs y Tailwind
 * (sin librerías externas). Accesible vía tabla oculta para lectores de pantalla.
 */
export function BarChart({ data, alto = 160, sufijo, vacioMensaje = 'Sin datos para mostrar.' }: BarChartProps) {
  const maximo = Math.max(1, ...data.map((d) => d.valor))
  const tieneDatos = data.length > 0 && data.some((d) => d.valor > 0)

  return (
    <div role="img" aria-label={`Gráfico de barras: ${data.map((d) => `${d.etiqueta} ${d.valor}`).join(', ') || 'sin datos'}`}>
      {!tieneDatos ? (
        <p className="py-8 text-center text-sm text-slate-400">{vacioMensaje}</p>
      ) : (
        <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: alto + 44 }}>
          {data.map((item) => {
            const alturaPx = Math.round((item.valor / maximo) * alto)
            return (
              <div key={item.etiqueta} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  {item.valor}
                  {sufijo ? <span className="font-normal text-slate-400">{sufijo}</span> : null}
                </span>
                <div
                  className={cn('w-full max-w-12 rounded-t-md transition-all', BARRAS[item.tone ?? 'sky'])}
                  style={{ height: Math.max(alturaPx, item.valor > 0 ? 4 : 0) }}
                />
                <span className="line-clamp-2 text-center text-[11px] leading-tight text-slate-500">
                  {item.etiqueta}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Versión horizontal, ideal para muchas categorías con etiquetas largas
 * (p. ej. ocupación por habitación).
 */
export function BarChartHorizontal({ data, sufijo }: { data: readonly BarChartDataItem[]; sufijo?: string }) {
  const maximo = Math.max(1, ...data.map((d) => d.valor))
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Sin datos para mostrar.</p>
  }
  return (
    <ul className="space-y-2.5">
      {data.map((item) => (
        <li key={item.etiqueta}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium text-slate-600">{item.etiqueta}</span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {item.valor}
              {sufijo ? <span className="font-normal text-slate-400">{sufijo}</span> : null}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full bg-teal-500', item.tone ? BARRAS[item.tone] : '')}
              style={{ width: `${Math.round((item.valor / maximo) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
