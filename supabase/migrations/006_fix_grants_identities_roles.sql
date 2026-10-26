-- ============================================================================
-- Migración 006 · Reparación de autenticación semilla, GRANTs ACL y roles
-- GeriCare · Supabase Auth v2.197 / PostgreSQL 17
-- Idempotente: puede ejecutarse varias veces sin efectos secundarios.
-- ============================================================================
--
-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ PASO PREVIO OPCIONAL (DIAGNÓSTICO)                                     │
-- │ Si algo sigue fallando tras aplicar esta migración, ejecuta primero    │
-- │ estas consultas en el SQL Editor del Dashboard y revisa las salidas:   │
-- │                                                                        │
-- │ -- (D1) ¿Qué permisos ACL tienen las tablas clave?                    │
-- │ --     Debe aparecer 'authenticated' con SELECT/INSERT/UPDATE/DELETE. │
-- │ --     Si falta → eso explica "permission denied for table ..."       │
-- │ --     (error 42501 = falta de GRANT, NO es RLS).                     │
-- │ select table_name, grantee, privilege_type                            │
-- │ from information_schema.table_privileges                               │
-- │ where table_schema = 'public'                                          │
-- │   and table_name in ('residents','care_tasks','medications',           │
-- │                      'profiles','access_logs');                        │
-- │                                                                        │
-- │ -- (D2) ¿Las cuentas semilla tienen identidad de email y confirmación?│
-- │ --     Sin fila en auth.identities, Supabase Auth v2 responde          │
-- │ --     "Invalid login credentials" aunque el bcrypt de auth.users     │
-- │ --     sea correcto (causa raíz H1 del bug de login).                  │
-- │ select u.email,                                                        │
-- │        (u.email_confirmed_at is not null) as confirmado,               │
-- │        exists(select 1 from auth.identities i                          │
-- │               where i.user_id = u.id and i.provider = 'email')         │
-- │          as tiene_identity                                             │
-- │ from auth.users u                                                      │
-- │ where u.email like '%@gericare.test'                                   │
-- │    or u.email = 'josefflaverde@gmail.com';                             │
-- └────────────────────────────────────────────────────────────────────────┘

-- ----------------------------------------------------------------------------
-- 1) Identidades de email para las 4 cuentas semilla (causa raíz H1).
--    Supabase Auth v2 resuelve signInWithPassword a través de auth.identities;
--    los usuarios insertados directamente en auth.users por la migración 001
--    nunca tuvieron esta fila, por eso GoTrue devolvía "Invalid login
--    credentials" pese al hash bcrypt válido.
-- ----------------------------------------------------------------------------
insert into auth.identities (
  user_id,
  identity_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,                                        -- identity_id coincide con el sub
  u.email,                                     -- provider_id = email (provider email)
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
-- 2) Confirmación de correo de las semillas (causa raíz H1 agravada).
--    Con "Confirm email" ACTIVO en el provider, un email_confirmed_at NULL
--    bloquea el login. Las semillas son cuentas internas del centro: se
--    confirman explícitamente aquí (mismo criterio que la migración 005).
-- ----------------------------------------------------------------------------
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmation_token = ''
where email in (
  'admin@gericare.test',
  'jefe@gericare.test',
  'auxiliar@gericare.test',
  'medico@gericare.test'
);

-- ----------------------------------------------------------------------------
-- 3) GRANTs ACL sobre public (causa raíz H2 · error Postgres 42501).
--    "permission denied for table residents/care_tasks/medications" NO es un
--    problema de RLS (RLS sin política devuelve 0 filas, no 42501): falta la
--    autorización de objetos (ACL) para el rol 'authenticated'. Se conceden
--    privilegios y se fijan DEFAULT PRIVILEGES para tablas futuras.
--    SEGURIDAD: RLS permanece ACTIVADO en todas las tablas — los GRANTs solo
--    abren la puerta del objeto; quién ve qué filas lo decide RLS intacto.
--    A 'anon' SOLO se le da USAGE de schema (nunca escritura ni lectura de
--    datos clínicos).
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role, anon;

grant all privileges on all tables   in schema public to authenticated, service_role;
grant all privileges on all sequences in schema public to authenticated, service_role;
grant execute        on all functions in schema public to authenticated, service_role;

alter default privileges in schema public
  grant all privileges on tables   to authenticated, service_role;
alter default privileges in schema public
  grant all privileges on sequences to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4) Bloque OPTATIVO · destino de la cuenta personal josefflaverde@gmail.com.
--    El usuario creó una cuenta propia desde la UI (rol auxiliar) ANTES de
--    retirarse el auto-registro. Elige UN SOLO camino y descoméntalo:
--
--    OPCIÓN A — promoverla a admin y conservarla como cuenta del dueño
--    (recomendado si vas a usarla para administrar el centro):
--
-- update public.profiles set role = 'admin'
--  where email = 'josefflaverde@gmail.com';
--
--    OPCIÓN B — eliminarla por completo (cuenta con contraseña comprometida
--    expuesta en chat; si eliges B, borra también su perfil en cascada):
--
-- delete from public.profiles
--  where id = (select id from auth.users where email = 'josefflaverde@gmail.com');
-- delete from auth.users
--  where email = 'josefflaverde@gmail.com';
--
--    IMPORTANTE (válido para ambas opciones): cambia YA la contraseña de esa
--    cuenta en Dashboard → Authentication → Users → (⋯) → "Update password",
--    o revócala, porque quedó expuesta en un chat.
-- ----------------------------------------------------------------------------
