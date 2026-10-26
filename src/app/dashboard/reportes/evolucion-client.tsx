'use client'

import { Fragment, useState } from 'react'
import type { ResidenteOpcion } from './tipos-evolucion'

interface PuntoEvolucion {
  fecha: string
  barthel: number | null
  mmse: number | null
}

interface EvolucionVgiProps {
  /** Residentes con al menos una VGI (precargados por el RSC padre). */
  opciones: ResidenteOpcion[]
  /** Historiales VGI por residente de id → puntos (asc por fecha). */
  historiales: Record<string, PuntoEvolucion[]>
}

const W = 640
const H = 220
const PAD = { top: 18, right: 16, bottom: 30, left: 34 }

/** Escala simple: valor (min..max) → coordenada Y del SVG. */
function escalarY(valor: number, min: number, max: number): number {
  if (max === min) return (H - PAD.bottom + PAD.top) / 2
  const t = (valor - min) / (max - min)
  return H - PAD.bottom - t * (H - PAD.bottom - PAD.top)
}

/** Serie (puntos con valor no nulo) como polyline + círculos. */
function DibujaSerie(
  puntos: readonly PuntoEvolucion[],
  clave: 'barthel' | 'mmse',
  color: string,
  min: number,
  max: number,
) {
  const validos = puntos
    .map((p, i) => ({ x: i, v: p[clave] }))
    .filter((p): p is { x: number; v: number } => p.v !== null)
  if (validos.length === 0) return null

  const dx = validos.length === 1 ? 0 : (W - PAD.left - PAD.right) / (puntos.length - 1)
  const px = (i: number): number => PAD.left + i * dx + (validos.length === 1 && puntos.length === 1 ? (W - PAD.left - PAD.right) / 2 : 0)

  const trazado = validos.map((p) => `${px(p.x).toFixed(1)},${escalarY(p.v, min, max).toFixed(1)}`).join(' ')
  return (
    <Fragment>
      {validos.length > 1 ? (
        <polyline points={trazado} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      ) : null}
      {validos.map((p) => (
        <circle key={`${clave}-${p.x}`} cx={px(p.x)} cy={escalarY(p.v, min, max)} r="4" fill={color}>
          <title>{`${p.v}`}</title>
        </circle>
      ))}
    </Fragment>
  )
}

/**
 * Gráfico de líneas (SVG puro, sin librerías) para la evolución Barthel/MMSE
 * del residente seleccionado en el dashboard de reportes (Fase 5).
 */
export function EvolucionVgi({ opciones, historiales }: EvolucionVgiProps) {
  const [seleccion, setSeleccion] = useState<string>(opciones[0]?.id ?? '')
  const puntos = historiales[seleccion] ?? []

  const valores = puntos.flatMap((p) => [p.barthel, p.mmse]).filter((v): v is number => v !== null)
  const min = Math.min(...valores, 0)
  const max = Math.max(...valores, 100)

  if (opciones.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Aún no hay residentes con valoraciones VGI.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="residente-vgi" className="text-sm font-medium text-slate-600">
          Residente:
        </label>
        <select
          id="residente-vgi"
          value={seleccion}
          onChange={(e) => setSeleccion(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-teal-500 focus:outline-none"
        >
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        <span className="ms-auto flex items-center gap-4 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 text-teal-700">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-teal-600" /> Barthel (0–100)
          </span>
          <span className="inline-flex items-center gap-1.5 text-violet-700">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-violet-500" /> MMSE (0–30)
          </span>
        </span>
      </div>

      {puntos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Este residente no tiene valoraciones registradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Evolución Barthel y MMSE de ${opciones.find((o) => o.id === seleccion)?.nombre ?? ''} (${puntos.length} valoraciones)`}
            className="h-auto w-full max-w-2xl"
          >
            {/* Rejilla horizontal (5 líneas) */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = PAD.top + t * (H - PAD.top - PAD.bottom)
              return <line key={t} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            })}
            {/* Etiquetas del eje Y */}
            {[max, Math.round((max + min) / 2), min].map((v, idx) => (
              <text key={v} x={PAD.left - 6} y={escalarY(v, min, max) + 4} textAnchor="end" fontSize="10" fill="#64748b">
                {idx === 0 ? v : v}
              </text>
            ))}
            {/* Eje X: fechas (primera, última y hasta 3 intermedias) */}
            {puntos.map((p, i) => {
              const mostrar =
                puntos.length <= 6 || i === 0 || i === puntos.length - 1 || i % Math.ceil((puntos.length - 1) / 4) === 0
              if (!mostrar) return null
              const dx = puntos.length === 1 ? 0 : (W - PAD.left - PAD.right) / (puntos.length - 1)
              return (
                <text
                  key={p.fecha}
                  x={PAD.left + i * dx + (puntos.length === 1 ? (W - PAD.left - PAD.right) / 2 : 0)}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#94a3b8"
                >
                  {p.fecha.slice(5)}
                </text>
              )
            })}
            {DibujaSerie(puntos, 'barthel', '#0d9488', min, max)}
            {DibujaSerie(puntos, 'mmse', '#8b5cf6', min, max)}
          </svg>
        </div>
      )}
    </div>
  )
}
