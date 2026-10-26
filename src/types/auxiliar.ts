/**
 * GeriCare · FASE 7 — Tipos del módulo móvil para auxiliares.
 * Separados de `@/types` (dominio general) porque modelan exclusivamente la
 * experiencia táctica de ejecución de tareas en dispositivo pequeño.
 */

import { z } from 'zod'

/* ================================================================== */
/* Signos vitales: esquema Zod compartido cliente/servidor             */
/* ================================================================== */

/**
 * Rangos fisiológicos amplios pero seguros: evitan capturas erróneas típicas
 * de teclado táctil (p. ej. "300" en sistólica o "999" en saturación).
 * Todos los campos son opcionales: el auxiliar registra solo lo que midió.
 */
export const VitalSignsMobileSchema = z
  .object({
    tension_sistolica: z
      .number({ message: 'Valor no válido.' })
      .int('La sistólica debe ser un número entero.')
      .min(70, 'La presión sistólica debe estar entre 70 y 220 mmHg.')
      .max(220, 'La presión sistólica debe estar entre 70 y 220 mmHg.')
      .optional(),
    tension_diastolica: z
      .number({ message: 'Valor no válido.' })
      .int('La diastólica debe ser un número entero.')
      .min(40, 'La presión diastólica debe estar entre 40 y 130 mmHg.')
      .max(130, 'La presión diastólica debe estar entre 40 y 130 mmHg.')
      .optional(),
    frecuencia_cardiaca: z
      .number({ message: 'Valor no válido.' })
      .int('La frecuencia cardíaca debe ser un número entero.')
      .min(30, 'La frecuencia cardíaca debe estar entre 30 y 220 lpm.')
      .max(220, 'La frecuencia cardíaca debe estar entre 30 y 220 lpm.')
      .optional(),
    temperatura: z
      .number({ message: 'Valor no válido.' })
      .min(34, 'La temperatura debe estar entre 34 y 42 °C.')
      .max(42, 'La temperatura debe estar entre 34 y 42 °C.')
      .optional(),
    glucemia: z
      .number({ message: 'Valor no válido.' })
      .int('La glucemia debe ser un número entero.')
      .min(20, 'La glucemia debe estar entre 20 y 600 mg/dL.')
      .max(600, 'La glucemia debe estar entre 20 y 600 mg/dL.')
      .optional(),
    saturacion_oxigeno: z
      .number({ message: 'Valor no válido.' })
      .int('La saturación debe ser un número entero.')
      .min(70, 'La saturación de O₂ debe estar entre 70 y 100 %.')
      .max(100, 'La saturación de O₂ debe estar entre 70 y 100 %.')
      .optional(),
  })
  .superRefine((val, ctx) => {
    // Coherencia clínica básica: si ambas presiones están presentes, la
    // sistólica debe superar a la diastólica.
    if (
      val.tension_sistolica !== undefined &&
      val.tension_diastolica !== undefined &&
      val.tension_sistolica <= val.tension_diastolica
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['tension_sistolica'],
        message: 'La sistólica debe ser mayor que la diastólica.',
      })
    }
  })

export type VitalSignsMobileValues = z.infer<typeof VitalSignsMobileSchema>

/** Etiquetas visibles de cada signo vital (UI en español). */
export const VITAL_SIGNS_LABELS = {
  tension_sistolica: 'Sistólica (mmHg)',
  tension_diastolica: 'Diastólica (mmHg)',
  frecuencia_cardiaca: 'Pulso (lpm)',
  temperatura: 'Temperatura (°C)',
  glucemia: 'Glucemia (mg/dL)',
  saturacion_oxigeno: 'Saturación O₂ (%)',
} as const satisfies Readonly<Record<keyof VitalSignsMobileValues, string>>

/** Texto del rango válido mostrado bajo cada campo. */
export const VITAL_SIGNS_RANGES = {
  tension_sistolica: '70 – 220',
  tension_diastolica: '40 – 130',
  frecuencia_cardiaca: '30 – 220',
  temperatura: '34.0 – 42.0',
  glucemia: '20 – 600',
  saturacion_oxigeno: '70 – 100',
} as const satisfies Readonly<Record<keyof VitalSignsMobileValues, string>>

/* ================================================================== */
/* Resultado de la Server Action executeTask (Fase 7)                  */
/* ================================================================== */

export interface ExecuteTaskMobileResult {
  exito: boolean
  /** Mensaje visible en español (éxito o error). Vacío si aún no se envía. */
  mensaje: string
}

export const RESULTADO_EJECUCION_INICIAL: ExecuteTaskMobileResult = {
  exito: false,
  mensaje: '',
}

/* ================================================================== */
/* Carga útil serializada desde el Server Component al modal          */
/* ================================================================== */

/** Tarea compacta que consume la lista móvil y el bottom-sheet. */
export interface TareaMovilAuxiliar {
  id: string
  title: string
  task_type: string
  scheduled_time: string
  requires_vitals: boolean
  requires_photo: boolean
  resident_name: string
  room_number: string | null
}

/** Límite de tamaño de la foto de evidencia (data URL) para no saturar JSONB. */
export const TAMANIO_MAXIMO_FOTO_BASE64 = 250_000
