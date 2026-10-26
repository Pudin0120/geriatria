/**
 * Pure date helpers for materializing recurring care tasks.
 * @typedef {import('../types').CreateTaskInput} CreateTaskInput
 */

export const DIAS_LMV = Object.freeze([1, 3, 5])
export const VENTANA_RECURRENCIA_DIAS = 30

/** @param {string} fechaIso */
export function diaIsoDeFecha(fechaIso) {
  const date = new Date(`${fechaIso}T12:00:00`)
  return date.getDay() === 0 ? 7 : date.getDay()
}

/** @param {string} fechaIso @param {number} cantidad */
export function sumarDias(fechaIso, cantidad) {
  const [year, month, day] = fechaIso.split('-').map((part) => Number.parseInt(part, 10))
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + cantidad)
  const yearText = date.getFullYear()
  const monthText = String(date.getMonth() + 1).padStart(2, '0')
  const dayText = String(date.getDate()).padStart(2, '0')
  return `${yearText}-${monthText}-${dayText}`
}

/** @param {CreateTaskInput} input */
export function diasDelPatron(input) {
  switch (input.recurrence) {
    case 'none':
      return [diaIsoDeFecha(input.scheduled_time.slice(0, 10))]
    case 'daily':
      return [1, 2, 3, 4, 5, 6, 7]
    case 'lmi_vie':
      return [...DIAS_LMV]
    case 'custom':
      return [...new Set(input.recurrence_days)].sort((a, b) => a - b)
  }
}

/** @param {CreateTaskInput} input @param {number} windowDays */
export function fechasDeLaSerie(input, windowDays = VENTANA_RECURRENCIA_DIAS) {
  const start = input.scheduled_time.slice(0, 10)
  if (input.recurrence === 'none') return [start]

  const activeDays = new Set(diasDelPatron(input))
  const dates = []
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const date = sumarDias(start, offset)
    if (activeDays.has(diaIsoDeFecha(date))) dates.push(date)
  }
  return dates
}

/** @param {Date} [now] */
export function hoyLocalIso(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
