'use client'

import { useState, useActionState } from 'react'
import { createCarePlan, type ClinicalFormState } from '@/lib/supabase/actions'
import { Button, SubmitButton } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { cn, fechaLocalISO } from '@/lib/utils'
import {
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  type TaskPriority,
  type TaskFrequency,
  type TaskType,
} from '@/types'
import type { ReactNode } from 'react'

const ESTADO_INICIAL: ClinicalFormState = { error: null, exito: false, campos: {} }

/** Días de la semana ISO (1 = lunes … 7 = domingo) con etiqueta en español. */
const DIAS_SEMANA: ReadonlyArray<{ valor: 1 | 2 | 3 | 4 | 5 | 6 | 7; corto: string; largo: string }> = [
  { valor: 1, corto: 'L', largo: 'Lunes' },
  { valor: 2, corto: 'M', largo: 'Martes' },
  { valor: 3, corto: 'X', largo: 'Miércoles' },
  { valor: 4, corto: 'J', largo: 'Jueves' },
  { valor: 5, corto: 'V', largo: 'Viernes' },
  { valor: 6, corto: 'S', largo: 'Sábado' },
  { valor: 7, corto: 'D', largo: 'Domingo' },
]

const FRECUENCIAS: ReadonlyArray<{ value: TaskFrequency; label: string }> = [
  { value: 'diaria', label: 'Diaria' },
  { value: 'alternodia', label: 'Cada dos días' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'unica', label: 'Única vez' },
]

const PRIORIDADES: readonly TaskPriority[] = ['baja', 'normal', 'alta', 'urgente']

const CLASES_SELECT =
  'block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600'

interface BloqueTarea {
  key: number
  tipo: TaskType
  titulo: string
  hora: string
  frecuencia: TaskFrequency
  prioridad: TaskPriority
  dias: Set<number>
}

function bloqueNuevo(key: number): BloqueTarea {
  return {
    key,
    tipo: 'higiene',
    titulo: '',
    hora: '08:00',
    frecuencia: 'diaria',
    prioridad: 'normal',
    dias: new Set([1, 2, 3, 4, 5, 6, 7]),
  }
}

interface CarePlanFormProps {
  residentId: string
  residentName: string
}

/**
 * Formulario de creación de plan de cuidado con tareas recurrentes
 * (tipo, hora, días de la semana L-D y frecuencia). Usa `useActionState`
 * contra la Server Action `createCarePlan`; en caso de éxito la acción
 * redirige a la lista de planes.
 */
