'use client'

/**
 * GeriCare · FASE 6 — Formulario de planificación de tareas.
 * React Hook Form + Zod (`CreateTaskSchema`, la MISMA fuente de validación que
 * la Server Action) sobre `useActionState(createTaskWithRecurrence)`.
 * Cero mutación en el cliente: solo envía FormData a la acción del servidor.
 */

import { useMemo, useState, useActionState } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createTaskWithRecurrence } from '@/lib/supactions/tasks'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Input, Label } from '@/components/ui/Input'
import { SubmitButton } from '@/components/ui/Button'
import type {
  CreateTaskFormValues,
  CreateTaskResult,
  RecurrencePattern,
  TaskPriority,
  TaskType,
} from '@/types'
import {
  CreateTaskSchema,
  DAY_OF_WEEK_LABELS,
  RECURRENCE_PATTERN_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  VENTANA_RECURRENCIA_DIAS,
} from '@/types'

/* ================================================================== */
/* Tipos de opciones serializadas que llegan desde el RSC              */
/* ================================================================== */

export interface ResidenteOpcion {
  id: string
  nombre: string
  habitacion: string | null
}

export interface AuxiliarOpcion {
  id: string
  nombre: string
  /** Etiqueta ya traducida ('Auxiliar' / 'Enfermera jefe'). */
  rol: string
}

export interface OpcionesTarea {
  residentes: ResidenteOpcion[]
  auxiliares: AuxiliarOpcion[]
}

/* ================================================================== */
/* Constantes de presentación                                          */
/* ================================================================== */

const PATRONES = Object.keys(RECURRENCE_PATTERN_LABELS) as RecurrencePattern[]
const TIPOS_TAREA_UI = Object.keys(TASK_TYPE_LABELS) as TaskType[]
const PRIORIDADES_UI = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]
const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const

const ESTADO_INICIAL: CreateTaskResult = { exito: false, mensaje: '', instanciasCreadas: 0 }

