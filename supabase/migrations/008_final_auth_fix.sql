-- ============================================================================
-- Migración 008 · Corrección forense DEFINITIVA de autenticación (GeriCare)
-- ----------------------------------------------------------------------------
-- Consolida e idempotentiza las correcciones de H1-H4 tras la auditoría:
--   H1: semillas sin fila en auth.identities -> GoTrue v2 rechaza login.
--   H2: email_confirmed_at NULL con "Confirm email" activo -> login bloqueado.
--   H3: email NULL en auth.users (sembradas solo vía raw_user_meta_data).
--   H4: falta GRANT ACL al rol 'authenticated' sobre tablas públicas (42501).
-- Este script es 100% idempotente: puede ejecutarse varias veces sin efectos
-- secundarios y no desactiva RLS ni altera políticas existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DIAGNÓSTICO PREVIO OPCIONAL (ejecutar primero en SQL Editor si algo fallara)
-- ----------------------------------------------------------------------------
-- D1: ¿Las semillas tienen email, confirmación e identidad?
--   select u.id, u.email, (u.email_confirmed_at is not null) as confirmado,
--          exists(select 1 from auth.identities i
--                 where i.user_id = u.id and i.provider = 'email') as tiene_identity
--   from auth.users u
--   where u.email in ('admin@gericare.test','jefe@gericare.test',
--                     'auxiliar@gericare.test','medico@gericare.test');
--
-- D2: ¿Qué permisos ACL tiene el rol authenticated?
--   select table_name, grantee, privilege_type
--   from information_schema.table_privileges
--   where table_schema = 'public'
--     and table_name in ('residents','care_tasks','medications','profiles','access_logs')
--     and grantee = 'authenticated';

-- ----------------------------------------------------------------------------
-- BLOQUE 1 · H3 — Reparación defensiva del campo email (si quedó NULL y el
-- correo solo vive en raw_user_meta_data). Sin-op si ya está correcto.
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
-- BLOQUE 2 · H1 — Crear identidades 'email' para las 4 semillas.
-- Supabase Auth v2.197 resuelve signInWithPassword a través de auth.identities;
-- sin esta fila GoTrue responde "Invalid login credentials" aunque el bcrypt
-- sea válido. `where not exists` garantiza idempotencia.
-- ----------------------------------------------------------------------------
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  u.id,
  u.id,
  u.email,
  'email',
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
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
-- BLOQUE 3 · H2 — Confirmar los correos semilla y limpiar tokens pendientes.
-- Con "Confirm email" ACTIVO en el proveedor, GoTrue rechaza el login si
-- email_confirmed_at es NULL. coalesce() preserva una confirmación previa.
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
-- BLOQUE 4 · H4 — GRANTs ACL del rol 'authenticated' sobre public.
-- El error Postgres 42501 ("permission denied for table ...") es de privilegios
-- de objeto, NO de RLS (RLS sin política devuelve 0 filas, nunca 42501).
-- Nota: RLS sigue ACTIVO en todas las tablas; estos grants solo abren la puerta
-- que después las políticas filtran. A `anon` se le da SOLO usage de schema,
-- jamás escritura sobre datos clínicos (PHI).
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role, anon;

grant all privileges on all tables    in schema public to authenticated, service_role;
grant all privileges on all sequences in schema public to authenticated, service_role;
grant execute       on all functions  in schema public to authenticated, service_role;

-- Herencia para objetos creados en el futuro por estas cuentas:
alter default privileges in schema public grant all privileges on tables   to authenticated, service_role;
alter default privileges in schema public grant all privileges on sequences to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- BLOQUE 5 — Perfiles garantizados con los roles correctos.
-- Si el trigger handle_new_user no se disparó para las semillas, se inserta
-- el perfil ahora (on conflict do nothing = idempotente) y se fijan los roles.
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

update public.profiles set role = 'admin'      where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'nurse_jefe' where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set role = 'auxiliar'   where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set role = 'medico'     where id = '00000000-0000-4000-8000-000000000004';

-- ----------------------------------------------------------------------------
-- BLOQUE 6 — Re-hash determinista de contraseñas semilla.
-- Garantiza que las 4 cuentas respondan exactamente a GeriCare#Seed2026 aunque
-- el hash original quedara corrupto o difiriera entre entornos. crypt()/bf es
-- el mismo algoritmo que usa GoTrue internamente.
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
-- VERIFICACIÓN POST-EJECUCIÓN (descomentar tras aplicar; debe devolver 4 filas
-- con confirmado=t, tiene_identity=t y password_hash_ok=t):
-- ----------------------------------------------------------------------------
-- select u.email,
--        (u.email_confirmed_at is not null) as confirmado,
--        exists(select 1 from auth.identities i
--               where i.user_id = u.id and i.provider = 'email') as tiene_identity,
--        u.encrypted_password = crypt('GeriCare#Seed2026', u.encrypted_password) as password_hash_ok
-- from auth.users u
-- where u.email in ('admin@gericare.test','jefe@gericare.test',
--                   'auxiliar@gericare.test','medico@gericare.test');
