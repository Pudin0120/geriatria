'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SidebarLinkDef {
  href: string
  label: string
  icon: ReactNode
}

interface SidebarLinkProps {
  href: string
  label: string
  icon: ReactNode
  onNavigate?: () => void
}

/** Enlace de navegación lateral con resaltado automático por ruta activa. */
export function SidebarLink({ href, label, icon, onNavigate }: SidebarLinkProps) {
  const pathname = usePathname()
  const activo = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        activo
          ? 'bg-teal-600/15 text-teal-300'
          : 'text-slate-300 hover:bg-white/5 hover:text-white',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-5 w-5 shrink-0', activo ? 'text-teal-400' : 'text-slate-400')}
      >
        {icon}
      </span>
      {label}
    </Link>
  )
}

/* Colección de iconos SVG ligeros para el sidebar (sin dependencias). */
export const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  residents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M16 14.6c2.9-.4 5.5 1.5 5.5 4.4" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h4M4 12h4M4 18h4" />
      <path d="m11 5 2 2 4-4" />
      <path d="m11 11 2 2 4-4" />
      <path d="m11 17 2 2 4-4" />
    </svg>
  ),
  medications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="9" width="19" height="6.5" rx="3.25" transform="rotate(-45 12 12)" />
      <path d="M8.8 8.8 15.2 15.2" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h7M9 16h7" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
      <path d="M8.5 11.5 10.5 13.5 14 9.5" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  ),
}
