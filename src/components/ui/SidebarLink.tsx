'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SidebarLinkProps {
  href: string
  children: ReactNode
  icon?: ReactNode
  exact?: boolean
}

/** Enlace de navegación lateral que resalta la ruta activa. */
export function SidebarLink({ href, children, icon, exact = false }: SidebarLinkProps) {
  const pathname = usePathname()
  const activo = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        activo
          ? 'bg-blue-50 text-blue-800'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {icon ? (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </Link>
  )
}
