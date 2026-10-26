'use client'

import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { cn } from '@/lib/utils'

export interface ScaleRange {
  min: number
  max: number
}

interface ScaleInputProps extends ScaleRange {
  /** Nombre del campo (se usa como `name` y `id` en el formulario). */
  name: string
  label: string
  /** Texto de ayuda bajo la etiqueta, p. ej. "0 = dependencia total · 100 = independiente". */
  hint?: string
  defaultValue?: number | null
  error?: string
  required?: boolean
  disabled?: boolean
}

/** Comprueba si un valor escrito está dentro del rango clínico permitido. */
export function fueraDeRango(valor: string, { min, max }: ScaleRange): boolean {
  if (valor.trim().length === 0) return false // vacío = no puntado (campo opcional)
  const n = Number(valor)
  return !Number.isFinite(n) || n < min || n > max || !Number.isInteger(n)
}

/**
 * Input numérico para escalas clínicas (Barthel, MMSE, MNA-SF…).
 * Muestra siempre el rango válido ("0 - 30") y valida en tiempo real,
 * con mensaje de error en español cuando el valor se excede.
 */
export function ScaleInput({
  name,
  label,
  min,
  max,
  hint,
  defaultValue = null,
  error: errorExterno,
  required = false,
  disabled = false,
}: ScaleInputProps) {
  const [valor, setValor] = useState<string>(defaultValue === null ? '' : String(defaultValue))
  const [tocado, setTocado] = useState(false)

  const errorLocal = tocado && fueraDeRango(valor, { min, max })
    ? `El valor debe ser un número entero entre ${min} y ${max}.`
    : null
  const error = errorLocal ?? errorExterno ?? null

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTocado(true)
    setValor(e.target.value)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-600" aria-hidden>*</span> : null}
        </label>
        <span
          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
          title={`Rango válido: ${min} a ${max}`}
        >
          {min} - {max}
        </span>
      </div>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      <input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={valor}
        onChange={onChange}
        onBlur={() => setTocado(true)}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        placeholder={`Sin puntuar`}
        className={cn(
          'block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50',
          error
            ? 'border-rose-400 focus:outline-rose-500'
            : 'border-slate-300 focus:outline-teal-600',
        )}
      />
      {error ? (
        <p id={`${name}-error`} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
