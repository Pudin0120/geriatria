import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { SubmitButton } from '@/components/ui/Button'

export const metadata = {
  title: 'Nueva contraseña',
}

export const instant = false

export default async function ActualizarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#edf3ef] px-4 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white p-7 shadow-[0_24px_90px_rgba(29,67,56,.12)] sm:p-10">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#176b5b] text-xl font-extrabold text-white">G</div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#548477]">Recuperación de cuenta</p>
        <h1 className="mt-2">Crea una nueva contraseña</h1>
        <p className="mt-2 text-sm leading-6 text-[#71817c]">Elige una contraseña de al menos 8 caracteres para volver a acceder a GeriCare.</p>
        {error ? (
          <p role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-5 text-rose-700">
            El enlace no es válido o la contraseña no cumple los requisitos. Solicita un nuevo enlace.
          </p>
        ) : null}
        <form action="/auth/actualizar/enviar" method="post" className="mt-6 space-y-5">
          <Input id="password" name="password" label="Nueva contraseña" type="password" minLength={8} autoComplete="new-password" required />
          <SubmitButton className="w-full">Actualizar contraseña</SubmitButton>
        </form>
        <Link href="/login/recuperar" className="mt-6 block text-center text-sm font-semibold text-[#176b5b] hover:underline">Solicitar otro enlace</Link>
      </section>
    </main>
  )
}
