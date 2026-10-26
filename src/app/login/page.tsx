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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#edf3ef] px-4 py-8 sm:px-8 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -left-36 -top-44 h-[32rem] w-[32rem] rounded-full bg-[#dcebe2] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-56 -right-40 h-[36rem] w-[36rem] rounded-full bg-[#d9e8e2] blur-3xl" />
      <Suspense fallback={<div className="relative h-[480px] w-full max-w-md animate-pulse rounded-3xl bg-white/70" />}>
        <AuthTabs />
      </Suspense>
    </main>
  )
}
