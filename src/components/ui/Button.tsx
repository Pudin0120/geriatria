'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

type Variante = 'primaria' | 'secundaria' | 'peligro' | 'fantasma'
type Tamano = 'sm' | 'md' | 'lg'

const ESTILOS_VARIANTE: Readonly<Record<Variante, string>> = {
  primaria:
    'bg-blue-700 text-white hover:bg-blue-800 focus-visible:outline-blue-700 disabled:hover:bg-blue-700',
  secundaria:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  peligro:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 disabled:hover:bg-red-600',
  fantasma:
    'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
}

const ESTILOS_TAMANO: Readonly<Record<Tamano, string>> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamano?: Tamano
}

/** Botón base accesible con variantes semánticas en español. */
export function Button({
  variante = 'primaria',
  tamano = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ESTILOS_VARIANTE[variante],
        ESTILOS_TAMANO[tamano],
        className,
      )}
      {...props}
    />
  )
}

/** Botón de envío para formularios con Server Actions (deshabilita durante la acción). */
export function SubmitButton({
  children,
  textoCargando = 'Procesando…',
  className,
  variante = 'primaria',
  tamano = 'md',
}: {
  children: ReactNode
  textoCargando?: string
  className?: string
  variante?: Variante
  tamano?: Tamano
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      variante={variante}
      tamano={tamano}
      className={className}
    >
      {pending ? textoCargando : children}
    </Button>
  )
}
