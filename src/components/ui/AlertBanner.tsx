'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AlertSummary, ClinicalAlert } from '@/lib/reportes'

const ESTILOS_POR_NIVEL: Readonly<Record<ClinicalAlert['level'], { caja: string; punto: string; boton: string }>> = {
  critico: {
    caja: 'border-rose-300 bg-rose-50 text-rose-900',
    punto: 'bg-rose-600',
    boton: 'text-rose-800 hover:bg-rose-100',
  },
  advertencia: {
    caja: 'border-amber-300 bg-amber-50 text-amber-900',
    punto: 'bg-amber-500',
    boton: 'text-amber-800 hover:bg-amber-100',
  },
  info: {
    caja: 'border-sky-300 bg-sky-50 text-sky-900',
    punto: 'bg-sky-500',
    boton: 'text-sky-800 hover:bg-sky-100',
  },
}

/** Hora local compacta (HH:mm) para la marca «actualizado a las …». */
function horaCortaIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface AlertBannerProps {
  resumen: AlertSummary
  children?: ReactNode
}

/**
 * Banner superior de alertas clínicas del turno (Fase 5). Los datos se
 * calculan en el Server Component del layout al cargar la página; este
 * cliente solo gestiona el plegado/expansión y el cierre manual.
 */
export function AlertBanner({ resumen }: AlertBannerProps) {
  const [abierta, setAbierta] = useState(true)
  const [desplegada, setDesplegada] = useState(false)

  if (!abierta || resumen.alerts.length === 0) return null

  const criticas = resumen.alerts.filter((a) => a.level === 'critico').length
  const visibles = desplegada ? resumen.alerts : resumen.alerts.slice(0, 3)

  return (
    <section
      aria-label="Alertas clínicas del turno"
      className={`rounded-xl border px-4 py-3 shadow-sm print:hidden ${
        criticas > 0 ? ESTILOS_POR_NIVEL.critico.caja : ESTILOS_POR_NIVEL.advertencia.caja
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden
          className={`inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full ${
            criticas > 0 ? ESTILOS_POR_NIVEL.critico.punto : ESTILOS_POR_NIVEL.advertencia.punto
          }`}
        />
        <h2 className="text-sm font-bold">
          ⚠ {resumen.alerts.length} alerta{resumen.alerts.length === 1 ? '' : 's'} en el turno actual
        </h2>
        <p className="text-xs opacity-80 tabular-nums">
          Urgentes sin completar: {resumen.urgentesSinCompletar} · Medicaciones pendientes:{' '}
          {resumen.medicacionesPendientes} · Signos fuera de rango: {resumen.signosFueraDeRango} · Actualizado{' '}
          {horaCortaIso(resumen.generatedAt)}
        </p>
        <div className="ms-auto flex items-center gap-1">
          {resumen.alerts.length > 3 ? (
            <button
              type="button"
              onClick={() => setDesplegada((v) => !v)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                criticas > 0 ? ESTILOS_POR_NIVEL.critico.boton : ESTILOS_POR_NIVEL.advertencia.boton
              }`}
            >
              {desplegada ? 'Ver menos' : `Ver todas (${resumen.alerts.length})`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setAbierta(false)}
            aria-label="Ocultar alertas"
            className={`rounded-md px-2 py-1 text-xs font-semibold ${
              criticas > 0 ? ESTILOS_POR_NIVEL.critico.boton : ESTILOS_POR_NIVEL.advertencia.boton
            }`}
          >
            ✕
          </button>
        </div>
      </div>

      <ul className="mt-2 space-y-1.5">
        {visibles.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 shrink-0 self-center rounded-full ${ESTILOS_POR_NIVEL[a.level].punto}`}
            />
            <strong className="font-semibold">{a.titulo}:</strong>
            <span className="opacity-90">{a.detalle}</span>
            {a.href ? (
              <a href={a.href} className="font-semibold underline decoration-1 underline-offset-2 hover:opacity-75">
                Atender →
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
