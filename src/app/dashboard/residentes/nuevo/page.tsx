import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { ResidentForm } from './resident-form'

export const metadata = {
  title: 'Nuevo residente',
  description: 'Registrar una persona en el censo de la residencia.',
}

/** La página depende de la sesión activa y se resuelve durante la petición. */
export const instant = false

const ROLES_PUEDEN_CREAR: ReadonlySet<string> = new Set(['admin', 'nurse_jefe', 'medico'])

export default async function NuevoResidentePage() {
  await connection()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_PUEDEN_CREAR.has(sesion.rol)) redirect('/dashboard/residentes')

  return (
    <div className="space-y-6">
      <nav aria-label="Migas de navegación">
        <Link href="/dashboard/residentes" className="text-sm text-slate-500 hover:text-teal-700 hover:underline">
          ‹ Volver al censo
        </Link>
      </nav>
      <ResidentForm />
    </div>
  )
}
