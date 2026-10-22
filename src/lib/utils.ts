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

/* ================================================================== */
/* Utilidades de la Fase 4: agenda diaria, tareas y medicaciones       */
/* ================================================================== */

import type {
  AdministrationOutcome,
  CareTaskRow,
  DayOfWeek,
  ExecutionOutcome,
  MedicationRoute,
  ResidentRow,
} from '@/types'

/** Nombre completo 'Apellido Apellido, Nombre' para una fila de residente. */
export function nombreResidente(resident: Pick<ResidentRow, 'first_name' | 'last_name'>): string {
  return `${resident.last_name}, ${resident.first_name}`
}

/** Día ISO (1 = lunes … 7 = domingo) de una fecha 'YYYY-MM-DD'. */
export function diaIsoDeFecha(fechaIso: string): DayOfWeek {
  const d = new Date(`${fechaIso.slice(0, 10)}T12:00:00`)
  const dow = d.getDay() // 0 = domingo
  return (dow === 0 ? 7 : dow) as DayOfWeek
}

/**
 * Comprueba si una tarea recurrente está programada para un día concreto,
 * teniendo en cuenta su ventana de vigencia (effective_from / effective_until).
 */
export function tareaProgramadaParaElDia(task: CareTaskRow, fechaIso: string): boolean {
  const hoy = fechaIso.slice(0, 10)
  if (task.effective_from > hoy) return false
  if (task.effective_until !== null && task.effective_until < hoy) return false
  return task.days_of_week.includes(diaIsoDeFecha(hoy))
}

/** Convierte una hora SQL 'HH:mm:ss' del día de referencia en Date local. */
export function fechaHoraDeHoraSql(horaSql: string, base: Date = new Date()): Date {
  const [h, m] = horaSql.split(':')
  const d = new Date(base)
  d.setHours(Number(h), Number(m ?? '0'), 0, 0)
  return d
}

/** Combina una fecha 'YYYY-MM-DD' y una hora 'HH:mm[:ss]' como timestamp ISO. */
export function timestampDeFechaYHora(fechaIso: string, horaSql: string): string {
  const [h, m] = horaSql.split(':')
  return new Date(`${fechaIso.slice(0, 10)}T${String(h).padStart(2, '0')}:${String(m ?? '0').padStart(2, '0')}:00`).toISOString()
}

/** Devuelve la hora actual formateada para `<input type="time">` (local, HH:mm). */
export function horaInputActual(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Tono semántico para el resultado de ejecutar una tarea (verde/ámbar/rojo). */
export function toneParaExecutionOutcome(outcome: ExecutionOutcome): 'emerald' | 'amber' | 'rose' {
  switch (outcome) {
    case 'completada':
      return 'emerald'
    case 'omitida':
      return 'amber'
    case 'cancelada':
      return 'rose'
  }
}

/** Tono semántico para el resultado de administrar medicación (DURO). */
export function toneParaAdministrationOutcome(
  outcome: AdministrationOutcome,
): 'emerald' | 'amber' | 'rose' {
  switch (outcome) {
    case 'administrada':
      return 'emerald'
    case 'parcial':
      return 'amber'
    case 'rechazada':
    case 'omitida':
      return 'rose'
  }
}

/** Vías de administración en el orden canónico para selects/medición UI. */
export const VIAS_MEDICACION: readonly MedicationRoute[] = [
  'oral',
  'topica',
  'intravenosa',
  'intramuscular',
  'subcutanea',
  'rectal',
  'inhalatoria',
  'transdermica',
  'oftalmica',
  'otica',
]
