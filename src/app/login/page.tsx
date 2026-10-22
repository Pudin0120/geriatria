/**
 * GeriCare · Fase 2 — Página de autenticación (login y registro)
 */

import type { Metadata } from 'next'
import { AuthTabs } from './auth-tabs'

export const metadata: Metadata = {
  title: 'Acceder',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-lg font-bold text-white shadow">
            G
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            GeriCare
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Plataforma de gestión para residencias geriátricas
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <AuthTabs />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acceso restringido al personal autorizado de la residencia.
        </p>
      </div>
    </main>
  )
}
