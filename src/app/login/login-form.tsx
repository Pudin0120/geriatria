'use client'

/**
 * Formulario de inicio de sesión conectado a la Server Action `login`.
 */

import { useActionState } from 'react'
import { login, type AuthState } from '@/lib/supabase/actions'
import { Input } from '@/components/ui/Input'
import { SubmitButton } from '@/components/ui/Button'

const ESTADO_INICIAL: AuthState = { exito: false, mensaje: '' }

export function LoginForm() {
  const [estado, accion] = useActionState(login, ESTADO_INICIAL)

  return (
    <form action={accion} className="space-y-4" noValidate>
      <Input
        id="login-email"
        name="email"
        type="email"
        etiqueta="Correo electrónico"
        placeholder="nombre@gericare.es"
        autoComplete="email"
        required
      />
      <Input
        id="login-password"
        name="password"
        type="password"
        etiqueta="Contraseña"
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />

      {!estado.exito && estado.mensaje ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200"
        >
          {estado.mensaje}
        </p>
      ) : null}

      <SubmitButton className="w-full" textoCargando="Iniciando sesión…">
        Entrar
      </SubmitButton>
    </form>
  )
}
