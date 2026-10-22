/**
 * GeriCare · Fase 2 — Layout del panel (dashboard)
 *
 * Server Component: resuelve sesión y rol contra Supabase (RLS), pinta el
 * sidebar con enlaces filtrados por rol y deja el contenido dinámico dentro
 * de un <Suspense> para convivir con `cacheComponents`/PPR de Next.js 16.
 */

import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { logout } from '@/lib/supabase/actions'
import type { UserRole } from '@/types'
import { RolBadge } from '@/components/ui/Badge'
import { SubmitButton } from '@/components/ui/Button'
import { SidebarLink } from '@/components/ui/SidebarLink'
import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton'

interface ElementoNav {
  href: string
  etiqueta: string
  roles: readonly UserRole[]
  exact?: boolean
  icono: ReactNode
}

const ICONO_CLASE = 'h-4 w-4'

/** Definición central de la navegación; los enlaces se filtran por rol. */
const ELEMENTOS_NAV: readonly ElementoNav[] = [
  {
    href: '/dashboard',
    etiqueta: 'Resumen',
    roles: ['admin', 'nurse_jefe', 'medico', 'auxiliar'],
    exact: true,
    icono: (
      <svg className={ICONO_CLASE} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4Zm9 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4ZM3 12a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Zm9 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/residentes',
    etiqueta: 'Residentes',
    roles: ['admin', 'nurse_jefe', 'medico', 'auxiliar'],
    icono: (
      <svg className={ICONO_CLASE} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 16c0-2.66 2.24-4 5-4s5 1.34 5 4v1H2v-1Zm11.5-7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM14 12c-.35 0-.69.03-1.02.09A5.6 5.6 0 0 1 15 16v1h4v-1c0-2.21-1.79-4-4-4Z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/tareas',
    etiqueta: 'Tareas de cuidado',
    roles: ['admin', 'nurse_jefe', 'medico', 'auxiliar'],
    icono: (
      <svg className={ICONO_CLASE} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/dashboard/medicacion',
    etiqueta: 'Medicación',
    roles: ['admin', 'nurse_jefe', 'medico', 'auxiliar'],
    icono: (
      <svg className={ICONO_CLASE} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M6.3 2.9a4 4 0 0 1 5.7 0l5 5a4 4 0 0 1-5.6 5.7l-5-5a4 4 0 0 1 0-5.7Zm4.3 4.3a1 1 0 0 1 1.4 0l2 2a1 1 0 1 1-1.4 1.4l-2-2a1 1 0 0 1 0-1.4Z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: '/dashboard/planes',
    etiqueta: 'Planes de cuidado',
    roles: ['admin', 'nurse_jefe', 'medico'],
    icono: (
      <svg className={ICONO_CLASE} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.4L11.6 2H4Zm6 .8v3.7a1 1 0 0 0 1 1h3.7L10 2.8ZM6 11h6v1.5H6V11Zm0 3h4v1.5H6V14Z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/auditoria',
    etiqueta: 'Auditoría',
    roles: ['admin'],
    icono: (
      <svg className={ICONO_CLASE} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 1a3 3 0 0 0-3 3v1H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V4a3 3 0 0 0-3-3Zm-1 4V4a1 1 0 1 1 2 0v1H9Zm1 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" clipRule="evenodd" />
      </svg>
    ),
  },
]

// El layout del dashboard depende de cookies de sesión: no puede prerendererse.
export const instant = false

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fuerza render en tiempo de petición (cacheComponents/PPR): el layout
  // depende de cookies de sesión por usuario.
  await connection()

  const sesion = await obtenerSesionActiva()

  if (!sesion) {
    redirect('/login')
  }

  const elementosVisibles = ELEMENTOS_NAV.filter((e) =>
    e.roles.includes(sesion.rol),
  )

  const nombreMostrar = sesion.perfil?.full_name ?? sesion.email

  return (
    <div className="flex min-h-screen">
      {/* Sidebar: fijo en escritorio, barra superior en móvil */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
            G
          </span>
          <span className="text-base font-semibold text-slate-900">GeriCare</span>
        </div>


        <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-4">
          {elementosVisibles.map((elem) => (
            <SidebarLink
              key={elem.href}
              href={elem.href}
              exact={elem.exact}
              icon={elem.icono}
            >
              {elem.etiqueta}
            </SidebarLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 px-4 py-4">
          <p className="truncate text-sm font-medium text-slate-900" title={nombreMostrar}>
            {nombreMostrar}
          </p>
          <div className="mt-1.5">
            <RolBadge rol={sesion.rol} />
          </div>
          <form action={logout} className="mt-3">
            <SubmitButton variante="secundaria" tamano="sm" className="w-full">
              Cerrar sesión
            </SubmitButton>
          </form>
        </div>
      </aside>

      {/* Contenido principal con streaming bajo PPR */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera móvil con navegación horizontal */}
        <header className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-700 text-xs font-bold text-white">
            G
          </span>
          <nav aria-label="Navegación principal (móvil)" className="flex gap-1">
            {elementosVisibles.map((elem) => (
              <SidebarLink
                key={elem.href}
                href={elem.href}
                exact={elem.exact}
              >
                {elem.etiqueta}
              </SidebarLink>
            ))}
          </nav>
          <form action={logout} className="ml-auto shrink-0">
            <SubmitButton variante="fantasma" tamano="sm">
              Salir
            </SubmitButton>
          </form>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Suspense fallback={<ContenidoCargando />}>{children}</Suspense>
        </main>
      </div>
    </div>
  )
}

/** Esqueleto mostrado mientras llegan los datos del servidor. */
function ContenidoCargando() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable filas={5} />
    </div>
  )
}
