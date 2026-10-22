import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { Icons, type SidebarLinkDef } from '@/components/ui/SidebarLink'
import { SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton'
import type { UserRole } from '@/types'

/** Enlaces del sidebar filtrados por rol (RLS ya protege los datos reales). */
function enlacesPorRol(rol: UserRole): SidebarLinkDef[] {
  const comunes: SidebarLinkDef[] = [
    { href: '/dashboard', label: 'Resumen', icon: Icons.dashboard },
    { href: '/dashboard/residentes', label: 'Residentes', icon: Icons.residents },
    { href: '/dashboard/tareas', label: 'Tareas de cuidado', icon: Icons.tasks },
    { href: '/dashboard/medicacion', label: 'Medicación', icon: Icons.medications },
  ]

  const clinicos: SidebarLinkDef[] = [
    { href: '/dashboard/planes', label: 'Planes de cuidado', icon: Icons.plans },
  ]

  const administrativos: SidebarLinkDef[] = [
    { href: '/dashboard/auditoria', label: 'Auditoría', icon: Icons.audit },
  ]

  switch (rol) {
    case 'admin':
      return [...comunes, ...clinicos, ...administrativos]
    case 'nurse_jefe':
    case 'medico':
      return [...comunes, ...clinicos]
    case 'auxiliar':
      return comunes
  }
}

export default async function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  // Con cacheComponents activo, este layout es un límite dinámico:
  // la sesión se resuelve en cada petición y el contenido de la página
  // (children) se transmite bajo <Suspense> para cumplir cacheComponents/PPR.

  return (
    <Suspense fallback={<ContenidoCargando />}>
      <ShellDashboard>{children}</ShellDashboard>
    </Suspense>
  )
}

/** Envoltorio con sidebar que lee la sesión (cookies + BD) en runtime. */
async function ShellDashboard({ children }: { children: ReactNode }) {
  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')

  const nombre = sesion.perfil?.full_name ?? 'Personal GeriCare'

  return (
    <DashboardShell rol={sesion.rol} nombre={nombre} enlaces={enlacesPorRol(sesion.rol)}>
      {children}
    </DashboardShell>
  )
}

/** Esqueleto mostrado mientras el contenido dinámico se resuelve en streaming. */
function ContenidoCargando() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando contenido">
      <SkeletonStats cantidad={4} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SkeletonTable filas={5} />
        <SkeletonTable filas={4} />
      </div>
    </div>
  )
}
