'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useActionState } from 'react'
import { Button, SubmitButton } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { ClinicalFormState } from '@/lib/supabase/actions'

/* ================================================================== */
/* Modal base reutilizable (accesible, cierre con Escape)              */
/* ================================================================== */

interface ModalBaseProps {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  subtitulo?: string
  children: ReactNode
}

/** Contenedor modal genérico: overlay, foco inicial y cierre por Escape. */
export function ModalBase({ abierto, onCerrar, titulo, subtitulo, children }: ModalBaseProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const alEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscape)
    // Foco inicial en el panel para accesibilidad por teclado.
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', alEscape)
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            {subtitulo ? <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/* ================================================================== */
/* ExecutionModal: registrar ejecución de tarea o administración DURO  */
/* ================================================================== */

const ESTADO_INICIAL: ClinicalFormState = { error: null, exito: false, campos: {} }

type VarianteResultado = 'tarea' | 'medicacion'

const OPCIONES_TAREA: ReadonlyArray<{ value: string; label: string; clases: string }> = [
  {
    value: 'completada',
    label: '✔ Completada',
    clases: 'peer-checked/completada:border-emerald-600 peer-checked/completada:bg-emerald-600 peer-checked/completada:text-white',
  },
  {
    value: 'omitida',
    label: '○ No realizada',
    clases: 'peer-checked/omitida:border-amber-500 peer-checked/omitida:bg-amber-500 peer-checked/omitida:text-white',
  },
  {
    value: 'cancelada',
    label: '✕ Cancelada',
    clases: 'peer-checked/cancelada:border-rose-600 peer-checked/cancelada:bg-rose-600 peer-checked/cancelada:text-white',
  },
]

const OPCIONES_MEDICACION: ReadonlyArray<{ value: string; label: string; clases: string }> = [
  {
    value: 'administrada',
    label: '✔ Administrada',
    clases: 'peer-checked/administrada:border-emerald-600 peer-checked/administrada:bg-emerald-600 peer-checked/administrada:text-white',
  },
  {
    value: 'parcial',
    label: '◐ Parcial',
    clases: 'peer-checked/parcial:border-amber-500 peer-checked/parcial:bg-amber-500 peer-checked/parcial:text-white',
  },
  {
    value: 'rechazada',
    label: '✕ Rechazada',
    clases: 'peer-checked/rechazada:border-rose-600 peer-checked/rechazada:bg-rose-600 peer-checked/rechazada:text-white',
  },
  {
    value: 'omitida',
    label: '○ Omitida',
    clases: 'peer-checked/omitida:border-rose-400 peer-checked/omitida:bg-rose-400 peer-checked/omitida:text-white',
  },
]

const CLASES_CAMPO =
  'block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600'

function EtiquetaCampo({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
      {children}
    </label>
  )
}

export interface ExecutionModalProps {
  abierto: boolean
  onCerrar: () => void
  /** 'tarea' → registra ejecución en task_executions; 'medicacion' → medication_administrations. */
  variante: VarianteResultado
  titulo: string
  /** Contexto resumen mostrado en cabecera (residente, medicación, hora…). */
  contexto: string
  subtitulo?: string
  /** Server Action con firma (prevState, FormData) → ClinicalFormState, ya encadenada con .bind(). */
  accion: (previa: ClinicalFormState, datos: FormData) => Promise<ClinicalFormState>
  /** Valores iniciales rápidos (dosis por defecto, hora programada ISO local YYYY-MM-DDTHH:mm). */
  valoresIniciales?: { dose?: string; scheduledAt?: string; routeOptions?: ReadonlyArray<{ value: string; label: string }>; defaultRoute?: string }
}

/**
 * Modal reutilizable y de pocos clics para registrar la ejecución de una
 * tarea o la administración de un medicamento (DURO), usando `useActionState`
 * contra la correspondiente Server Action. Feedback visual: verde cuando el
 * registro se guarda, rojo ante errores.
 */
export function ExecutionModal({
  abierto,
  onCerrar,
  variante,
  titulo,
  contexto,
  subtitulo,
  accion,
  valoresIniciales,
}: ExecutionModalProps) {
  const [estado, accionar, pendiente] = useActionState(accion, ESTADO_INICIAL)
  const opciones = variante === 'tarea' ? OPCIONES_TAREA : OPCIONES_MEDICACION

  // Al guardar con éxito, cerramos automáticamente (el router revalida solo).
  useEffect(() => {
    if (estado.exito && !pendiente) {
      onCerrar()
    }
  }, [estado.exito, pendiente, onCerrar])

  return (
    <ModalBase abierto={abierto} onCerrar={onCerrar} titulo={titulo} subtitulo={subtitulo}>
      <form action={accionar} className="space-y-4">
        {/* Resumen de contexto clínico: una línea, siempre visible */}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
          {contexto}
        </p>

        {estado.error ? (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
            {estado.error}
          </div>
        ) : null}

        {/* Resultado: botones grandes tipo semáforo (feedback inmediato) */}
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-slate-700">
            {variante === 'tarea' ? 'Resultado de la ejecución *' : 'Resultado de la administración *'}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {opciones.map((op, i) => (
              <label key={op.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="outcome"
                  value={op.value}
                  defaultChecked={i === 0}
                  className={cn(
                    'peer sr-only',
                    op.value === 'completada' && 'peer/completada',
                    op.value === 'omitida' && 'peer/omitida',
                    op.value === 'cancelada' && 'peer/cancelada',
                    op.value === 'administrada' && 'peer/administrada',
                    op.value === 'parcial' && 'peer/parcial',
                    op.value === 'rechazada' && 'peer/rechazada',
                  )}
                />
                <span
                  className={cn(
                    'flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 transition-colors',
                    op.clases,
                  )}
                >
                  {op.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {variante === 'medicacion' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <EtiquetaCampo htmlFor="dose_given">Dosis administrada *</EtiquetaCampo>
              <input
                id="dose_given"
                name="dose_given"
                type="text"
                required
                maxLength={80}
                defaultValue={valoresIniciales?.dose ?? ''}
                placeholder="p. ej. 500 mg"
                className={CLASES_CAMPO}
              />
            </div>
            <div className="space-y-1.5">
              <EtiquetaCampo htmlFor="route_used">Vía utilizada *</EtiquetaCampo>
              <select id="route_used" name="route_used" defaultValue={valoresIniciales?.defaultRoute ?? 'oral'} className={CLASES_CAMPO}>
                {(valoresIniciales?.routeOptions ?? []).map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <EtiquetaCampo htmlFor="scheduled_at">Toma programada de referencia</EtiquetaCampo>
              <input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                defaultValue={valoresIniciales?.scheduledAt ?? ''}
                className={CLASES_CAMPO}
              />
            </div>
          </div>
        ) : (
          /* Signos vitales opcionales (solo tareas del tipo signos_vitales/curación) */
          <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Signos vitales (opcional)</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <EtiquetaCampo htmlFor="ta">TA (mmHg)</EtiquetaCampo>
                <input id="ta" name="ta" type="text" inputMode="numeric" placeholder="120/80" pattern="\d{2,3}/\d{2,3}" title="Formato: 120/80" className={cn(CLASES_CAMPO, 'h-9')} />
              </div>
              <div className="space-y-1">
                <EtiquetaCampo htmlFor="fc">Pulso (/min)</EtiquetaCampo>
                <input id="fc" name="fc" type="number" min={20} max={250} step={1} placeholder="72" className={cn(CLASES_CAMPO, 'h-9')} />
              </div>
              <div className="space-y-1">
                <EtiquetaCampo htmlFor="temperatura">Temp. (°C)</EtiquetaCampo>
                <input id="temperatura" name="temperatura" type="number" min={25} max={45} step={0.1} placeholder="36.5" className={cn(CLASES_CAMPO, 'h-9')} />
              </div>
              <div className="space-y-1">
                <EtiquetaCampo htmlFor="sat_o2">SatO₂ (%)</EtiquetaCampo>
                <input id="sat_o2" name="sat_o2" type="number" min={50} max={100} step={1} placeholder="96" className={cn(CLASES_CAMPO, 'h-9')} />
              </div>
              <div className="space-y-1">
                <EtiquetaCampo htmlFor="glucemia">Glucemia (mg/dL)</EtiquetaCampo>
                <input id="glucemia" name="glucemia" type="number" min={20} max={800} step={1} placeholder="110" className={cn(CLASES_CAMPO, 'h-9')} />
              </div>
            </div>
          </fieldset>
        )}

        {variante === 'medicacion' ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="adverse_reaction"
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:outline focus:outline-2 focus:outline-rose-500"
            />
            Hubo reacción adversa
          </label>
        ) : null}

        <div className="space-y-1.5">
          <EtiquetaCampo htmlFor="notes">Notas / observaciones</EtiquetaCampo>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={1000}
            placeholder="Breve anotación para la bitácora clínica…"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <SubmitButton>{variante === 'tarea' ? 'Registrar ejecución' : 'Registrar administración'}</SubmitButton>
        </div>
      </form>
    </ModalBase>
  )
}
