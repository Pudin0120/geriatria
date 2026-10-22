import { cn } from '@/lib/utils'

/** Bloque esqueleto para estados de carga. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-slate-200/80', className)}
      aria-hidden="true"
    />
  )
}

/** Fila de tarjetas esqueleto para métricas del dashboard. */
export function SkeletonStats({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cantidad }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

/** Tabla esqueleto para listas de datos. */
export function SkeletonTable({ filas = 5 }: { filas?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 rounded-lg" />
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-lg" />
      ))}
    </div>
  )
}