export function CarePlanForm({ residentId, residentName }: CarePlanFormProps) {
  const hoy = fechaLocalISO()
  const [estado, accion, pendiente] = useActionState(
    createCarePlan.bind(null, residentId),
    ESTADO_INICIAL,
  )
  const [bloques, setBloques] = useState<BloqueTarea[]>(() => [bloqueNuevo(0)])
  const [siguienteKey, setSiguienteKey] = useState(1)

  const actualizar = (key: number, parche: Partial<BloqueTarea>) => {
    setBloques((prev) => prev.map((b) => (b.key === key ? { ...b, ...parche } : b)))
  }

  const alternarDia = (key: number, dia: number) => {
    setBloques((prev) =>
      prev.map((b) => {
        if (b.key !== key) return b
        const dias = new Set(b.dias)
        if (dias.has(dia)) dias.delete(dia)
        else dias.add(dia)
        return { ...b, dias }
      }),
    )
  }

  return (
    <form action={accion} className="space-y-6">
      {estado.error ? (
        <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
          {estado.error}
        </div>
      ) : null}

      {/* ---------------- Datos del plan ---------------- */}
      <Card>
        <CardHeaderSimple titulo="Datos del plan" detalle={`Para ${residentName}`} />
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoError error={estado.campos['title']}>
              <Label htmlFor="title">Título del plan *</Label>
              <Input id="title" name="title" required minLength={4} maxLength={140} placeholder="p. ej. Prevención de úlceras por presión" className="mt-1.5" />
            </CampoError>

            <CampoError error={estado.campos['status']}>
              <Label htmlFor="status">Estado inicial</Label>
              <select id="status" name="status" defaultValue="activo" className={cn(CLASES_SELECT, 'mt-1.5')}>
                <option value="activo">Activo</option>
                <option value="borrador">Borrador</option>
                <option value="pausado">Pausado</option>
              </select>
            </CampoError>
          </div>

          <CampoError error={estado.campos['description']}>
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={2000}
              placeholder="Contexto clínico, cuidados previstos, evidencia asociada…"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            />
          </CampoError>

          <CampoError error={estado.campos['goals']}>
            <Label htmlFor="goals">Objetivos (uno por línea)</Label>
            <textarea
              id="goals"
              name="goals"
              rows={3}
              maxLength={1200}
              placeholder={'Mantener piel íntegra\nDeambular 10 min con supervisión'}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            />
          </CampoError>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <CampoError error={estado.campos['start_date']}>
              <Label htmlFor="start_date">Fecha de inicio *</Label>
              <Input id="start_date" name="start_date" type="date" required defaultValue={hoy} max="2100-12-31" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['end_date']}>
              <Label htmlFor="end_date">Fecha de fin</Label>
              <Input id="end_date" name="end_date" type="date" max="2100-12-31" className="mt-1.5" />
            </CampoError>
            <CampoError error={estado.campos['review_date']}>
              <Label htmlFor="review_date">Próxima revisión</Label>
              <Input id="review_date" name="review_date" type="date" max="2100-12-31" className="mt-1.5" />
            </CampoError>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Tareas recurrentes ---------------- */}
      <Card>
        <CardHeaderSimple
          titulo="Tareas recurrentes del plan"
          detalle="Define los cuidados programados: tipo, hora, días de la semana y frecuencia."
        />
        <CardContent className="space-y-5">
          {bloques.map((bloque, indice) => (
            <fieldset key={bloque.key} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tarea {indice + 1}
              </legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CampoError error={estado.campos[`task_title_${indice + 1}`]}>
                  <Label htmlFor={`task_title_${bloque.key}`}>Título de la tarea *</Label>
                  <input
                    id={`task_title_${bloque.key}`}
                    name="task_title"
                    type="text"
                    required
                    value={bloque.titulo}
                    maxLength={140}
                    onChange={(e) => actualizar(bloque.key, { titulo: e.target.value })}
                    placeholder="p. ej. Cambios posturales cada 2 h"
                    className={cn(CLASES_SELECT, 'mt-1.5 bg-white')}
                  />
                </CampoError>

                <CampoError error={estado.campos[`task_type_${indice + 1}`]}>
                  <Label htmlFor={`task_type_${bloque.key}`}>Tipo de tarea</Label>
                  <select
                    id={`task_type_${bloque.key}`}
                    name="task_type"
                    value={bloque.tipo}
                    onChange={(e) => actualizar(bloque.key, { tipo: e.target.value as TaskType })}
                    className={cn(CLASES_SELECT, 'mt-1.5 bg-white')}
                  >
                    {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => (
                      <option key={t} value={t}>
                        {TASK_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </CampoError>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <CampoError error={estado.campos[`scheduled_time_${indice + 1}`]}>
                  <Label htmlFor={`hora_${bloque.key}`}>Hora *</Label>
                  <input
                    id={`hora_${bloque.key}`}
                    name="scheduled_time"
                    type="time"
                    required
                    value={bloque.hora}
                    onChange={(e) => actualizar(bloque.key, { hora: e.target.value })}
                    className={cn(CLASES_SELECT, 'mt-1.5 bg-white')}
                  />
                </CampoError>

                <CampoError error={estado.campos[`task_frequency_${indice + 1}`]}>
                  <Label htmlFor={`freq_${bloque.key}`}>Frecuencia</Label>
                  <select
                    id={`freq_${bloque.key}`}
                    name="task_frequency"
                    value={bloque.frecuencia}
                    onChange={(e) => actualizar(bloque.key, { frecuencia: e.target.value as TaskFrequency })}
                    className={cn(CLASES_SELECT, 'mt-1.5 bg-white')}
                  >
                    {FRECUENCIAS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </CampoError>

                <CampoError error={estado.campos[`task_priority_${indice + 1}`]}>
                  <Label htmlFor={`prio_${bloque.key}`}>Prioridad</Label>
                  <select
                    id={`prio_${bloque.key}`}
                    name="task_priority"
                    value={bloque.prioridad}
                    onChange={(e) => actualizar(bloque.key, { prioridad: e.target.value as TaskPriority })}
                    className={cn(CLASES_SELECT, 'mt-1.5 bg-white')}
                  >
                    {PRIORIDADES.map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </CampoError>
              </div>

              {/* Días de la semana: checkboxes L-D (smallint[] 1..7) */}
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-slate-700">Días de la semana *</legend>
                <div className="flex flex-wrap gap-2">
                  {DIAS_SEMANA.map((dia) => {
                    const marcado = bloque.dias.has(dia.valor)
                    return (
                      <label
                        key={dia.valor}
                        title={dia.largo}
                        className={cn(
                          'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-sm font-bold transition-colors',
                          marcado
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-300 bg-white text-slate-500 hover:border-teal-400',
                        )}
                      >
                        <input
                          type="checkbox"
                          name="task_days[]"
                          value={`${indice}:${dia.valor}`}
                          checked={marcado}
                          onChange={() => alternarDia(bloque.key, dia.valor)}
                          className="sr-only"
                        />
                        {dia.corto}
                      </label>
                    )
                  })}
                </div>
                {!marcadosAlguno(bloque) ? (
                  <p className="mt-1.5 text-xs font-medium text-rose-600">
                    Marca al menos un día; si ninguno, la tarea se creará para todos los días.
                  </p>
                ) : null}
              </fieldset>

              {bloques.length > 1 ? (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setBloques((prev) => prev.filter((b) => b.key !== bloque.key))}
                    className="text-xs font-medium text-rose-600 hover:underline"
                  >
                    Quitar esta tarea
                  </button>
                </div>
              ) : null}
            </fieldset>
          ))}

          {bloques.length < 15 ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setBloques((prev) => [...prev, bloqueNuevo(siguienteKey)])
                setSiguienteKey((k) => k + 1)
              }}
            >
              + Añadir otra tarea
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" type="button" onClick={() => window.history.back()}>
          Cancelar
        </Button>
        <SubmitButton disabled={pendiente}>Guardar plan y tareas</SubmitButton>
      </div>
    </form>
  )
}

/* ---------------- helpers de presentación ---------------- */

function marcadosAlguno(bloque: BloqueTarea): boolean {
  return bloque.dias.size > 0
}

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