/** Valor inicial del formulario: hoy a las 09:00 (datetime-local local). */
function fechaHoraInicial(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T09:00`
}

const VALORES_INICIALES: CreateTaskFormValues = {
  resident_id: '',
  assigned_to: '',
  task_type: 'higiene',
  title: '',
  description: '',
  scheduled_time: fechaHoraInicial(),
  recurrence: 'none',
  recurrence_days: [],
  requires_vitals: false,
  requires_photo: false,
  priority: 'normal',
}

/* ================================================================== */
/* Componente                                                          */
/* ================================================================== */

export function TaskForm({ opciones }: { opciones: OpcionesTarea }) {
  const [estado, accion] = useActionState(createTaskWithRecurrence, ESTADO_INICIAL)

  const {
    register,
    control,
    handleSubmit,
    setValue,
  } = useForm<CreateTaskFormValues>({
    resolver: zodResolver(CreateTaskSchema),
    defaultValues: VALORES_INICIALES,
    mode: 'onBlur',
  })

  // `useWatch` en lugar de `watch()`: API compatible con React Compiler
  // (evita el aviso react-hooks/incompatible-library y memoización obsoleta).
  const recurrence = useWatch({ control, name: 'recurrence' })
  const selectedResidentId = useWatch({ control, name: 'resident_id' })
  const rawSelectedDays = useWatch({ control, name: 'recurrence_days' })
  const selectedDays = useMemo(() => rawSelectedDays ?? [], [rawSelectedDays])

  /* Búsqueda de residente: filtro por nombre/habitación sobre el censo real. */
  const [busqueda, setBusqueda] = useState<string>('')
  const residentesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (q.length === 0) return opciones.residentes.slice(0, 30)
    return opciones.residentes
      .filter(
        (r) =>
          r.nombre.toLowerCase().includes(q) ||
          (r.habitacion !== null && r.habitacion.toLowerCase().includes(q)),
      )
      .slice(0, 30)
  }, [busqueda, opciones.residentes])

  const residenteSeleccionado = opciones.residentes.find((r) => r.id === selectedResidentId)

  function onSubmit(values: CreateTaskFormValues): void {
    // Construcción de FormData → única vía hacia la Server Action.
    const fd = new FormData()
    fd.set('resident_id', values.resident_id)
    fd.set('assigned_to', values.assigned_to)
    fd.set('task_type', values.task_type)
    fd.set('title', values.title)
    fd.set('description', values.description ?? '')
    fd.set('scheduled_time', values.scheduled_time)
    fd.set('recurrence', values.recurrence)
    for (const dia of values.recurrence_days ?? []) {
      fd.append('recurrence_days', String(dia))
    }
    if (values.requires_vitals) fd.set('requires_vitals', 'on')
    if (values.requires_photo) fd.set('requires_photo', 'on')
    fd.set('priority', values.priority)
    // `accion` es la action ligada por useActionState; se invoca con FormData.
    void accion(fd)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {estado.mensaje !== '' && !estado.exito ? (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20"
        >
          {estado.mensaje}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ========================= Columna izquierda ========================= */}
        <Card>
          <CardHeader
            title="Residente y personal asignado"
            subtitle="¿A quién va dirigida la tarea y quién la ejecuta?"
          />
          <CardContent className="space-y-5">
            {/* Selector de residente con búsqueda */}
            <div className="space-y-1.5">
              <Label htmlFor="residente_busqueda">Residente *</Label>
              <input
                id="residente_busqueda"
                type="search"
                placeholder="Buscar por nombre o habitación…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
                aria-describedby="residente_listbox_label"
              />
              <span id="residente_listbox_label" className="sr-only">
                Listado filtrable de residentes activos
              </span>
              <Controller
                control={control}
                name="resident_id"
                render={({ field, fieldState }) => (
                  <>
                    <select
                      {...field}
                      value={field.value}
                      size={8}
                      className="block w-full rounded-lg border border-slate-300 bg-white p-1 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-teal-600"
                      aria-label="Selecciona un residente"
                    >
                      <option value="">— Selecciona un residente —</option>
                      {residentesFiltrados.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nombre}
                          {r.habitacion !== null ? ` · Hab. ${r.habitacion}` : ''}
                        </option>
                      ))}
                    </select>
                    {fieldState.error ? (
                      <p className="text-xs font-medium text-rose-600">{fieldState.error.message}</p>
                    ) : residenteSeleccionado ? (
                      <p className="text-xs text-slate-500">
                        Seleccionado: {residenteSeleccionado.nombre}
                        {residenteSeleccionado.habitacion !== null
                          ? ` (habitación ${residenteSeleccionado.habitacion})`
                          : ''}
                      </p>
                    ) : null}
                  </>
                )}
              />
            </div>

            {/* Selector de auxiliar (rol filtrado en el servidor) */}
            <Controller
              control={control}
              name="assigned_to"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="assigned_to">Asignar a</Label>
                  <select
                    id="assigned_to"
                    {...field}
                    value={field.value}
                    className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
                  >
                    <option value="">Sin asignar (queda en la bandeja común)</option>
                    {opciones.auxiliares.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre} · {a.rol}
                      </option>
                    ))}
                  </select>
                  {fieldState.error ? (
                    <p className="text-xs font-medium text-rose-600">{fieldState.error.message}</p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Solo personal activo con rol auxiliar o enfermera jefe.
                    </p>
                  )}
                </div>
              )}
            />

            {/* Prioridad */}
            <Controller
              control={control}
              name="priority"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Prioridad *</Label>
                  <select
                    id="priority"
                    {...field}
                    value={field.value}
                    className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
                  >
                    {PRIORIDADES_UI.map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                  {fieldState.error ? (
                    <p className="text-xs font-medium text-rose-600">{fieldState.error.message}</p>
                  ) : null}
                </div>
              )}
            />
          </CardContent>
        </Card>

        {/* ========================= Columna derecha ========================= */}
        <Card>
          <CardHeader
            title="Contenido y horario"
            subtitle="Qué se debe hacer, cuándo y con qué requisitos."
          />
          <CardContent className="space-y-5">
            <Controller
              control={control}
              name="task_type"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="task_type">Tipo de tarea *</Label>
                  <select
                    id="task_type"
                    {...field}
                    value={field.value}
                    className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
                  >
                    {TIPOS_TAREA_UI.map((t) => (
                      <option key={t} value={t}>
                        {TASK_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  {fieldState.error ? (
                    <p className="text-xs font-medium text-rose-600">{fieldState.error.message}</p>
                  ) : null}
                </div>
              )}
            />

            <Input
              id="title"
              label="Título *"
              placeholder="Ej.: Aseo matutino en cama"
              error={undefined}
              {...register('title')}
            />

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción clínica</Label>
              <textarea
                id="description"
                rows={3}
                placeholder="Indicaciones para quien ejecuta la tarea (máx. 1000 caracteres)."
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
                {...register('description')}
              />
            </div>

            <Input
              id="scheduled_time"
              label="Fecha y hora programadas *"
              type="datetime-local"
              {...register('scheduled_time')}
            />

            {/* Recurrencia */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Recurrencia *</legend>
              {PATRONES.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    value={p}
                    {...register('recurrence')}
                    className="h-4 w-4 border-slate-300 text-teal-600 focus:outline focus:outline-2 focus:outline-teal-600"
                  />
                  {RECURRENCE_PATTERN_LABELS[p]}
                  {p === 'daily' || p === 'lmi_vie' ? (
                    <span className="text-xs text-slate-400">(próximos {VENTANA_RECURRENCIA_DIAS} días)</span>
                  ) : null}
                </label>
              ))}

              {recurrence === 'custom' ? (
                <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-slate-50 p-3">
                  {DIAS_SEMANA.map((dia) => {
                    const activo = selectedDays.includes(dia)
                    return (
                      <label
                        key={dia}
                        className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
                          activo
                            ? 'bg-teal-600 text-white ring-teal-600'
                            : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          value={dia}
                          checked={activo}
                          onChange={() => {
                            // Actualización controlada del array de días (tipado estricto).
                            const siguiente = activo
                              ? selectedDays.filter((d) => d !== dia)
                              : [...selectedDays, dia].sort((a, b) => a - b)
                            setValue('recurrence_days', siguiente, { shouldValidate: true })
                          }}
                          className="sr-only"
                          aria-label={`Día ${DAY_OF_WEEK_LABELS[dia as keyof typeof DAY_OF_WEEK_LABELS]}`}
                        />
                        {DAY_OF_WEEK_LABELS[dia as keyof typeof DAY_OF_WEEK_LABELS]}
                      </label>
                    )
                  })}
                </div>
              ) : null}
            </fieldset>

            {/* Requisitos adjuntos */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Requisitos al ejecutar</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  {...register('requires_vitals')}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:outline focus:outline-2 focus:outline-teal-600"
                />
                Requiere registrar signos vitales
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  {...register('requires_photo')}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:outline focus:outline-2 focus:outline-teal-600"
                />
                Requiere adjuntar fotografía
              </label>
            </fieldset>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <p className="mr-auto text-xs text-slate-500">
          Al guardar se generan las instancias físicas de la serie (hasta {VENTANA_RECURRENCIA_DIAS} días)
          y se registra la acción en la bitácora de auditoría.
        </p>
        <SubmitButton>Planificar tarea</SubmitButton>
      </div>
    </form>
  )
}
