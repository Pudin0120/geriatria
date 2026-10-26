'use client'

import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { SubmitButton } from '@/components/ui/Button'
import { LoginForm } from './login-form'

/** El acceso es por invitación; el registro público nunca se ofrece. */
export function AuthTabs() {
  return (
    <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_90px_rgba(29,67,56,.12)] lg:min-h-[610px] lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#173b36] p-10 text-white lg:flex xl:p-14">
        <div aria-hidden="true" className="absolute -bottom-40 -right-36 h-[28rem] w-[28rem] rounded-full border-[52px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-20 -right-16 h-[19rem] w-[19rem] rounded-full border-[1px] border-[#b5d2c2]/20" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d3e9de] text-xl font-extrabold text-[#155c4e]">G</div>
          <div><p className="text-base font-bold tracking-tight">GeriCare</p><p className="text-xs text-[#b8d0c4]">Cuidado geriátrico integral</p></div>
        </div>
        <div className="relative max-w-md pb-8">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#c5ddcf]"><span className="h-1.5 w-1.5 rounded-full bg-[#91c9a9]" /> Espacio de trabajo clínico</p>
          <h2 className="text-4xl font-semibold leading-[1.13] tracking-tight xl:text-[2.8rem]">Cuidar mejor empieza con una visión compartida.</h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-[#c2d3cb]">Accede a las herramientas de seguimiento y coordinación de tu equipo, según tu perfil de usuario.</p>
        </div>
        <p className="relative text-xs text-[#a9c5b9]">Acceso seguro para el equipo y las familias autorizadas.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:px-12 xl:px-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#176b5b] text-xl font-extrabold text-white">G</div>
            <p className="text-sm font-semibold text-[#176b5b]">GeriCare</p>
          </div>
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#548477]">Bienvenido de nuevo</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1b302e]">Iniciar sesión</h1>
            <p className="mt-2 text-sm leading-6 text-[#71817c]">Ingresa con el correo asociado a tu invitación.</p>
          </div>
          <LoginForm />
          <p className="mt-6 text-center text-sm"><Link className="font-semibold text-[#176b5b] underline-offset-4 hover:text-[#104f45] hover:underline" href="/login/recuperar">¿Olvidaste tu contraseña?</Link></p>
          <div className="mt-8 border-t border-[#edf1ee] pt-5 text-center">
            <p className="text-xs leading-5 text-[#71817c]">El acceso se habilita mediante invitación administrativa.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export function RecoveryForm() {
  return (
    <form action="/auth/recuperar" method="post" className="space-y-5">
      <Input id="email" label="Correo electrónico" type="email" autoComplete="email" required />
      <SubmitButton className="w-full">Enviar instrucciones</SubmitButton>
      <Link className="block text-center text-sm text-teal-700" href="/login">Volver al inicio de sesión</Link>
    </form>
  )
}
