import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  RESIDENT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  USER_ROLE_LABELS,
} from '@/types'
import type { ResidentStatus, TaskPriority, UserRole } from '@/types'

type Tone =
  | 'gris'
  | 'azul'
  | 'verde'
  | 'ambar'
  | 'rojo'
  | 'violeta'

const ESTILOS_TONE: Readonly<Record<Tone, string>> = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-200',
  azul: 'bg-blue-50 text-blue-700 ring-blue-200',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  rojo: 'bg-red-50 text-red-700 ring-red-200',
  violeta: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export interface BadgeProps {
  children: ReactNode
  tone?: Tone
  className?: string
}

/** Etiqueta pequeña tipo "chip" para estados, roles y prioridades. */
export function Badge({ children, tone = 'gris', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        ESTILOS_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* --------------------------------------------------------------- */
/* Badges semánticos con mapas de etiquetas de @/types              */
/* --------------------------------------------------------------- */

const TONO_ROL: Readonly<Record<UserRole, Tone>> = {
  admin: 'violeta',
  nurse_jefe: 'azul',
  medico: 'verde',
  auxiliar: 'ambar',
}

export function RolBadge({ rol, className }: { rol: UserRole; className?: string }) {
  return (
    <Badge tone={TONO_ROL[rol]} className={className}>
      {USER_ROLE_LABELS[rol]}
    </Badge>
  )
}

const TONO_ESTADO_RESIDENTE: Readonly<Record<ResidentStatus, Tone>> = {
  activo: 'verde',
  ingresado: 'azul',
  baja_voluntaria: 'ambar',
  fallecido: 'rojo',
}

export function EstadoResidenteBadge({
  estado,
  className,
}: {
  estado: ResidentStatus
  className?: string
}) {
  return (
    <Badge tone={TONO_ESTADO_RESIDENTE[estado]} className={className}>
      {RESIDENT_STATUS_LABELS[estado]}
    </Badge>
  )
}

const TONO_PRIORIDAD: Readonly<Record<TaskPriority, Tone>> = {
  baja: 'gris',
  normal: 'azul',
  alta: 'ambar',
  urgente: 'rojo',
}

export function PrioridadBadge({
  prioridad,
  className,
}: {
  prioridad: TaskPriority
  className?: string
}) {
  return (
    <Badge tone={TONO_PRIORIDAD[prioridad]} className={className}>
      {TASK_PRIORITY_LABELS[prioridad]}
    </Badge>
  )
}
