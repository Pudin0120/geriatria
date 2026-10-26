import { LoginForm } from './login-form'

/**
 * Contenedor de autenticación para la página pública.
 *
 * Nota de seguridad (sistema clínico): el auto-registro público fue RETIRADO
 * a propósito — cualquier persona podría crearse una cuenta con rol 'auxiliar'
 * y, bajo la RLS actual, leer PHI completa. El alta de personal se realiza
 * exclusivamente por un administrador desde Supabase Dashboard (Authentication
 * → Users → "Add user") o vía SQL, conservando el trigger `handle_new_user`
 * que crea el perfil automáticamente.
 */
export function AuthTabs() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-bold text-white">
          G
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          GeriCare
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cuidado geriátrico integral, en un solo lugar.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Acceso exclusivo para personal autorizado. ¿Necesitas una cuenta?
          Contacta a la dirección del centro.
        </p>
      </div>

      <LoginForm />
    </div>
  )
}
