/**
 * GeriCare · Fase 2 — Utilidades de UI
 *
 * Integrador de clases minimalista (equivalente a `clsx` + `tailwind-merge`)
 * sin dependencias externas: permite componer `className` en los componentes
 * base de `src/components/ui/`.
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>

/** Aplana valores y descarta los falsy; devuelve una cadena de clases. */
export function cn(...inputs: ClassValue[]): string {
  const partes: string[] = []

  for (const entrada of inputs) {
    if (!entrada) continue

    if (typeof entrada === 'string' || typeof entrada === 'number') {
      partes.push(String(entrada))
    } else if (Array.isArray(entrada)) {
      const anidada = cn(...entrada)
      if (anidada) partes.push(anidada)
    } else if (typeof entrada === 'object') {
      for (const [clave, valor] of Object.entries(entrada)) {
        if (valor) partes.push(clave)
      }
    }
  }

  return partes.join(' ')
}
