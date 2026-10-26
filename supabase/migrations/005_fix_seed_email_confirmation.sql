-- GeriCare · Migración 005 — Reparación de usuarios semilla (CAUSA 2)
-- =====================================================================
-- Problema: la migración 001_initial_schema.sql insertó las 4 cuentas de
-- demostración en auth.users SIN establecer email_confirmed_at. GoTrue
-- (Auth v2.197.0) rechaza el login con password aunque la contraseña sea
-- correcta si el correo no está confirmado → «Email not confirmed».
-- Esta migración confirma las cuentas y repara los perfiles asociados.

-- Confirma las 4 cuentas semilla para que GoTrue permita login con password
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

-- Repara perfiles si el trigger no se ejecutó
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

-- Restaura roles correctos
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'nurse_jefe' where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set role = 'auxiliar' where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set role = 'medico' where id = '00000000-0000-4000-8000-000000000004';
