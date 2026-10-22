/**
 * Utilidades de presentación compartidas por la UI de GeriCare.
 */

/** Une clases condicionales sin dependencias externas (sustituye a clsx). */
export function cn(
  ...clases: Array<string | false | null | undefined>
): string {
  return clases.filter(Boolean).join(' ')
}

/** Convierte un Date o ISO string a 'YYYY-MM-DD' en horario local. */
export function fechaLocalISO(valor: Date | string = new Date()): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/** Formatea una fecha ISO ('YYYY-MM-DD') como '12 oct 2026'. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Extrae 'HH:mm' de una hora SQL ('HH:mm:ss'). */
export function horaCorta(hora: string): string {
  return hora.slice(0, 5)
}

/** Calcula la edad en años completos a partir de una fecha de nacimiento. */
export function calcularEdad(birthDate: string): number {
  const nacimiento = new Date(`${birthDate.slice(0, 10)}T00:00:00`)
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const m = hoy.getMonth() - nacimiento.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad -= 1
  }
  return edad
}

/** Edad legible en español ('84 años'). */
export function calcularEdadTexto(birthDate: string): string {
  return `${calcularEdad(birthDate)} años`
}
