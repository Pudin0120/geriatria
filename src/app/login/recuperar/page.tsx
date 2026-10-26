import Link from 'next/link'
import { Suspense } from 'react'
import { RecoveryForm } from '../auth-tabs'

export const instant = false

export default async function RecuperarPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const params = await searchParams
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#edf3ef] px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-36 -top-44 h-[32rem] w-[32rem] rounded-full bg-[#dcebe2] blur-3xl" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/80 bg-white p-7 shadow-[0_24px_90px_rgba(29,67,56,.12)] sm:p-10">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#176b5b] text-xl font-extrabold text-white">G</div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#548477]">Acceso a tu cuenta</p>
        <h1 className="mt-2 text-xl font-bold">Recuperar contraseña</h1>
        {params.sent ? (
          <p className="mt-4 rounded-2xl border border-[#dce9e0] bg-[#f3f8f4] p-4 text-sm leading-6 text-[#45665b]">Si el correo corresponde a una cuenta, recibirás instrucciones para restablecer la contraseña.</p>
        ) : <div className="mt-5"><Suspense><RecoveryForm /></Suspense></div>}
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#176b5b] hover:underline">Volver al inicio de sesión</Link>
      </section>
    </main>
  )
}
