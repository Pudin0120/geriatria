-- Additive only: keep nurse_jefe and enfermeria as distinct roles.
alter type public.user_role add value if not exists 'enfermeria';
alter type public.user_role add value if not exists 'familiar';
