'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

/* ==================================================================== */
/* Tipos genéricos (cero `any`: columnas tipadas por el consumidor)     */
/* ==================================================================== */

export interface Columna<T> {
  /** Clave única de la columna. */
  id: string
  header: string
  /** Extrae el valor de celda a partir de la fila. */
  cell: (row: T) => React.ReactNode
  /** Valor plano usado para ordenar/filtrar (si se omite, la columna no es ordenable). */
  sortableValue?: (row: T) => string | number | null
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: readonly Columna<T>[]
  rows: readonly T[]
  /** Clave única de cada fila. */
  rowKey: (row: T) => string
  /** Búsqueda global por texto (case-insensitive). */
  searchable?: boolean
  placeholderBusqueda?: string
  /** Tamaño de página; 0 desactiva la paginación. */
  pageSize?: number
  emptyMessage?: string
  caption?: string
}

type Direccion = 'asc' | 'desc'

/**
 * Tabla reutilizable (Fase 5) con búsqueda, ordenamiento por columna y
 * paginación del lado del cliente. Pensada para vistas de auditoría y
 * listados de reporte donde el conjunto ya viene filtrado/paginado por BD
 * (en ese caso se pasa `pageSize={0}`).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchable = false,
  placeholderBusqueda = 'Buscar…',
  pageSize = 20,
  emptyMessage = 'No hay registros para mostrar.',
  caption,
}: DataTableProps<T>) {
  const [busqueda, setBusqueda] = useState('')
  const [ordenId, setOrdenId] = useState<string | null>(null)
  const [direccion, setDireccion] = useState<Direccion>('asc')
  const [pagina, setPagina] = useState(1)

  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return rows.slice()
    const q = busqueda.toLowerCase()
    return rows.filter((row) =>
      columns.some((col) => {
        if (!col.sortableValue) return false
        const v = col.sortableValue(row)
        return v !== null && String(v).toLowerCase().includes(q)
      }),
    )
  }, [rows, busqueda, columns])

  const ordenadas = useMemo(() => {
    if (!ordenId) return filtradas
    const col = columns.find((c) => c.id === ordenId)
    if (!col?.sortableValue) return filtradas
    const extraer = col.sortableValue
    const copia = filtradas.slice()
    copia.sort((a, b) => {
      const va = extraer(a)
      const vb = extraer(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return direccion === 'asc' ? va - vb : vb - va
      }
      return direccion === 'asc'
        ? String(va).localeCompare(String(vb), 'es')
        : String(vb).localeCompare(String(va), 'es')
    })
    return copia
  }, [filtradas, ordenId, direccion, columns])

  const totalPaginas = pageSize > 0 ? Math.max(1, Math.ceil(ordenadas.length / pageSize)) : 1
  const paginaSegura = Math.min(pagina, totalPaginas)
  const visibles =
    pageSize > 0 ? ordenadas.slice((paginaSegura - 1) * pageSize, paginaSegura * pageSize) : ordenadas

  function alOrdenar(id: string) {
    if (ordenId === id) {
      setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setOrdenId(id)
      setDireccion('asc')
    }
    setPagina(1)
  }

  return (
    <div className="space-y-3">
      {searchable ? (
        <div className="flex items-center justify-between gap-3">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setPagina(1)
            }}
            placeholder={placeholderBusqueda}
            aria-label="Buscar en la tabla"
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <span className="shrink-0 text-xs text-slate-500 tabular-nums">
            {ordenadas.length} registro{ordenadas.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => {
                const ordenable = Boolean(col.sortableValue)
                return (
                  <th
                    key={col.id}
                    scope="col"
                    className={cn(
                      'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    )}
                  >
                    {ordenable ? (
                      <button
                        type="button"
                        onClick={() => alOrdenar(col.id)}
                        className="inline-flex items-center gap-1 hover:text-teal-700"
                        aria-label={`Ordenar por ${col.header}`}
                      >
                        {col.header}
                        <span aria-hidden className="text-[10px]">
                          {ordenId === col.id ? (direccion === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibles.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-slate-50/70">
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        'px-4 py-2.5 align-top text-slate-700',
                        col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : '',
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && totalPaginas > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Paginación">
          <p className="text-xs text-slate-500">
            Página {paginaSegura} de {totalPaginas}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaSegura <= 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaSegura >= totalPaginas}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}
