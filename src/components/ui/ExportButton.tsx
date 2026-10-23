'use client'

import { generarCsv } from '@/lib/reportes'

interface ExportButtonProps {
  /** Encabezados del CSV (en español). */
  headers: readonly string[]
  /** Datos planos de las filas (null → celda vacía). */
  rows: readonly (readonly (string | number | null)[])[]
  /** Nombre base del archivo descargado (sin extensión). */
  filename: string
  label?: string
}

/**
 * Botón «Exportar CSV» (Fase 5): genera el archivo en el navegador a partir
 * de datos ya serializados desde el Server Component y lo descarga con BOM
 * UTF-8 para compatibilidad con Excel.
 */
export function ExportButton({ headers, rows, filename, label = 'Exportar CSV' }: ExportButtonProps) {
  function alExportar() {
    try {
      const csv = generarCsv(headers, rows.map((r) => [...r]))
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      const fecha = new Date().toISOString().slice(0, 10)
      enlace.href = url
      enlace.download = `${filename}-${fecha}.csv`
      document.body.appendChild(enlace)
      enlace.click()
      document.body.removeChild(enlace)
      URL.revokeObjectURL(url)
    } catch {
      // Sin acción: el botón queda disponible para reintentar.
    }
  }

  return (
    <button
      type="button"
      onClick={alExportar}
      disabled={rows.length === 0}
      title={rows.length === 0 ? 'No hay datos para exportar' : `Descargar ${rows.length} registros en CSV`}
      className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-40 print:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      {label}
      <span className="rounded bg-white/20 px-1.5 text-xs tabular-nums">{rows.length}</span>
    </button>
  )
}
