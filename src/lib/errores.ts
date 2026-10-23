/**
 * GeriCare · Normalización de errores de base de datos para mensajes al usuario.
 */

const ERROR_INTERNO =
  'Ocurrió un problema al comunicarse con el servidor. Inténtalo de nuevo.'

/** Traduce errores crudos de Postgres/PostgREST a mensajes útiles en español. */
export function normalizarErrorBdPublic(mensaje: string): string {
  const t = mensaje.toLowerCase()
  if (t.includes('row-level security')) {
    return 'No tienes permiso para realizar esta operación (RLS).'
  }
  if (t.includes('foreign key')) {
    return 'El registro referenciado no existe o fue eliminado.'
  }
  if (t.includes('check constraint')) {
    return 'Algún valor supera los rangos permitidos por la base de datos.'
  }
  if (t.includes('duplicate key')) {
    return 'Ya existe un registro con esos mismos datos.'
  }
  return mensaje || ERROR_INTERNO
}
