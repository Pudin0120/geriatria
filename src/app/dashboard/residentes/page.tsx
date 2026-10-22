import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { ResidentSearch, ResidentGridSkeleton } from './resident-search'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { ResidentRow } from '@/types'

export const metadata = {
  title: 'Residentes',
  description: 'Censo de residentes de la residencia.',
}

/** Los metadatos dependen de la sesión (cookies): se resuelven en runtime. */
export const instant = false

/** Roles con permiso de alta (coherente con las políticas RLS de la Fase 1). */
const ROLES_PUEDEN_CREAR: ReadonlySet<string> = new Set(['admin', 'nurse_jefe', 'medico'])

/* ================================================================== */
/* Listado de residentes (Server Component con datos reales)          */
/* ================================================================== */

export default async function ResidentesPage() {
  await connection()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const puedeCrear = ROLES_PUEDEN_CREAR.has(sesion.rol)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Residentes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Censo de personas atendidas en la residencia.
          </p>
        </div>
        {puedeCrear ? (
          <Link href="/dashboard/residentes/nuevo" className="contents">
            <Button>Nuevo residente</Button>
          </Link>
        ) : null}
      </header>

      <SuspenseListado />
    </div>
  )
}

/** Envuelve el contenido ya resuelto para mantener la estructura del árbol. */
function ContenidoResidentes({ children }: { children: ReactNode }) {
  return <>{children}</>
}

async function ListaResidentes() {
  const supabase = await createClient()

  // Consulta real: orden por fecha de ingreso descendente. RLS filtra por rol.
  const { data, error } = await supabase
    .from('residents')
    .select('*')
    .order('admission_date', { ascending: false })
    .returns<ResidentRow[]>()

  if (error) {
    return (
      <Card>
        <CardHeader title="No se pudo cargar el listado" />
        <CardContent>
          <p className="text-sm text-rose-700">
            Error al consultar los residentes: {error.message}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Revisa la conexión con Supabase o inténtalo de nuevo en unos segundos.
          </p>
        </CardContent>
      </Card>
    )
  }

  const residentes = data ?? []

  return (
    <>
      <p className="text-sm text-slate-500">
        {residentes.length === 0
          ? 'Todavía no hay residentes registrados.'
          : `${residentes.length} residente${residentes.length === 1 ? '' : 's'} en el censo.`}
      </p>
      <ContenidoResidentes>
        <ResidentSearch residentes={residentes} />
      </ContenidoResidentes>
    </>
  )
}

function ListaResidentesFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando residentes">
      <ResidentGridSkeleton />
    </div>
  )
}

/** Listado bajo Suspense: el esqueleto se muestra mientras llega la consulta a BD. */
function SuspenseListado() {
  return (
    <Suspense fallback={<ListaResidentesFallback />}>
      <ListaResidentes />
    </Suspense>
  )
}
