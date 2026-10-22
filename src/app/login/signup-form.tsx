'use client'

/**
 * Formulario de registro de cuentas conectada a la Server Action `signup`.
 */

import { useActionState } from 'react'
import { signup, type AuthState } from '@/lib/supabase/actions'
import { Input } from '@/components/ui/Input'
import { SubmitButton } from '@/components/ui/Button'

const ESTADO_INICIAL: AuthState = { exito: false, mensaje: '' }

export function SignupForm() {
  const [estado, accion] = useActionState(signup, ESTADO_INICIAL)

  return (
    <form action={accion} className="space-y-4" noValidate>
      <Input
        id="signup-fullName"
        name="fullName"
        etiqueta="Nombre completo"
        placeholder="María López García"
        autoComplete="name"
        required
      />
      <Input
        id="signup-email"
        name="email"
        type="email"
        etiqueta="Correo electrónico"
        placeholder="nombre@gericare.es"
        autoComplete="email"
        required
      />
      <Input
        id="signup-password"
        name="password"
        type="password"
        etiqueta="Contraseña"
        placeholder="Mínimo 8 caracteres"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <Input
        id="signup-confirmPassword"
        name="confirmPassword"
        type="password"
        etiqueta="Confirmar contraseña"
        placeholder="Repite la contraseña"
        autoComplete="new-password"
        required
        minLength={8}
      />

      {estado.mensaje ? (
        <p
          role="alert"
          className={
            estado.exito
              ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200'
              : 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200'
          }
        >
          {estado.mensaje}
        </p>
      ) : null}

      <SubmitButton className="w-full" textoCargando="Creando cuenta…">
        Crear cuenta
      </SubmitButton>

      <p className="text-xs text-slate-500">
        El rol del personal se asigna desde la administración una vez creada la
        cuenta.
      </p>
    </form>
  )
}
