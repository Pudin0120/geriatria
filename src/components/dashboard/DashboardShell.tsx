'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SidebarLink, Icons, type SidebarLinkDef } from '@/components/ui/SidebarLink'
import { RoleBadge } from '@/components/ui/Badge'
import { SubmitButton } from '@/components/ui/Button'
import { logout } from '@/lib/supabase/actions'
import { USER_ROLE_LABELS, type UserRole } from '@/types'
import { cn } from '@/lib/utils'

interface ShellProps {
  rol: UserRole
  nombre: string
  enlaces: SidebarLinkDef[]
  children: ReactNode
}

/** Estructura visual del panel: sidebar de escritorio + drawer móvil. */
export function DashboardShell({ rol, nombre, enlaces, children }: ShellProps) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="flex min-h-dvh bg-slate-100">
      {/* Sidebar de escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-slate-900 lg:flex">
        <Navegacion rol={rol} nombre={nombre} enlaces={enlaces} />
      </aside>

      {/* Fondo oscurecido del drawer móvil */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/60 transition-opacity lg:hidden',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setAbierto(false)}
        aria-hidden={!abierto}
      />

      {/* Drawer móvil */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900 shadow-2xl transition-transform lg:hidden',
          abierto ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navegación principal"
      >
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar menú"
        >
          <span className="block h-5 w-5">{Icons.close}</span>
        </button>
        <Navegacion
          rol={rol}
          nombre={nombre}
          enlaces={enlaces}
          onNavigate={() => setAbierto(false)}
        />
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Abrir menú"
          >
            <span className="block h-5 w-5">{Icons.menu}</span>
          </button>
          <Link href="/dashboard" className="text-base font-bold text-teal-800">
            GeriCare
          </Link>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

interface NavegacionProps {
  rol: UserRole
  nombre: string
  enlaces: SidebarLinkDef[]
  onNavigate?: () => void
}

/** Interior del sidebar: marca, enlaces por rol, usuario y cierre de sesión. */
function Navegacion({ rol, nombre, enlaces, onNavigate }: NavegacionProps) {
  const iniciales = nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
          G
        </div>
        <div>
          <p className="text-sm font-bold tracking-wide text-white">GeriCare</p>
          <p className="text-xs text-slate-400">Panel clínico</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Secciones">
        {enlaces.map((enlace) => (
          <SidebarLink
            key={enlace.href}
            href={enlace.href}
            label={enlace.label}
            icon={enlace.icon}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-teal-200">
            {iniciales || 'GC'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{nombre}</p>
            <p className="text-xs text-slate-400">{USER_ROLE_LABELS[rol]}</p>
          </div>
        </div>
        <div className="mb-3">
          <RoleBadge role={rol} />
        </div>
        <form action={logout}>
          <SubmitButton
            variant="ghost"
            size="sm"
            className="w-full text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <span className="h-4 w-4" aria-hidden="true">
              {Icons.logout}
            </span>
            Cerrar sesión
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
