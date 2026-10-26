import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { getClinicalAlerts } from '@/lib/supabase/actions'
import type { AlertSummary } from '@/lib/reportes'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { Icons, type SidebarLinkDef } from '@/components/ui/SidebarLink'
import { SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton'
import type { UserRole } from '@/types'

/** Enlaces del sidebar filtrados por rol (RLS ya protege los datos reales). */
function enlacesPorRol(rol: UserRole): SidebarLinkDef[] {
  const comunes: SidebarLinkDef[] = [
    { href: '/dashboard', label: 'Resumen', icon: Icons.dashboard },
    { href: '/dashboard/residentes', label: 'Residentes', icon: Icons.residents },
    // «Tareas del Día»: accesible para todos los roles clínicos (Fase 4).
    { href: '/dashboard/tareas', label: 'Tareas del día', icon: Icons.tasks },
  ]

  if (rol === 'familiar') return [{ href: '/dashboard', label: 'Resumen', icon: Icons.dashboard }]

  // «Administración de Medicamentos» (DURO): enfermería, auxiliares y admin.
  const administracionMedicacion: SidebarLinkDef[] = [
    { href: '/dashboard/medicaciones/administrar', label: 'Administrar medicamentos', icon: Icons.medications },
  ]

  const clinicos: SidebarLinkDef[] = [
    // Los planes y medicaciones por residente se gestionan desde su ficha;
    // este acceso directo lleva a la agenda global como punto de partida.
    { href: '/dashboard/residentes?ver=planes', label: 'Planes de cuidado', icon: Icons.plans },
    // Reportes y analíticas del centro (Fase 5): accesible para roles clínicos.
    { href: '/dashboard/reportes', label: 'Reportes', icon: Icons.dashboard },
  ]

  const administrativos: SidebarLinkDef[] = [
    { href: '/dashboard/auditoria', label: 'Auditoría', icon: Icons.audit },
  ]

  switch (rol) {
    case 'admin':
      return [...comunes, ...administracionMedicacion, ...clinicos, ...administrativos]
    case 'nurse_jefe':
    case 'enfermeria':
      return [...comunes, ...administracionMedicacion, ...clinicos]
    case 'medico':
      return [...comunes, ...clinicos]
    case 'auxiliar':
      return [...comunes, ...administracionMedicacion]
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
      {/* AlertBanner: alertas clínicas del turno (Fase 5), visibles para
          todos los roles y calculadas en servidor al cargar la página. */}
      {sesion.rol === 'familiar' ? null : <AlertasTurno />}
      {children}
    </DashboardShell>
  )
}

/** Envoltorio de servidor para las alertas: se resuelve con streaming bajo Suspense. */
async function AlertasTurno() {
  let resumen: AlertSummary | null = null
  try {
    resumen = await getClinicalAlerts()
  } catch {
    // Sin alertas disponibles: el banner simplemente no se muestra.
  }
  if (!resumen || resumen.alerts.length === 0) return null
  return <AlertBanner resumen={resumen} />
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
