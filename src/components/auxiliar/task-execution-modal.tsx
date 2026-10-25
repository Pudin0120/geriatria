'use client'

/**
 * GeriCare · FASE 7 — Modal de ejecución de tarea (bottom-sheet móvil).
 * ----------------------------------------------------------------------
 * Se activa con un toque sobre "Ejecutar Tarea". Flujo en 2 toques:
 *   1. Abrir el modal (la tarea ya viene precargada desde la lista).
 *   2. Confirmar (completar / omitir) → animación de check verde y cierre.
 *
 * - Si la tarea `requires_vitals`, muestra el formulario de signos vitales
 *   (validación Zod en tiempo real, misma fuente que la Server Action).
 * - Si la tarea `requires_photo`, muestra input file con
 *   `accept="image/*" capture="environment"` (abre la cámara directamente)
 *   y previsualización; la imagen se convierte a data URL antes de enviar.
 * - Cero mutación en cliente: el envío va por `useActionState(executeTask)`.
 */

import { useEffect, useRef, useState } from 'react'
import { useActionState } from 'react'
import { useForm, type UseFormGetValues } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ExecuteTaskMobileResult, TareaMovilAuxiliar, VitalSignsMobileValues } from '@/types'
import { RESULTADO_EJECUCION_INICIAL, TAMANIO_MAXIMO_FOTO_BASE64, TASK_TYPE_LABELS, VitalSignsMobileSchema } from '@/types'
import type { TaskType } from '@/types/database.types'
import { executeTask } from '@/lib/supactions/auxiliar'
import { VitalSignsForm } from './vital-signs-form'

interface TaskExecutionModalProps {
  task: TareaMovilAuxiliar | null
  open: boolean
  onClose: () => void
}

type Outcome = 'completada' | 'omitida'

/** Nombres exactos de los campos vitales (orden estable). */
const CAMPOS_VITALES: ReadonlyArray<keyof VitalSignsMobileValues> = [
  'tension_sistolica',
  'tension_diastolica',
  'frecuencia_cardiaca',
  'temperatura',
  'glucemia',
  'saturacion_oxigeno',
]

/** Lee un File como data URL (máx. ~250 KB tras codificación). */
async function fileADataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'))
    reader.readAsDataURL(file)
  })
}

