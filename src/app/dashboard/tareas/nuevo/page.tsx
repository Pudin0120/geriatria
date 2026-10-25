import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obtenerSesionActiva } from '@/lib/supabase/session'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { TaskForm, type OpcionesTarea, type ResidenteOpcion, type AuxiliarOpcion } from './task-form'
import type { ProfileRow, ResidentRow } from '@/types'

export const metadata = {
  title: 'Nueva tarea',
  description: 'Planifica y asigna una tarea con recurrencia a un residente.',
}

/** Depende de la sesión (cookies): se resuelve en cada petición. */
export const instant = false

const ROLES_PERMITIDOS: readonly string[] = ['admin', 'nurse_jefe', 'medico']

/**
 * Página «Nueva tarea» (Fase 6): Server Component que carga en paralelo el
 * censo de residentes activos y el personal asignable (auxiliares y enfermera
 * jefe), y pasa las opciones serializadas al formulario cliente. La mutación
 * ocurre exclusivamente en `createTaskWithRecurrence` (Server Action).
 */
export default async function NuevaTareaPage() {
  await connection()

  const sesion = await obtenerSesionActiva()
  if (!sesion) redirect('/login')
  if (!ROLES_PERMITIDOS.includes(sesion.rol)) {
    // Sin permiso explícito, devolvemos a la agenda (la acción también lo bloquea).
    redirect('/dashboard/tareas')
  }

  const supabase = await createClient()

  const [{ data: residentesRaw, error: errResidentes }, { data: perfilesRaw, error: errPerfiles }] =
    await Promise.all([
      supabase
        .from('residents')
        .select('id, first_name, last_name, room_number, status')
        .eq('status', 'activo')
        .order('first_name', { ascending: true })
        .limit(500),
      supabase
        .from('profiles')
        .select('id, full_name, role, active')
        .in('role', ['auxiliar', 'nurse_jefe'])
        .eq('active', true)
        .order('full_name', { ascending: true })
        .limit(200),
    ])

  const errorConsulta = errResidentes ?? errPerfiles
  if (errorConsulta) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <nav aria-label="Migas de navegación">
          <Link href="/dashboard/tareas" className="text-sm text-slate-500 hover:text-teal-700 hover:underline">
            ← Volver a la agenda
          </Link>
        </nav>
        <Card>
          <CardHeader title="No se pudieron cargar los datos" subtitle="Revisa tu conexión e inténtalo de nuevo." />
          <CardContent>
            <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
              Error al consultar el censo o el personal: {errorConsulta.message}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const residentes: ResidenteOpcion[] = (residentesRaw ?? []).map((r) => {
    const fila = r as Pick<ResidentRow, 'id' | 'first_name' | 'last_name' | 'room_number'>
    return {
      id: fila.id,
      nombre: `${fila.first_name} ${fila.last_name}`.trim(),
      habitacion: fila.room_number,
    }
  })

  const auxiliares: AuxiliarOpcion[] = (perfilesRaw ?? []).map((p) => {
    const fila = p as Pick<ProfileRow, 'id' | 'full_name' | 'role'>
    return {
      id: fila.id,
      nombre: fila.full_name.length > 0 ? fila.full_name : 'Sin nombre',
      rol: fila.role === 'nurse_jefe' ? 'Enfermera jefe' : 'Auxiliar',
    }
  })

  const opciones: OpcionesTarea = { residentes, auxiliares }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav aria-label="Migas de navegación">
        <ol className="flex items-center gap-2 text-sm text-slate-500">
          <li>
            <Link href="/dashboard/tareas" className="hover:text-teal-700 hover:underline">
              Tareas del día
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li className="font-medium text-slate-800">Nueva tarea</li>
        </ol>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Planificar y asignar tarea</h1>
        <p className="mt-1 text-sm text-slate-500">
          Crea una tarea puntual o una serie recurrente para los próximos 30 días. Las instancias se
          generan físicamente para que la agenda diaria y el móvil del auxiliar las muestren ya sincronizadas.
        </p>
      </header>

      <TaskForm opciones={opciones} />
    </div>
  )
}
