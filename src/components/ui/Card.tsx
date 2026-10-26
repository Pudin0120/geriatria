import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  id?: string
}

/** Tarjeta base con sombra suave y bordes redondeados. */
export function Card({ children, className, id }: CardProps) {
  return (
    <div
      id={id}
      className={cn(
        'rounded-2xl border border-[#e1e9e4] bg-white shadow-[0_2px_10px_rgba(27,48,46,0.035)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

/** Encabezado de tarjeta con título, subtítulo opcional y acción a la derecha. */
export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-[#edf1ee] px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-[#1b302e]">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-xs leading-5 text-[#71817c]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
}

/** Cuerpo con relleno estándar para el contenido de la tarjeta. */
export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn('px-5 py-5 sm:px-6', className)}>{children}</div>
}
