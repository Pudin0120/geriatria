'use client'

/**
 * Pestañas de acceso: "Iniciar sesión" / "Crear cuenta".
 * Alterna entre el formulario de login y el de registro.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LoginForm } from './login-form'
import { SignupForm } from './signup-form'

type Pestana = 'login' | 'registro'

export function AuthTabs() {
  const [pestana, setPestana] = useState<Pestana>('login')

  return (
    <div>
      <div
        role="tablist"
        aria-label="Autenticación"
        className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'login'}
          onClick={() => setPestana('login')}
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pestana === 'login'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'registro'}
          onClick={() => setPestana('registro')}
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pestana === 'registro'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          Crear cuenta
        </button>
      </div>

      {pestana === 'login' ? <LoginForm /> : <SignupForm />}
    </div>
  )
}
