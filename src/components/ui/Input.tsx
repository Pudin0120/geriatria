import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta?: string
  error?: string
  id: string
}

/** Campo de formulario etiquetado, con soporte de errores en español. */
export function Input({
  etiqueta,
  error,
  id,
  className,
  type = 'text',
  ...props
}: InputProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-700"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900',
          'placeholder:text-slate-400',
          'focus:outline-2 focus:outline-offset-1',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
          error
            ? 'border-red-400 focus:border-red-500 focus:outline-red-500'
            : 'border-slate-300 focus:border-blue-500 focus:outline-blue-500',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
