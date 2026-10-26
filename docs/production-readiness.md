# GeriCare: preparación de staging y despliegue

Estado de esta revisión: 2026-10-26. Este procedimiento no aplica migraciones ni cambia producción.

## Estado del checkout

- Rama de cierre local: `release/gericare-final-20261026`, con el trabajo local preservado e `origin/main` integrado. La rama original `dev` se conserva sin reescribir.
- `origin/dev` y `origin/main` conservan historiales de commit distintos, pero el diff de sus árboles de archivos está vacío. La migración 008 sigue siendo sensible porque puede restablecer credenciales demo.
- La rama contiene 001–010; 005–008 vienen de la historia remota integrada y 009–010 forman parte del cambio de cierre. El manifiesto registra sus hashes.
- Se creó una copia local fuera de Git en `/home/joseff/geriatria-backups/GeriCare-pre-release-20261026.tar.gz` y un bundle Git verificable en `/home/joseff/geriatria-backups/geriatria-pre-main.bundle`.
- GitHub reconoce la sesión para el repositorio público. El despliegue del frontend no está configurado en este checkout: no hay CLI de Vercel ni workflow de publicación.
- El CLI enumera el proyecto autorizado, pero la consulta de migraciones no terminó ni devolvió historial. No hay evidencia actual de qué migraciones están aplicadas ni de una restauración verificada.
- No se detectaron Docker, Podman ni `psql`. Las pruebas locales usan PGlite 0.5.12 (PostgreSQL WASM 18.6) y un stub de Auth. No son staging ni sustituyen al PostgreSQL 17 / Auth administrado de Supabase.
- La salida de `supabase db dump --dry-run` incluyó una contraseña generada para el rol interno temporal `cli_login_postgres`. No se conserva en el repositorio ni se repetirá. La preparación de ese rol pudo crear/actualizar su acceso, aunque no se ejecutó `pg_dump` ni se cambiaron tablas o migraciones. El propietario debe revisar e invalidar ese acceso antes de cualquier conexión posterior; las credenciales del rol CLI tienen incidencias documentadas por Supabase.

## Riesgos de migración conocidos

1. Las migraciones remotas 006–008 otorgan amplios privilegios a `authenticated` sobre tablas, secuencias y funciones. 009–010 deben aplicarse después de la cadena real que se haya validado. 010 ahora revoca los grants amplios y concede una lista explícita de RPCs; las pruebas locales simulan los grants de 006–008 antes de comprobar la limpieza.
2. La migración 008 repara, elimina o recrea cuentas `@gericare.test` y fija una contraseña demo compartida. No se debe ejecutar en producción sin una auditoría de cada Auth user, identity, perfil, MFA, sesión y uso de esas cuentas.
3. 005–008 ahora se ejecutan en la prueba PGlite con tablas Auth sintéticas; 008 modifica solo los usuarios demo sintéticos de esa base efímera. La prueba excluye el bloque seed de 001 y no reproduce las restricciones, triggers ni versión exacta de Supabase Auth. La cadena no se ha validado en PostgreSQL 17 ni en staging.
4. La tabla `resident_user_access` y sus datos de producción no se han inspeccionado. 010 convierte el acceso histórico de médicos creadores en vínculos revocables y crea un vínculo al registrar nuevos residentes; la actualización histórica debe comprobarse con datos de staging.

## Procedimiento de staging

### A. Crear una base aislada

1. En Supabase, abre el proyecto de producción y ve a **Database → Backups**. Comprueba el plan, la fecha del backup y el punto de recuperación disponible. Un backup descargable o visible no demuestra por sí solo que se puede restaurar.
2. Para probar una restauración, usa **Restore to a New Project** con autorización organizacional para manejar una copia completa de datos clínicos. Esta función copia base de datos y Auth users; no copia Storage ni ajustes de Auth/API. Las extensiones y trabajos externos requieren revisión antes de ejecutar el clon. Si esa autorización no existe, crea un proyecto staging vacío y utiliza datos sintéticos.
3. No descargues ni exportes datos clínicos a una máquina o proyecto no autorizado. Si el staging usa una copia autorizada, aplica las reglas internas de acceso, retención y eliminación de datos.
4. Guarda la referencia de staging de forma privada. No la pegues en el chat ni la registres en Git.

