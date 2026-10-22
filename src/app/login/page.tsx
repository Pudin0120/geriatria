import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthTabs } from './auth-tabs'

export const metadata: Metadata = {
  title: 'Iniciar sesión · GeriCare',
  description:
    'Acceso al panel de cuidado geriátrico integral de GeriCare para el personal clínico y administrativo.',
}

/** Página pública de autenticación (login + registro). */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-teal-50 to-slate-100 px-4 py-10">
      <Suspense fallback={<div className="h-[480px] w-full max-w-md animate-pulse rounded-2xl bg-white/60" />}>
        <AuthTabs />
      </Suspense>
    </main>
  )
}
