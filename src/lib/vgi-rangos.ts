/**
 * Rangos clínicos validados de las escalas de la Valoración Geriátrica
 * Integral (VGI). Coinciden con los CHECK de la migración de la Fase 1.
 *
 * Se mantiene fuera de `actions.ts` porque los módulos `'use server'`
 * solo pueden exportar funciones async; este objeto es importado tanto
 * por las Server Actions (validación en servidor) como por el formulario
 * cliente de VGI (validación en cliente y etiquetas visibles).
 */
export const RANGOS_VGI = {
  barthel_index: { min: 0, max: 100, etiqueta: 'Índice de Barthel' },
  mmse_score: { min: 0, max: 30, etiqueta: 'MMSE (Mini-Mental)' },
  mna_sf_score: { min: 0, max: 14, etiqueta: 'MNA-SF (Nutrición)' },
  downton_score: { min: 0, max: 3, etiqueta: 'Downton (Caídas)' },
  yesavage_score: { min: 0, max: 15, etiqueta: 'Yesavage (Ánimo)' },
  charlson_score: { min: 0, max: 37, etiqueta: 'Charlson (Comorbilidad)' },
} as const satisfies Readonly<Record<string, { min: number; max: number; etiqueta: string }>>

/** Nombres de las escalas VGI (claves de RANGOS_VGI). */
export type CampoVgi = keyof typeof RANGOS_VGI