export function TaskExecutionModal({ task, open, onClose }: TaskExecutionModalProps) {
  const [outcome, setOutcome] = useState<Outcome>('completada')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { control, formState, getValues } = useForm<VitalSignsMobileValues>({
    resolver: zodResolver(VitalSignsMobileSchema),
    mode: 'onChange',
    defaultValues: {},
  })

  // Refs estables para que la action wrapper lea el estado más reciente sin
  // recrearse en cada render (evita cierres obsoletos sobre RHF/camera state).
  // La sincronización se hace en un efecto, nunca durante el render.
  const getValuesRef = useRef<UseFormGetValues<VitalSignsMobileValues>>(getValues)
  const photoRef = useRef<string | null>(null)
  useEffect(() => {
    getValuesRef.current = getValues
    photoRef.current = photoDataUrl
  }, [getValues, photoDataUrl])

  const [estado, accion, pendiente] = useActionState<ExecuteTaskMobileResult, FormData>(
    async (_previo, formDataBase) => {
      // Copiamos el FormData nativo del <form> para inyectar los signos
      // vitales (gestionados por RHF) y la foto ya convertida a data URL.
      const payload = new FormData()
      for (const [clave, valor] of formDataBase.entries()) {
        payload.append(clave, valor)
      }
      for (const campo of CAMPOS_VITALES) {
        const valor = getValuesRef.current(campo)
        if (typeof valor === 'number' && Number.isFinite(valor)) {
          payload.set(campo, String(valor))
        } else {
          payload.delete(campo)
        }
      }
      const foto = photoRef.current
      if (foto !== null) payload.set('photo_data_url', foto)
      else payload.delete('photo_data_url')

      const resultado = await executeTask(_previo, payload)
      if (resultado.exito) {
        // Feedback táctil: check verde 900 ms antes de cerrar el sheet.
        setShowSuccess(true)
        timerRef.current = setTimeout(() => {
          setShowSuccess(false)
          onClose()
        }, 900)
      }
      return resultado
    },
    RESULTADO_EJECUCION_INICIAL,
  )

  // El reinicio del estado local NO se hace aquí con setState dentro de un
  // efecto: el envoltorio `TaskExecutionSheet` remonta este componente con una
  // `key` nueva al cerrar, y React inicializa outcome/foto/formulario limpios.

  // Limpieza del timer si el componente se desmonta durante la animación.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  /** Bloquea el envío hasta que RHF valide los campos obligatorios visibles. */
  const vitalesInvalidos =
    outcome === 'completada' && task?.requires_vitals === true && Object.keys(formState.errors).length > 0
  const fotoPendiente = outcome === 'completada' && task?.requires_photo === true && photoDataUrl === null

  async function manejarArchivo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPhotoError(null)
    setPhotoDataUrl(null)
    setPhotoName(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('El archivo debe ser una fotografía (imagen).')
      return
    }
    try {
      const dataUrl = await fileADataUrl(file)
      if (dataUrl.length > TAMANIO_MAXIMO_FOTO_BASE64) {
        setPhotoError('La foto es muy pesada. Toma otra con menos zoom o más lejos.')
        return
      }
      setPhotoDataUrl(dataUrl)
      setPhotoName(file.name || 'foto_de_camara.jpg')
    } catch {
      setPhotoError('No se pudo leer la fotografía. Inténtalo de nuevo.')
    }
  }

  const tipoTarea = task ? TASK_TYPE_LABELS[task.task_type as TaskType] ?? task.task_type : ''

  return (
    <AnimatePresence>
      {open && task ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={pendiente ? undefined : onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`Ejecutar tarea: ${task.title}`}
        >
          <motion.div
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: showSuccess ? '100%' : 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra de arrastre decorativa */}
            <div className="flex justify-center pt-3">
              <span className="h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />
            </div>

            {showSuccess ? (
              /* ---------- Animación de éxito (check verde) ---------- */
              <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                <motion.svg
                  viewBox="0 0 52 52"
                  className="h-24 w-24"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  aria-hidden="true"
                >
                  <motion.circle
                    cx="26"
                    cy="26"
                    r="24"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="3"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4 }}
                  />
                  <motion.path
                    d="M15 27 l7 7 l15 -16"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  />
                </motion.svg>
                <p className="text-xl font-bold text-emerald-700">{estado.mensaje || '¡Listo!'}</p>
              </div>
            ) : (
              /* ---------- Formulario de ejecución ---------- */
              <form action={accion} className="px-5 pb-8 pt-4">
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="outcome" value={outcome} />

                <header className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-700">
                    <time dateTime={task.scheduled_time}>{task.scheduled_time.slice(11, 16)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{tipoTarea}</span>
                  </div>
                  <h2 className="text-xl font-bold leading-snug text-slate-900">{task.title}</h2>
                  <p className="text-sm text-slate-600">
                    {task.resident_name}
                    {task.room_number ? ` · Habitación ${task.room_number}` : ''}
                  </p>
                </header>

                {/* Selector rápido Completar / Omitir (touch targets 56px) */}
                <div className="mb-5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Resultado de la tarea">
                  {(['completada', 'omitida'] as const).map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      role="radio"
                      aria-checked={outcome === opcion}
                      onClick={() => setOutcome(opcion)}
                      className={cn(
                        'min-h-14 rounded-2xl border-2 text-base font-bold transition-colors',
                        outcome === opcion
                          ? opcion === 'completada'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-500',
                      )}
                    >
                      {opcion === 'completada' ? '✓ Completar' : '⊘ Omitir'}
                    </button>
                  ))}
                </div>

                {/* Signos vitales: solo al completar y si la tarea los exige */}
                {outcome === 'completada' && task.requires_vitals ? (
                  <div className="mb-5">
                    <VitalSignsForm control={control} />
                  </div>
                ) : null}

                {/* Foto de evidencia: solo al completar y si la tarea la exige */}
                {outcome === 'completada' && task.requires_photo ? (
                  <div className="mb-5 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Fotografía de evidencia
                    </p>
                    <label
                      htmlFor="foto-evidencia"
                      className={cn(
                        'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-base font-semibold',
                        photoDataUrl
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-slate-50 text-slate-600',
                      )}
                    >
                      {photoDataUrl ? `📷 ${photoName ?? 'Foto tomada'}` : '📷 Tomar fotografía'}
                    </label>
                    <input
                      id="foto-evidencia"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => void manejarArchivo(e)}
                    />
                    {photoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoDataUrl}
                        alt="Vista previa de la evidencia fotográfica"
                        className="max-h-48 w-full rounded-xl object-cover ring-1 ring-slate-200"
                      />
                    ) : null}
                    {photoError ? (
                      <p role="alert" className="text-sm font-medium text-rose-700">
                        {photoError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Notas rápidas (opcional) */}
                <div className="mb-5 space-y-2">
                  <label htmlFor="notas-tarea" className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Notas (opcional)
                  </label>
                  <textarea
                    id="notas-tarea"
                    name="notes"
                    rows={2}
                    maxLength={1000}
                    placeholder={outcome === 'omitida' ? 'Motivo de la omisión (recomendado)' : 'Observaciones de la ejecución'}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                  />
                </div>

                {/* La foto viaja inyectada en el FormData por la action wrapper
                    (ver photoRef arriba); no se duplica como input del DOM. */}

                {estado.mensaje && !estado.exito ? (
                  <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-inset ring-rose-200">
                    {estado.mensaje}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pendiente || vitalesInvalidos || fotoPendiente}
                  className={cn(
                    'min-h-14 w-full rounded-2xl text-lg font-bold text-white transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700',
                    pendiente || vitalesInvalidos || fotoPendiente
                      ? 'cursor-not-allowed bg-slate-300'
                      : 'bg-teal-700 active:bg-teal-800',
                  )}
                >
                  {pendiente
                    ? 'Guardando…'
                    : outcome === 'completada'
                      ? 'Confirmar tarea completada'
                      : 'Confirmar omisión'}
                </button>
                {vitalesInvalidos ? (
                  <p className="mt-2 text-center text-sm font-medium text-rose-700">
                    Corrige los signos vitales marcados antes de confirmar.
                  </p>
                ) : null}
                {fotoPendiente ? (
                  <p className="mt-2 text-center text-sm font-medium text-rose-700">
                    Esta tarea requiere una fotografía de evidencia.
                  </p>
                ) : null}
              </form>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
