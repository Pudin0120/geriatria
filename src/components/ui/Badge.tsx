import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone =
  | 'teal'
  | 'sky'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'emerald'
  | 'violet'

const TONOS: Readonly<Record<BadgeTone, string>> = {
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

/** Etiqueta compacta de estado/rol con tono de color semántico. */
export function Badge({ children, tone = 'slate', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONOS[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Mapeadores semánticos reutilizables (en español)                    */
/* ------------------------------------------------------------------ */

import type { FrailtyLevel, ResidentStatus, TaskPriority, TaskStatus, UserRole } from '@/types'
import {
  FRAILTY_LEVEL_LABELS,
  RESIDENT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  USER_ROLE_LABELS,
} from '@/types'

export function roleTone(role: UserRole): BadgeTone {
  switch (role) {
    case 'admin':
      return 'violet'
    case 'nurse_jefe':
      return 'teal'
    case 'medico':
      return 'sky'
    case 'auxiliar':
      return 'slate'
  }
}

export function taskStatusTone(status: TaskStatus): BadgeTone {
  switch (status) {
    case 'completada':
      return 'emerald'
    case 'en_curso':
      return 'sky'
    case 'programada':
      return 'slate'
    case 'omitida':
      return 'amber'
    case 'cancelada':
      return 'rose'
  }
}

export function residentStatusTone(status: ResidentStatus): BadgeTone {
  switch (status) {
    case 'activo':
      return 'emerald'
    case 'ingresado':
      return 'sky'
    case 'baja_voluntaria':
      return 'amber'
    case 'fallecido':
      return 'slate'
  }
}

export function priorityTone(priority: TaskPriority): BadgeTone {
  switch (priority) {
    case 'urgente':
      return 'rose'
    case 'alta':
      return 'amber'
    case 'normal':
      return 'sky'
    case 'baja':
      return 'slate'
  }
}

/** Semáforo del nivel de fragilidad (rojo → ámbar → verde). */
const TONO_FRAGILIDAD: Readonly<Record<FrailtyLevel, BadgeTone>> = {
  fragil: 'rose',
  pre_fragil: 'amber',
  robusto: 'emerald',
}

export function frailtyTone(level: FrailtyLevel): BadgeTone {
  return TONO_FRAGILIDAD[level]
}

/** Badge convenience: rol de usuario. */
export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={roleTone(role)}>{USER_ROLE_LABELS[role]}</Badge>
}

/** Badge convenience: estado de tarea. */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={taskStatusTone(status)}>{TASK_STATUS_LABELS[status]}</Badge>
}

/** Badge convenience: estado de residente. */
export function ResidentStatusBadge({ status }: { status: ResidentStatus }) {
  return (
    <Badge tone={residentStatusTone(status)}>{RESIDENT_STATUS_LABELS[status]}</Badge>
  )
}

/** Badge convenience: prioridad de tarea. */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={priorityTone(priority)}>{TASK_PRIORITY_LABELS[priority]}</Badge>
}

/** Badge convenience: nivel de fragilidad (Fase 3). */
export function FrailtyBadge({ level }: { level: FrailtyLevel }) {
  return <Badge tone={frailtyTone(level)}>{FRAILTY_LEVEL_LABELS[level]}</Badge>
}
