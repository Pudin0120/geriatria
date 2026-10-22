import { cn } from '@/lib/utils'

/** Bloque pulsante reutilizable para estados de carga (skeletons). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-slate-200', className)}
    />
  )
}

/** Esqueleto de tarjeta de resumen (KPI). */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton className="mb-3 h-4 w-32" />
      <Skeleton className="h-8 w-20" />
    </div>
  )
}

/** Esqueleto de tabla con N filas simuladas. */
export function SkeletonTable({ filas = 5 }: { filas?: number }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
