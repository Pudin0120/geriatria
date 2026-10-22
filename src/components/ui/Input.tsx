import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Mensaje de error mostrado bajo el campo (en español). */
  error?: string
  /** Identificador único enlazado con la etiqueta. */
  id: string
}

/** Campo de texto con etiqueta accesible y mensaje de error. */
export function Input({ label, id, error, className, ...resto }: InputProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50',
          error
            ? 'border-rose-400 focus:outline-rose-500'
            : 'border-slate-300 focus:outline-teal-600',
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
