import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { getSafePostLoginRedirect, readPasswordField } from '../src/lib/auth/form-fields.mjs'

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

test('el destino de login solo acepta rutas protegidas locales', () => {
  assert.equal(getSafePostLoginRedirect('/dashboard/residentes'), '/dashboard/residentes')
  assert.equal(getSafePostLoginRedirect('/auxiliar'), '/auxiliar')
  assert.equal(getSafePostLoginRedirect('//evil.example'), '/dashboard')
  assert.equal(getSafePostLoginRedirect('/\\evil.example'), '/dashboard')
  assert.equal(getSafePostLoginRedirect('https://evil.example'), '/dashboard')
  assert.equal(getSafePostLoginRedirect('/login'), '/dashboard')
})

test('Next.js puede inlinear las variables públicas de Supabase', async () => {
  const source = await readFile(new URL('../src/lib/supabase/env.ts', import.meta.url), 'utf8')
  assert.match(source, /limpiar\(process\.env\.NEXT_PUBLIC_SUPABASE_URL\)/)
  assert.match(source, /limpiar\(process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY\)/)
  assert.doesNotMatch(source, /limpiar\(process\.env\[NOMBRE_(?:URL|KEY)\]\)/)
})
