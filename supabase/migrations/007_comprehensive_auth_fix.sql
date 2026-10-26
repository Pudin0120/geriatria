-- ============================================================================
-- Migración 007 · Corrección integral de autenticación y permisos (GeriCare)
-- Supabase Auth v2.197 / PostgreSQL 17 · Idempotente (ejecutable N veces)
--
-- Resuelve de una vez los síntomas reproducibles:
--   [H1] Semillas sin fila en auth.identities  -> "Invalid login credentials"
--        aunque el bcrypt de auth.users sea correcto (Auth v2 resuelve el
--        signInWithPassword a través de identities).
--   [H2] email_confirmed_at NULL con "Confirm email" ACTIVO -> GoTrue rechaza.
--   [H3] email NULL en semillas (si alguna inserción quedó coja): se repara
--        desde raw_user_meta_data->>'email' ANTES de crear identidades.
--   [H4] Error Postgres 42501 ("permission denied for table residents,
--        care_tasks, medications") = falta GRANT ACL al rol 'authenticated'.
--        NO es RLS: RLS sin política devuelve 0 filas, no 42501.
--   [extra] Reset del hash bcrypt de las semillas por si quedó corrupto tras
--        intentos manuales previos.
--
-- NOTA DE DISEÑO: esta migración es SUPERSET de la 006 (identities + grants).
-- Si ya ejecutaste la 006, volver a ejecutar todo aquí es inocuo (todo está
-- guardado por NOT EXISTS / COALESCE / on conflict do nothing).
-- ----------------------------------------------------------------------------
-- DIAGNÓSTICO PREVIO OPCIONAL (SQL Editor) — ejecútalas si algo fallara:
--
-- (D1) ¿Qué permisos ACL tienen las tablas clave? Debe aparecer 'authenticated'
--      con SELECT/INSERT/UPDATE/DELETE; si falta, eso explica el 42501:
-- select table_name, grantee, privilege_type
-- from information_schema.table_privileges
-- where table_schema = 'public'
--   and table_name in ('residents','care_tasks','medications','profiles','access_logs');
--
-- (D2) ¿Las semillas tienen email, confirmación e identity de email?
-- select u.id, u.email,
--        (u.email_confirmed_at is not null) as confirmado,
--        exists(select 1 from auth.identities i
--               where i.user_id = u.id and i.provider = 'email') as tiene_identity
-- from auth.users u
-- where u.email like '%@gericare.test'
--    or u.raw_user_meta_data->>'email' like '%@gericare.test';
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- BLOQUE 1 · [H3] Repara emails NULL en las semillas (los insertó la 001 con
-- email explícito, pero si algún intento manual dejó la columna vacía, se
-- recupera del metadata antes de construir identidades/confirmaciones).
-- ----------------------------------------------------------------------------
update auth.users
set email = raw_user_meta_data ->> 'email'
where email is null
  and raw_user_meta_data ->> 'email' in (
    'admin@gericare.test',
    'jefe@gericare.test',
    'auxiliar@gericare.test',
    'medico@gericare.test'
  );

-- ----------------------------------------------------------------------------
-- BLOQUE 2 · [H1] Identidades de email para las 4 cuentas semilla.
-- Sin esta fila, Supabase Auth v2 no puede resolver signInWithPassword.
-- Se usa la forma portable (user_id + provider_id) compatible con la
-- estructura actual de auth.identities (identity_id es generada por el sistema).
-- ----------------------------------------------------------------------------
insert into auth.identities (
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.email,                                   -- provider_id = email (provider 'email')
  'email',
  jsonb_build_object(
    'sub',            u.id::text,
    'email',          u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  now(),
  now(),
  now()
from auth.users u
where u.email in (
  'admin@gericare.test',
  'jefe@gericare.test',
  'auxiliar@gericare.test',
  'medico@gericare.test'
)
and not exists (
  select 1 from auth.identities i
  where i.user_id = u.id and i.provider = 'email'
);

-- ----------------------------------------------------------------------------
-- BLOQUE 3 · [H2] Confirmación de correo de las semillas.
-- Con "Confirm email" ACTIVO en el Dashboard, un email_confirmed_at NULL
-- bloquea el login aunque el hash sea válido. Las semillas son cuentas
-- internas del centro: se confirman explícitamente (mismo criterio que 005).
-- ----------------------------------------------------------------------------
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmation_token = '',
  confirmation_sent_at = null,
  recovery_token = null
where email in (
  'admin@gericare.test',
  'jefe@gericare.test',
  'auxiliar@gericare.test',
  'medico@gericare.test'
);

-- ----------------------------------------------------------------------------
-- BLOQUE 4 · [H4] GRANTs ACL sobre public (error 42501).
-- SEGURIDAD: RLS permanece ACTIVADO everywhere — los GRANTs solo abren la
-- puerta del objeto; qué filas ve cada usuario lo decide RLS intacto.
-- A 'anon' SOLO se le da USAGE de schema (nunca lectura/escritura de datos).
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role, anon;

grant all privileges on all tables    in schema public to authenticated, service_role;
grant all privileges on all sequences in schema public to authenticated, service_role;
grant execute         on all functions in schema public to authenticated, service_role;

alter default privileges in schema public
  grant all privileges on tables    to authenticated, service_role;
alter default privileges in schema public
  grant all privileges on sequences to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- BLOQUE 5 · Perfiles garantizados con los roles correctos (por si el trigger
-- handle_new_user no llegó a ejecutarse en alguna semilla).
-- ----------------------------------------------------------------------------
insert into public.profiles (id, full_name, email, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  u.email,
  'auxiliar'
from auth.users u
where u.email in (
  'admin@gericare.test',
  'jefe@gericare.test',
  'auxiliar@gericare.test',
  'medico@gericare.test'
)
on conflict (id) do nothing;

update public.profiles set role = 'admin'
 where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'nurse_jefe'
 where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set role = 'auxiliar'
 where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set role = 'medico'
 where id = '00000000-0000-4000-8000-000000000004';

-- ----------------------------------------------------------------------------
-- BLOQUE 6 · Reset del hash bcrypt de las semillas (cubre contraseñas
-- corruptas por ediciones manuales previas). Deja las 4 cuentas operativas
-- con la contraseña estándar de demostración.
-- AVISO: este bloque escribe la contraseña de DEMO en texto plano dentro de
-- la sentencia SQL; es aceptable SOLO para cuentas .test de un entorno de
-- desarrollo. En producción, elimina este bloque y gestiona accesos reales.
-- ----------------------------------------------------------------------------
update auth.users
set encrypted_password = crypt('GeriCare#Seed2026', gen_salt('bf'))
where email in (
  'admin@gericare.test',
  'jefe@gericare.test',
  'auxiliar@gericare.test',
  'medico@gericare.test'
);

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN POST-EJECUCIÓN (opcional, al final del SQL Editor):
-- select u.email,
--        (u.email_confirmed_at is not null)              as confirmado,
--        (u.encrypted_password like '$2a$%')             as hash_bcrypt_ok,
--        exists(select 1 from auth.identities i
--               where i.user_id = u.id
--                 and i.provider = 'email')              as tiene_identity
-- from auth.users u
-- where u.email like '%@gericare.test';
-- -- Las 4 filas deben salir: confirmado=t · hash_bcrypt_ok=t · tiene_identity=t
-- ----------------------------------------------------------------------------
