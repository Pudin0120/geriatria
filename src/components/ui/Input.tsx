import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Etiqueta visible. Si se omite, use `aria-label` en el propio input. */
  label?: string
  /** Mensaje de error mostrado bajo el campo (en español). */
  error?: string
  /** Identificador único enlazado con la etiqueta. */
  id: string
}

/** Etiqueta accesible reutilizable (para campos propios que no usan <Input>). */
export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm font-semibold text-[#294640]', className)}>
      {children}
    </label>
  )
}

/** Campo de texto con etiqueta accesible y mensaje de error. */
export function Input({ label, id, error, className, ...resto }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-[#294640]"
        >
          {label}
        </label>
      ) : null}
      <input
        id={id}
        name={resto.name ?? id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'block min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50',
          error
            ? 'border-rose-400 focus:outline-rose-500'
            : 'border-[#d9e4dd] focus:outline-[#176b5b]',
          className,
        )}
        {...resto}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
