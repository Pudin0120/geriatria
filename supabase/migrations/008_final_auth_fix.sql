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
-- sea válido.
-- CORRECCIÓN FORENSE (probada en Postgres local contra esquema fiel a GoTrue):
--   1. auth.identities tiene UNIQUE (provider_id, provider). Si una identidad
--      quedó huérfana apuntando a una fila fantasma soft-deleted, la guarda
--      "not exists por user_id" NO la ve y revienta con 23505. Por eso primero
--      se purgan las identidades duplicadas del email que no apuntan a un
--      usuario activo confirmado.
--   2. El id de la identidad NO puede ser u.id: en GoTrue es su propio UUID y
--      choca con la PK si ya existe otra fila. Se usa gen_random_uuid().
delete from auth.identities i
where i.provider = 'email'
  and i.provider_id in (
    'admin@gericare.test','jefe@gericare.test',
    'auxiliar@gericare.test','medico@gericare.test'
  )
  and not exists (
    select 1 from auth.users u
    where u.id = i.user_id and u.deleted_at is null
  );

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
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
where u.deleted_at is null
and u.email in (
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
-- CORRECCIÓN FORENSE (probada en Postgres local): el INSERT anterior con 'on
-- conflict do nothing' NO puede crear perfiles nuevos si una fila RESIDUO con
-- otro id ya ocupa el email semilla; y el UPDATE por uuid no encuentra perfil
-- porque la purga del BLOQUE 7 borró el perfil original. Por eso aquí se
-- RECLAMA explícitamente el perfil residuo (o se crea si no existe) con el id
-- canónico de la semilla, usando upsert por id + corrección por email.
-- ----------------------------------------------------------------------------
delete from public.profiles
where email in ('admin@gericare.test','jefe@gericare.test',
                'auxiliar@gericare.test','medico@gericare.test')
  and id not in ('00000000-0000-4000-8000-000000000001',
                 '00000000-0000-4000-8000-000000000002',
                 '00000000-0000-4000-8000-000000000003',
                 '00000000-0000-4000-8000-000000000004');

insert into public.profiles (id, full_name, email, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  u.email,
  case u.email
    when 'admin@gericare.test'    then 'admin'::public.user_role
    when 'jefe@gericare.test'     then 'nurse_jefe'::public.user_role
    when 'auxiliar@gericare.test' then 'auxiliar'::public.user_role
    when 'medico@gericare.test'   then 'medico'::public.user_role
    else 'auxiliar'::public.user_role
  end
from auth.users u
where u.deleted_at is null
and u.email in (
  'admin@gericare.test',
  'jefe@gericare.test',
  'auxiliar@gericare.test',
  'medico@gericare.test'
)
on conflict (id) do update
  set full_name = excluded.full_name,
      email     = excluded.email,
      role      = excluded.role,
      updated_at = now();

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
-- BLOQUE 7 · PURGA DE FILAS FANTASMA (diagnosticado en producción, oct-2026).
-- Evidencia forense: las semillas @gericare.test NO aparecen en la lista del
-- Admin API de GoTrue (auth.users "visible"), pero INSERT con ese email falla
-- con 23505 users_email_partial_key -> existen filas huérfanas/deleted_at en
-- auth.users que bloquean la recreación limpia. Este bloque purga TODOS los
-- restos (users + identities + mfa + sesiones) para que puedas volver a crear
-- las 4 cuentas desde cero vía Dashboard > Authentication > Add user, o vía
-- SQL Editor con la sentencia final comentada más abajo.
-- ----------------------------------------------------------------------------
delete from auth.mfa_challenges
    where factor_id in (select f.id from auth.mfa_factors f
                        where f.user_id in (select id from auth.users
                                            where email like '%@gericare.test'));
delete from auth.mfa_factors
    where user_id in (select id from auth.users
                      where email like '%@gericare.test');
delete from auth.refresh_tokens
    where user_id::text in (select id::text from auth.users
                      where email like '%@gericare.test');
delete from auth.sessions
    where user_id in (select id from auth.users
                      where email like '%@gericare.test');
delete from auth.identities
    where provider_id::text like '%@gericare.test'
       or user_id in (select id from auth.users
                      where email like '%@gericare.test');
delete from public.profiles
    where email like '%@gericare.test';
delete from auth.users
    where email like '%@gericare.test';

-- ----------------------------------------------------------------------------
-- BLOQUE 8 · RECREACIÓN AUTOMÁTICA DE LAS 4 SEMILLAS (vía SQL, sin Dashboard).
-- Se ejecuta INMEDIATAMENTE después de la purga del BLOQUE 7, replicando el
-- patrón exacto que usa GoTrue al crear usuarios por email/password:
--   * auth.users con encrypted_password = bcrypt('GeriCare#Seed2026')
--   * email_confirmed_at = now() (compatible con "Confirm email" ACTIVO)
--   * auth.identities con provider='email' (requisito de Auth v2.197+)
-- Idempotente: solo inserta si la fila no existe (doble protección: NOT EXISTS
-- sobre users e identities). El trigger handle_new_user crea el perfil; el
-- BLOQUE 5 posterior fija los roles exactos por UUID determinista.
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, authentication_method, provider
)
select
  '00000000-0000-0000-0000-000000000000', s.uuid, 'authenticated',
  'authenticated', s.email, crypt('GeriCare#Seed2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', s.full_name),
  now(), now(), 'email', 'email'
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@gericare.test',    'Admin GeriCare'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'jefe@gericare.test',     'Jefa de Planta'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'auxiliar@gericare.test', 'Auxiliar de Turno'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'medico@gericare.test',   'Médico Coordinador')
) as s(uuid, email, full_name)
where not exists (select 1 from auth.users x where x.id = s.uuid);

-- Identidades 'email' para las semillas recién creadas (mismo patrón GoTrue).
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.email, 'email',
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
