'use client'

import { useState, useActionState } from 'react'
import { createMedication, type ClinicalFormState } from '@/lib/supabase/actions'
import { Button, SubmitButton } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { cn, fechaLocalISO } from '@/lib/utils'
import { MEDICATION_ROUTE_LABELS, type MedicationRoute } from '@/types'
import type { ReactNode } from 'react'

const ESTADO_INICIAL: ClinicalFormState = { error: null, exito: false, campos: {} }

/** Frecuencias posológicas admitidas por la columna `frequency` de medications. */
const FRECUENCIAS_MED: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'unica', label: 'Dosis única' },
  { value: 'diaria', label: 'Diaria' },
  { value: 'cada_8h', label: 'Cada 8 horas' },
  { value: 'cada_12h', label: 'Cada 12 horas' },
  { value: 'cada_24h', label: 'Cada 24 horas' },
  { value: 'nocturna', label: 'Nocturna (al acostarse)' },
  { value: 'bajo_demanda', label: 'A demanda (sin horarios fijos)' },
]

const CLASES_SELECT =
  'block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600'

interface MedicationFormProps {
  residentId: string
  residentName: string
}

/**
 * Formulario de prescripción de medicación: nombre, dosis, vía y horarios
 * (`time[]`) dinámicos con validación de fechas. Usa `useActionState`
 * contra la Server Action `createMedication`.
 */
export function MedicationForm({ residentId, residentName }: MedicationFormProps) {
  const hoy = fechaLocalISO()
  const [estado, accion, pendiente] = useActionState(
    createMedication.bind(null, residentId),
    ESTADO_INICIAL,
  )
  const [horarios, setHorarios] = useState<string[]>(['08:00', '14:00', '22:00'])
  const [frecuencia, setFrecuencia] = useState('cada_8h')

  const aDemanda = frecuencia === 'bajo_demanda'

  return (
    <form action={accion} className="space-y-6">
      {estado.error ? (
        <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
          {estado.error}
        </div>
      ) : null}

      <Card>
        <CardHeaderSimple titulo="Prescripción" detalle={`Para ${residentName}`} />
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoError error={estado.campos['name']}>
              <Input aria-label="Nombre comercial *" id="name" name="name" required minLength={3} maxLength={140} placeholder="p. ej. Paracetamol" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['generic_name']}>
              <Input aria-label="Nombre genérico / DCI" id="generic_name" name="generic_name" maxLength={140} placeholder="p. ej. Paracetamol 650 mg" className="mt-1.5" />
            </CampoError>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <CampoError error={estado.campos['dosage']}>
              <Input aria-label="Dosis por toma *" id="dosage" name="dosage" required maxLength={80} placeholder="p. ej. 500 mg" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['presentation']}>
              <Input aria-label="Presentación" id="presentation" name="presentation" maxLength={100} placeholder="Comprimido, jarabe…" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['route']}>
              <Label htmlFor="route">Vía de administración *</Label>
              <select id="route" name="route" defaultValue="oral" className={cn(CLASES_SELECT, 'mt-1.5')}>
                {(Object.keys(MEDICATION_ROUTE_LABELS) as MedicationRoute[]).map((v) => (
                  <option key={v} value={v}>
                    {MEDICATION_ROUTE_LABELS[v]}
                  </option>
                ))}
              </select>
            </CampoError>
          </div>

          <CampoError error={estado.campos['frequency']}>
            <Label htmlFor="frequency">Frecuencia posológica *</Label>
            <select
              id="frequency"
              name="frequency"
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value)}
              className={cn(CLASES_SELECT, 'mt-1.5')}
            >
              {FRECUENCIAS_MED.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </CampoError>

          {/* Horarios (time[]): lista dinámica de inputs type="time" */}
          <div>
            <Label>Horarios de administración {!aDemanda ? '*' : '(opcional a demanda)'}</Label>
            {estado.campos['schedule_times'] ? (
              <p className="mt-1 text-xs font-medium text-rose-600">{estado.campos['schedule_times']}</p>
            ) : null}
            <div className="mt-1.5 space-y-2">
              {aDemanda ? (
                <p className="text-sm text-slate-400">
                  Al ser medicación a demanda no se programan horarios fijos.
                </p>
              ) : (
                horarios.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      name="schedule_times"
                      value={h}
                      required
                      onChange={(e) =>
                        setHorarios((prev) => prev.map((x, xi) => (xi === i ? e.target.value : x)))
                      }
                      className={cn(CLASES_SELECT, 'w-40')}
                      aria-label={`Horario ${i + 1} de administración`}
                    />
                    {horarios.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setHorarios((prev) => prev.filter((_, xi) => xi !== i))}
                        className="text-xs font-medium text-rose-600 hover:underline"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                ))
              )}
              {!aDemanda && horarios.length < 8 ? (
                <Button variant="secondary" size="sm" type="button" onClick={() => setHorarios((prev) => [...prev, '12:00'])}>
                  + Añadir horario
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <CampoError error={estado.campos['start_date']}>
              <Input aria-label="Fecha de inicio *" id="start_date" name="start_date" type="date" required defaultValue={hoy} max="2100-12-31" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['end_date']}>
              <Input aria-label="Fecha de fin" id="end_date" name="end_date" type="date" max="2100-12-31" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['prescribed_by']}>
              <Input aria-label="Prescrito por" id="prescribed_by" name="prescribed_by" maxLength={140} placeholder="Se usa tu nombre si lo dejas vacío" className="mt-1.5" />
            </CampoError>
          </div>

          <CampoError error={estado.campos['indications']}>
            <Label htmlFor="indications">Indicaciones / pautas especiales</Label>
            <textarea
              id="indications"
              name="indications"
              rows={3}
              maxLength={1000}
              placeholder="p. ej. Administrar con comida; vigilar TA antes de cada dosis…"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            />
          </CampoError>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" type="button" onClick={() => window.history.back()}>
          Cancelar
        </Button>
        <SubmitButton disabled={pendiente}>Guardar prescripción</SubmitButton>
      </div>
    </form>
  )
}

/* ---------------- helpers de presentación ---------------- */

function CardHeaderSimple({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      {detalle ? <p className="mt-0.5 text-sm text-slate-500">{detalle}</p> : null}
    </div>
  )
}

function CampoError({ error, children }: { error?: string; children: ReactNode }) {
  return (
    <div>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  )
}
