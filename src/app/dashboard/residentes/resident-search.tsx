'use client'

import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ResidentRow, ResidentStatus } from '@/types'
import { RESIDENT_STATUS_LABELS } from '@/types'
import { ResidentCard } from '@/components/ui/ResidentCard'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

interface ResidentSearchProps {
  residentes: ResidentRow[]
}

type Filtro = ResidentStatus | 'todos'

const FILTROS: ReadonlyArray<Filtro> = [
  'todos',
  'activo',
  'ingresado',
  'baja_voluntaria',
  'fallecido',
]

/**
 * Zona interactiva del listado de residentes (Fase 3): barra de búsqueda
 * por nombre/apellido y filtro visual por estado con badges de colores.
 * Recibe los datos ya cargados desde el Server Component (RLS aplica en BD).
 */
export function ResidentSearch({ residentes }: ResidentSearchProps) {
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const normalizar = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const filtrados = residentes.filter((r) => {
    if (filtro !== 'todos' && r.status !== filtro) return false
    if (texto.trim().length === 0) return true
    const busca = normalizar(texto.trim())
    return (
      normalizar(`${r.first_name} ${r.last_name}`).includes(busca) ||
      normalizar(r.room_number ?? '').includes(busca)
    )
  })

  const contar = (estado: Filtro): number =>
    estado === 'todos' ? residentes.length : residentes.filter((r) => r.status === estado).length

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda */}
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.4l3.08 3.07a.75.75 0 1 1-1.06 1.06l-3.08-3.07A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
        </span>
        <input
          type="search"
          value={texto}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, apellidos o habitación…"
          aria-label="Buscar residentes"
          className="block min-h-12 w-full rounded-2xl border border-[#d9e4dd] bg-white pl-10 pr-4 text-sm text-slate-900 shadow-[0_2px_8px_rgba(27,48,46,.025)] placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#176b5b]"
        />
      </div>

      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((estado) => {
          const activo = filtro === estado
          const etiqueta = estado === 'todos' ? 'Todos' : RESIDENT_STATUS_LABELS[estado]
          return (
            <button
              key={estado}
              type="button"
              onClick={() => setFiltro(estado)}
              aria-pressed={activo}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors',
                activo
                  ? 'bg-[#176b5b] text-white ring-[#176b5b]'
                  : 'bg-white text-slate-600 ring-[#d9e4dd] hover:bg-[#f3f7f4]',
              )}
            >
              {etiqueta}
              <span className={cn('rounded-full px-1.5 py-0.5 tabular-nums', activo ? 'bg-white/15 text-white' : 'bg-[#f1f5f2] text-slate-500')}>
                {contar(estado)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Resultados */}
      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm font-medium text-slate-600">No se encontraron residentes</p>
          <p className="mt-1 text-xs text-slate-400">
            Prueba con otro término de búsqueda o cambia el filtro de estado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((residente) => (
            <ResidentCard key={residente.id} resident={residente} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Esqueleto de la rejilla de residentes mientras llegan los datos. */
export function ResidentGridSkeleton() {
  return <SkeletonTable filas={6} />
}
