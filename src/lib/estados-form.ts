/**
 * Tipos de estado de formulario compartidos entre las Server Actions
 * (`src/lib/supabase/actions.ts`) y los Client Components que consumen
 * `useActionState`.
 *
 * Nota de arquitectura: un módulo `'use server'` solo puede exportar
 * funciones async. Los tipos e interfaces se declaran aquí para poder
 * importarlos desde componentes cliente sin arrastrar el grafo de
 * dependencias del servidor (y sin violar esa restricción).
 */

export interface LoginState {
  error: string | null
}

export interface ResidentFormState {
  error: string | null
  exito: boolean
  /** Errores por campo (id del input → mensaje en español). */
  campos: Record<string, string>
}

export interface VgiFormState {
  error: string | null
  exito: boolean
  campos: Record<string, string>
}

/** Estado compartido por los formularios y modales de la Fase 4. */
export interface ClinicalFormState {
  error: string | null
  exito: boolean
  /** Errores por campo (id del input → mensaje en español). */
  campos: Record<string, string>
}
