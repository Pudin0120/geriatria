import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { VgiForm } from './vgi-form'
import type { ResidentRow } from '@/types'
import { GENDER_LABELS, buildResidentFullName } from '@/types'
import { calcularEdadTexto } from '@/lib/utils'

export const metadata = {
  title: 'Nueva valoración geriátrica integral',
  description: 'Formulario VGI con escalas clínicas validadas.',
}

/** Los metadatos dependen de la sesión (cookies): se resuelven en runtime. */
export const instant = false

/** Verifica formato UUID antes de consultar la BD. */
function esUuid(valor: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)
}

/* ================================================================== */
/* Formulario de VGI (Server Component: carga al residente)          */
/* ================================================================== */

interface VgiPageProps {
  params: Promise<{ id: string }>
}

export default async function NuevaVgiPage({ params }: VgiPageProps) {
  await connection()
  const { id } = await params
  if (!esUuid(id)) notFound()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  // Solo roles clínicos/admin pueden valorar (mismo criterio que la Server Action).
  if (!['admin', 'nurse_jefe', 'medico'].includes(sesion.rol)) {
    redirect(`/dashboard/residentes/${id}`)
  }

  const supabase = await createClient()
  const { data: residentData } = await supabase
    .from('residents')
    .select('*')
    .eq('id', id)
    .maybeSingle<ResidentRow>()

  if (!residentData) notFound()

  return (
    <div className="space-y-6">
      <nav aria-label="Migas de navegación">
        <ol className="flex items-center gap-2 text-sm text-slate-500">
          <li>
            <Link href="/dashboard/residentes" className="hover:text-teal-700 hover:underline">
              Residentes
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href={`/dashboard/residentes/${id}`} className="hover:text-teal-700 hover:underline">
              {buildResidentFullName(residentData)}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li className="font-medium text-slate-700">Nueva VGI</li>
        </ol>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Valoración Geriátrica Integral
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Para{' '}
          <span className="font-semibold text-slate-700">{buildResidentFullName(residentData)}</span>{' '}
          · {calcularEdadTexto(residentData.birth_date)} ·{' '}
          {GENDER_LABELS[residentData.gender]} · Habitación {residentData.room_number ?? '—'}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Las escalas son opcionales individualmente, pero deben respetar su rango clínico
          (Barthel 0-100, MMSE 0-30, MNA-SF 0-14, Downton 0-3, Yesavage 0-15, Charlson 0-37).
        </p>
      </header>

      <VgiForm residentId={id} />
    </div>
  )
}
