import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPasswordField } from '../src/lib/auth/form-fields.mjs'

test('la contraseña se conserva exactamente sin quitar espacios', () => {
  const formData = new FormData()
  formData.set('password', '  clave de prueba  ')
  assert.equal(readPasswordField(formData), '  clave de prueba  ')
})

test('un valor no textual no se convierte accidentalmente en contraseña', () => {
  const formData = new FormData()
  formData.set('password', new Blob(['archivo']))
  assert.equal(readPasswordField(formData), '')
})
