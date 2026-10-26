'use client'

/**
 * GeriCare · FASE 7 — Formulario ultra-rápido de signos vitales (móvil).
 * ----------------------------------------------------------------------
 * Rejilla de inputs numéricos con `inputMode="decimal"`, touch targets de
 * 56 px, rango válido visible bajo cada campo y validación EN TIEMPO REAL
 * con el MISMO esquema Zod que revalida la Server Action
 * (`VitalSignsMobileSchema`): si la sistólica es 300, el error aparece al
 * instante, sin esperar el envío.
 *
 * El formulario (react-hook-form) vive en el modal; aquí solo se consumen
 * su `control` y sus errores para mantener una única fuente de estado.
 */

import { useController, useWatch, type Control } from 'react-hook-form'
import { cn } from '@/lib/utils'
import type { VitalSignsMobileValues } from '@/types'
import { VITAL_SIGNS_LABELS, VITAL_SIGNS_RANGES } from '@/types'

/** Campos en el orden óptimo de captura táctica (lo más medido primero). */
const CAMPOS: ReadonlyArray<{
  name: keyof VitalSignsMobileValues
  step: string
  placeholder: string
}> = [
  { name: 'tension_sistolica', step: '1', placeholder: '120' },
  { name: 'tension_diastolica', step: '1', placeholder: '80' },
  { name: 'frecuencia_cardiaca', step: '1', placeholder: '72' },
  { name: 'temperatura', step: '0.1', placeholder: '36.5' },
  { name: 'glucemia', step: '1', placeholder: '110' },
  { name: 'saturacion_oxigeno', step: '1', placeholder: '97' },
]

interface VitalSignsFormProps {
  control: Control<VitalSignsMobileValues>
}

/** Un campo numérico táctil con etiqueta, rango y error en línea. */
function VitalField({
  name,
  step,
  placeholder,
  control,
}: {
  name: keyof VitalSignsMobileValues
  step: string
  placeholder: string
  control: Control<VitalSignsMobileValues>
}) {
  const { field, fieldState } = useController({ control, name })
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">
        {VITAL_SIGNS_LABELS[name]}
      </span>
      <input
        {...field}
        value={field.value ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          field.onChange(raw === '' ? undefined : Number.parseFloat(raw.replace(',', '.')))
        }}
        type="number"
        inputMode="decimal"
        autoComplete="off"
        step={step}
        placeholder={placeholder}
        aria-invalid={fieldState.error ? true : undefined}
        aria-describedby={fieldState.error ? `vital-${name}-error` : `vital-${name}-rango`}
        className={cn(
          'h-14 w-full rounded-xl border bg-white px-4 text-lg tabular-nums text-slate-900',
          'focus:outline-none focus:ring-2 focus:ring-teal-600/40',
          fieldState.error ? 'border-rose-400 bg-rose-50' : 'border-slate-300',
        )}
      />
      {fieldState.error ? (
        <span
          id={`vital-${name}-error`}
          role="alert"
          className="mt-1 block text-xs font-medium text-rose-700"
        >
          {fieldState.error.message}
        </span>
      ) : (
        <span id={`vital-${name}-rango`} className="mt-1 block text-xs text-slate-400">
          Rango: {VITAL_SIGNS_RANGES[name]}
        </span>
      )}
    </label>
  )
}

export function VitalSignsForm({ control }: VitalSignsFormProps) {
  // Resumen en vivo (feedback inmediato del auxiliar al llenar el formulario).
  const valores = useWatch({ control })
  const capturados = Object.values(valores ?? {}).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  ).length

  return (
    <div className="space-y-3" role="group" aria-label="Signos vitales">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Signos vitales {capturados > 0 ? `· ${capturados} registrados` : '· opcional salvo que la tarea lo exija'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CAMPOS.map((campo) => (
          <VitalField key={campo.name} {...campo} control={control} />
        ))}
      </div>
    </div>
  )
}
