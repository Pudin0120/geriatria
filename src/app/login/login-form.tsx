'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { SubmitButton } from '@/components/ui/Button'
import { login, type LoginState } from '@/lib/supabase/actions'

const ESTADO_INICIAL: LoginState = { error: null }

/** Formulario de inicio de sesión conectado a la Server Action `login`. */
export function LoginForm() {
  const [estado, accion] = useActionState<LoginState, FormData>(login, ESTADO_INICIAL)
  // El proxy redirige a /login?redirect=/ruta-original al exigir sesión;
  // propagamos ese destino a la Server Action tras un login exitoso.
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get('redirect')

  return (
    <form action={accion} className="space-y-4" noValidate>
      {redirectParam ? <input type="hidden" name="redirectTo" value={redirectParam} /> : null}
      <Input
        id="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        placeholder="nombre@gericare.app"
        required
      />
      <Input
        id="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        minLength={8}
        required
      />

      {estado.error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
        >
          {estado.error}
        </p>
      ) : null}

      <SubmitButton className="w-full">Iniciar sesión</SubmitButton>
    </form>
  )
}
