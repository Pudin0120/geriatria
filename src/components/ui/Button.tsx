'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const VARIANTES: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'bg-[#176b5b] text-white shadow-sm hover:bg-[#104f45] focus-visible:outline-[#176b5b] disabled:bg-[#176b5b]/50',
  secondary:
    'border border-[#d9e4dd] bg-white text-[#294640] shadow-sm hover:bg-[#f4f8f5] focus-visible:outline-[#6a9f8c] disabled:text-slate-400',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 disabled:bg-rose-600/50',
  ghost:
    'text-slate-600 hover:bg-[#edf3ef] hover:text-slate-900 focus-visible:outline-slate-400',
}

const TAMANOS: Readonly<Record<ButtonSize, string>> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Muestra un spinner y deshabilita el botón mientras su formulario envía. */
  pending?: boolean
}

/** Botón base accesible con variantes, tamaños y estado pendiente. */
export function Button({
  variant = 'primary',
  size = 'md',
  pending = false,
  className,
  children,
  disabled,
  type = 'button',
  ...resto
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        VARIANTES[variant],
        TAMANOS[size],
        className,
      )}
      {...resto}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  )
}

/** Indicador de carga circular (se muestra dentro de los botones). */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  )
}

/** Botón para formularios con Server Actions: se auto-deshabilita al enviar. */
export function SubmitButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled = false,
}: {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  /** Deshabilita el botón además del estado pendiente del formulario. */
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      pending={pending || disabled}
      className={className}
    >
      {children}
    </Button>
  )
}
