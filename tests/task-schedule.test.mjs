import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diaIsoDeFecha, diasDelPatron, fechasDeLaSerie, sumarDias } from '../src/lib/task-schedule.mjs'

function input(recurrence, scheduledTime, recurrenceDays = []) {
  return { recurrence, scheduled_time: scheduledTime, recurrence_days: recurrenceDays }
}

test('suma días correctamente al cruzar meses, año y día bisiesto', () => {
  assert.equal(sumarDias('2024-02-28', 1), '2024-02-29')
  assert.equal(sumarDias('2024-12-31', 1), '2025-01-01')
})

test('una tarea sin repetición produce exactamente una fecha', () => {
  const dates = fechasDeLaSerie(input('none', '2026-12-31T23:40'))
  assert.deepEqual(dates, ['2026-12-31'])
})

test('la recurrencia diaria contiene 31 fechas, desde el inicio hasta el día 30', () => {
  const dates = fechasDeLaSerie(input('daily', '2026-12-30T08:00'))
  assert.equal(dates.length, 31)
  assert.equal(dates[0], '2026-12-30')
  assert.equal(dates.at(-1), '2027-01-29')
  assert.equal(new Set(dates).size, dates.length)
})

test('el patrón lunes-miércoles-viernes usa días ISO y respeta el límite inclusivo', () => {
  const dates = fechasDeLaSerie(input('lmi_vie', '2026-10-30T08:00'))
  assert.equal(dates[0], '2026-10-30')
  assert.equal(dates.at(-1), '2026-11-27')
  assert.ok(dates.every((date) => [1, 3, 5].includes(diaIsoDeFecha(date))))
})

test('el patrón personalizado ordena y elimina días repetidos sin mutar el formulario', () => {
  const days = [5, 1, 5, 3]
  const task = input('custom', '2026-10-25T08:00', days)
  assert.deepEqual(diasDelPatron(task), [1, 3, 5])
  assert.deepEqual(days, [5, 1, 5, 3])
  const dates = fechasDeLaSerie(task)
  assert.ok(dates.every((date) => [1, 3, 5].includes(diaIsoDeFecha(date))))
  assert.equal(new Set(dates).size, dates.length)
})