Supabase explica los backups diarios y límites por plan en [Database Backups](https://supabase.com/docs/guides/platform/backups), y los elementos incluidos/excluidos al clonar en [Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project).

### B. Reconciliar antes de aplicar SQL

1. Inspecciona el historial de migraciones y el esquema del staging restaurado; compara ambos con cada archivo local y remoto. No deduzcas el estado de una migración por la presencia de objetos parecidos.
2. Determina si 001–008 ya se aplicaron, si se ejecutaron manualmente o si el historial `supabase_migrations.schema_migrations` está incompleto. Mantén un inventario de políticas RLS, grants, funciones, triggers, roles y cuentas semilla.
3. Revisa cada efecto de 005–008 con un staging vacío de usuarios sintéticos. 006–008 dan grants amplios y 007–008 restablecen la contraseña compartida de las semillas; 008 además depura o crea cuentas demo. No las ejecutes en producción. No uses `migration repair` para ocultar discrepancias ni continúes con 009–010 hasta tener una secuencia aprobada y repetible.
4. Vincula el CLI únicamente al proyecto staging mediante su referencia privada. Ejecuta `supabase migration list --linked` y revisa `supabase db push --dry-run` solo contra staging. El `--dry-run` muestra el plan, pero no prueba que el SQL vaya a funcionar.
5. Aplica una migración por vez en staging. Después de cada una, verifica esquema, historial, RLS, ACL, datos semilla y logs. Repite desde una base vacía y desde una copia que represente la versión anterior.

Supabase documenta la reconciliación de historial y el flujo de migraciones en [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) y el comportamiento de `db push --dry-run` en la [referencia CLI](https://supabase.com/docs/reference/cli/supabase-db-push).

### C. Auth, cuentas y roles

1. En el proyecto objetivo, revisa **Authentication → Settings** y deshabilita **Allow new users to sign up** si el acceso debe ser solo por invitación. El formulario local ya no ofrece alta pública, pero la configuración remota se administra por separado.
2. Configura **Site URL** y las **Redirect URLs** para los dominios locales, staging y producción aprobados. Incluye la ruta de callback y actualización de contraseña de esta aplicación. No uses comodines amplios en producción.
3. Invita usuarios desde **Authentication → Users → Add user → Send invitation**. Verifica primero si ya existe el email; no crees duplicados.
4. Después de aceptar la invitación, verifica que exista un único profile activo con el rol aprobado. Un administrador debe asignar residentes explícitamente. No inventes vínculos familiares. No actives el alta pública para sustituir invitaciones.
5. No uses `sb_secret_*`, service-role keys, JWT secrets ni tokens administrativos en el navegador, `.env` versionados, logs o chat. Mantén solo la publishable/anon key en variables `NEXT_PUBLIC_*`; los secretos de servidor van en el almacén privado del host.

Supabase detalla el control de alta en [General Configuration](https://supabase.com/docs/guides/auth/general-configuration) y las invitaciones manuales en [Managing User Data](https://supabase.com/docs/guides/auth/users).

### D. Aceptación por rol

En staging, con al menos dos residentes ficticios, prueba y registra lecturas, escrituras permitidas y denegadas, RPC directas, llamadas sin sesión y cambios de vínculo:

| Rol | Verificación mínima |
|---|---|
| Administrador | Puede gestionar roles y vínculos; accesos a residentes y datos clínicos; intentos anónimos denegados. |
| Jefe de enfermería | Supervisión clínica global según la configuración actual; no puede cambiar roles ni administrar vínculos como si fuera admin. |
| Médico | Solo residentes vinculados; crear residente genera un vínculo revocable; al quitar vínculo pierde el acceso. |
| Enfermería | Solo residentes vinculados; puede ejecutar tareas y registrar administraciones según la política actual. |
| Auxiliar | Solo datos de residentes vinculados y tareas asignadas; administración de medicamentos denegada. |
| Familiar | Solo resumen de residente(s) vinculado(s); sin lectura clínica directa ni escrituras. |

Completa la matriz con VGI, tareas, medicamentos, administraciones, planes y perfiles. Verifica con consultas/RPC autenticadas como cada rol, no solo con la visibilidad de los menús.

### E. Despliegue, solo tras autorización final

1. Confirma backup y restauración de staging; registra propietario, hora, alcance y resultado.
2. Congela la lista exacta de migraciones probadas y su checksum. Revisa el plan de migración contra producción sin aplicar cambios. No ejecutes `db push`, `migration repair` ni 008 en producción como parte de esta fase.
3. Despliega primero la base únicamente cuando se apruebe el plan, luego la aplicación con variables privadas correctas y finalmente ejecuta pruebas de humo por rol.
4. Verifica acceso anónimo bloqueado, login/invitación/reset, aislamiento entre residentes, ejecución de tarea, administración de medicamento, auditoría y errores de aplicación.
5. La reversión de esquema debe ser un plan de avance compatible, no asumir que restaurar backups de base también recupera objetos Storage. Conserva el despliegue anterior disponible para revertir la aplicación.

### F. Orden reproducible y puerta de despliegue

1. Congela el checkout y ejecuta `sha256sum -c docs/migration-manifest.sha256`. El orden en el manifiesto es 001, 002, 003, 004, 005, 006, 007, 008, 009, 010.
2. Compara la salida de `supabase migration list` contra ese inventario y el esquema inspeccionado. Si una versión ya figura aplicada, no la vuelvas a ejecutar. Si el historial no coincide con el esquema, detente: no uses `migration repair`.
3. En una base vacía de staging con Auth sintético, aplica una migración por vez en ese orden y registra resultado, versión PostgreSQL, checksum y consultas de verificación. La validación PGlite actual sirve como prueba automatizada rápida, no como evidencia de equivalencia con Supabase.
4. **No apliques 008 en producción.** En staging, 006–008 conceden grants amplios; 007–008 reemplazan las contraseñas semilla por una contraseña compartida, y 008 elimina filas no canónicas con email `@gericare.test` y crea semillas si faltan. Antes de producción hace falta una reconciliación del historial real y una versión de migración segura que no modifique cuentas reales ni introduzca credenciales compartidas. Conserva los archivos históricos sin reescribirlos si ya se aplicaron en algún ambiente.
5. Antes de producción, obtiene un respaldo lógico verificable en almacenamiento local autorizado, comprueba que schema y datos sean legibles, crea staging restaurable y realiza un ensayo de recuperación. `supabase db dump` por defecto genera esquema sin datos ni roles; datos/roles requieren dumps adicionales y el CLI excluye esquemas administrados como Auth/Storage. Por tanto, documenta qué cubre cada archivo y conserva aparte el backup/restauración de plataforma de Supabase.
6. Durante la ventana aprobada, despliega la aplicación compatible primero o en el orden acordado con las migraciones probadas. Ejecuta humo por rol. Ante un fallo, revierte el binario de la aplicación y restaura el respaldo en un proyecto nuevo; no supongas que las migraciones tienen rollback automático.

La lista de checksums se verifica desde la raíz del repo con `sha256sum -c docs/migration-manifest.sha256`. La copia lógica debe quedar fuera de Git con permisos privados; antes de crearla, valida `git check-ignore <ruta>` y usa almacenamiento autorizado para datos clínicos.

## Qué está probado ahora

- `npm test`: PGlite aislado carga 001–010 en orden con Auth simulado; omite el bloque demo de 001 y modela los grants históricos antes de 010. Las pruebas cubren separación de residentes, familiar, RPCs, ACL, vínculos revocables, ejecución de tareas con evidencia, roles, recurrencia, redirecciones y variables Next públicas.
- `npm run lint`, TypeScript, `npm run build` y `npm audit --audit-level=high` pasan en el checkout local en esta revisión.
- No se probaron Supabase Auth real, la configuración del proyecto remoto, las seis cuentas ni los permisos en staging/producción. La exportación lógica sigue pendiente.
