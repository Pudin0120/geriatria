import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { MedicationForm } from './medication-form'
import type { ResidentRow } from '@/types'

export const metadata = {
  title: 'Nueva medicación',
  description: 'Prescribir un nuevo tratamiento a un residente.',
}

/** Los metadatos dependen de la sesión (cookies): se resuelven en runtime. */
export const instant = false

/** Verifica formato UUID antes de consultar la BD. */
function esUuid(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

interface NuevaMedicacionPageProps {
  params: Promise<{ id: string }>
}

/** Página separada para prescribir una nueva medicación a un residente. */
export default async function NuevaMedicacionPage({ params }: NuevaMedicacionPageProps) {
  await connection()
  const { id } = await params
  if (!esUuid(id)) notFound()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!['admin', 'nurse_jefe', 'medico'].includes(sesion.rol)) {
    redirect(`/dashboard/residentes/${id}/medicaciones`)
  }

  const supabase = await createClient()
  const { data: residente } = await supabase
    .from('residents')
    .select('*')
    .eq('id', id)
    .maybeSingle<ResidentRow>()

  if (!residente) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Migas de navegación">
        <ol className="flex items-center gap-2 text-sm text-slate-500">
          <li>
            <Link href={`/dashboard/residentes/${id}`} className="hover:text-teal-700 hover:underline">
              Ficha del residente
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href={`/dashboard/residentes/${id}/medicaciones`} className="hover:text-teal-700 hover:underline">
              Medicaciones
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li className="font-medium text-slate-700">Nueva prescripción</li>
        </ol>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nueva medicación</h1>
        <p className="mt-1 text-sm text-slate-500">
          {`${residente.last_name}, ${residente.first_name}`} · hab.{' '}
          {residente.room_number ?? 'sin asignar'}
        </p>
      </header>

      <MedicationForm residentId={id} residentName={`${residente.first_name} ${residente.last_name}`} />
    </div>
  )
}
