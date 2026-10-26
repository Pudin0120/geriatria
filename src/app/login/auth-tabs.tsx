'use client'

import { useState, useActionState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button, SubmitButton } from '@/components/ui/Button'
import { signup, type SignupState } from '@/lib/supabase/actions'
import { LoginForm } from './login-form'

const ESTADO_INICIAL: SignupState = { error: null, exito: false }

/** Formulario de registro de nuevo personal (rol inicial: auxiliar). */
export function SignupForm({ onCambiarModo }: { onCambiarModo: () => void }) {
  const [estado, accion] = useActionState<SignupState, FormData>(
    signup,
    ESTADO_INICIAL,
  )

  if (estado.exito && !estado.error) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
          Cuenta creada correctamente. Revisa tu correo para confirmarla y luego
          inicia sesión.
        </p>
        <Button variant="secondary" className="w-full" onClick={onCambiarModo}>
          Volver a iniciar sesión
        </Button>
      </div>
    )
  }

  return (
    <form action={accion} className="space-y-4" noValidate>
      <Input
        id="full_name"
        label="Nombre completo"
        type="text"
        autoComplete="name"
        placeholder="Ej. María Fernanda López"
        required
      />
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
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
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

      <SubmitButton className="w-full">Crear cuenta</SubmitButton>
      <button
        type="button"
        onClick={onCambiarModo}
        className="w-full text-center text-sm font-medium text-teal-700 hover:text-teal-800"
      >
        ¿Ya tienes cuenta? Inicia sesión
      </button>
    </form>
  )
}

/** Contenedor con pestañas login / registro para la página pública. */
export function AuthTabs() {
  const [modo, setModo] = useState<'login' | 'registro'>('login')

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-bold text-white">
          G
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          GeriCare
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cuidado geriátrico integral, en un solo lugar.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setModo('login')}
          aria-pressed={modo === 'login'}
          className={
            modo === 'login'
              ? 'rounded-md bg-white px-3 py-1.5 text-slate-900 shadow-sm'
              : 'rounded-md px-3 py-1.5 text-slate-500 hover:text-slate-700'
          }
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={() => setModo('registro')}
          aria-pressed={modo === 'registro'}
          className={
            modo === 'registro'
              ? 'rounded-md bg-white px-3 py-1.5 text-slate-900 shadow-sm'
              : 'rounded-md px-3 py-1.5 text-slate-500 hover:text-slate-700'
          }
        >
          Crear cuenta
        </button>
      </div>

      {modo === 'login' ? <LoginForm /> : <SignupForm onCambiarModo={() => setModo('login')} />}
    </div>
  )
}
