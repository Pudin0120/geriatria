-- =====================================================================
-- GeriCare · Fase 1 — Esquema inicial de base de datos
-- PostgreSQL 17 / Supabase
-- Idioma de datos y comentarios: Español
--
-- ORDEN DE EJECUCIÓN OBLIGATORIO (dependencias resueltas):
--   1. Extensiones (uuid-ossp, pgcrypto)
--   2. Tipos enumerados (ENUMS)
--   3. Creación de TODAS las tablas
--   4. Índices
--   5. Funciones helper y triggers (referencian public.profiles ya creada)
--   6. Habilitación de RLS y creación de políticas
--   7. Datos semilla (INSERTS) al final de todo
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensiones
-- ---------------------------------------------------------------------

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. Tipos enumerados (Enums)
-- ---------------------------------------------------------------------
create type public.user_role as enum (
  'admin',
  'nurse_jefe',
  'auxiliar',
  'medico'
);

-- Nota: los literales de ENUM no admiten comentarios inline entre comas;
-- las descripciones se documentan mediante COMMENT ON TYPE.
create type public.task_type as enum (
  'higiene',
  'movilizacion',
  'alimentacion',
  'signos_vitales',
  'medicacion',
  'control_esfinteres',
  'curacion',
  'acompanamiento',
  'otro'
);
comment on type public.task_type is 'higiene: aseo/baño | movilizacion: cambios posturales y deambulación | alimentacion: asistencia en comidas e hidratación | signos_vitales: TA, pulso, temperatura, saturación | medicacion: administración de fármacos | control_esfinteres: esfínteres/sondaje | curacion: heridas y úlceras por presión | acompanamiento: estimulación cognitiva y socialización | otro: tarea diversa';

create type public.task_status as enum (
  'programada',
  'en_curso',
  'completada',
  'omitida',
  'cancelada'
);
comment on type public.task_status is 'Ciclo de vida de una tarea de cuidado.';

create type public.resident_status as enum (
  'activo',
  'ingresado',
  'baja_voluntaria',
  'fallecido'
);
comment on type public.resident_status is 'ingresado = ingreso hospitalario temporal del residente.';

create type public.medication_route as enum (
  'oral',
  'topica',
  'intravenosa',
  'intramuscular',
  'subcutanea',
  'rectal',
  'inhalatoria',
  'transdermica',
  'oftalmica',
  'otica'
);

-- ---------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------
-- 3.1 profiles — perfil extendido de cada usuario de auth.users
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null default '',
  email       text,
  role        public.user_role not null default 'auxiliar',
  phone       text,
  avatar_url  text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Perfil público extendido de cada usuario autenticado.';

-- 3.2 residents — residentes de la residencia
create table public.residents (
  id                      uuid primary key default uuid_generate_v4(),
  first_name              text not null,
  last_name               text not null,
  birth_date              date not null,
  gender                  text not null check (gender in ('masculino', 'femenino', 'otro')),
  room_number             text,
  admission_date          date not null default current_date,
  status                  public.resident_status not null default 'activo',
  allergies               text[] not null default '{}',
  diagnoses               text[] not null default '{}',
  emergency_contact_name  text,
  emergency_contact_phone text,
  notes                   text,
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
comment on table public.residents is 'Padrón de residentes del centro geriátrico.';

-- 3.3 vgi_assessments — Valoración Geriátrica Integral (VGI)
create table public.vgi_assessments (
  id               uuid primary key default uuid_generate_v4(),
  resident_id      uuid not null references public.residents (id) on delete cascade,
  assessment_date  date not null default current_date,
  assessed_by      uuid references public.profiles (id) on delete set null,
  -- Capacidad funcional (Índice de Barthel: 0–100)
  barthel_index    smallint check (barthel_index between 0 and 100),
  -- Estado cognitivo (Minimetestado / MMSE: 0–30)
  mmse_score       smallint check (mmse_score between 0 and 30),
  -- Riesgo nutricional (MNA-SF: 0–14)
  mna_sf_score     smallint check (mna_sf_score between 0 and 14),
  -- Riesgo de caídas (Escala de Downton: 0–3 ítems)
  downton_score    smallint check (downton_score between 0 and 3),
  -- Estado anímico (Escala de Yesavage GDS-15: 0–15)
  yesavage_score   smallint check (yesavage_score between 0 and 15),
  -- Comorbilidad (Índice de Charlson: 0–37)
  charlson_score   smallint check (charlson_score between 0 and 37),
  frailty_level    text check (frailty_level in ('fragil', 'pre_fragil', 'robusto')),
  clinical_summary text,
  recommendations  text[],
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.vgi_assessments is 'Valoraciones Geriátricas Integrales con escalas validadas.';

-- 3.4 care_plans — planes individualizados de cuidado
create table public.care_plans (
  id           uuid primary key default uuid_generate_v4(),
  resident_id  uuid not null references public.residents (id) on delete cascade,
  title        text not null,
  description  text,
  goals        text[] not null default '{}',
  start_date   date not null default current_date,
  end_date     date,
  review_date  date,
  status       text not null default 'activo'
               check (status in ('borrador', 'activo', 'pausado', 'cerrado')),
  created_by   uuid references public.profiles (id) on delete set null,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint valid_plan_date_range check (end_date is null or end_date >= start_date)
);
comment on table public.care_plans is 'Planes de cuidados individualizados por residente.';

-- 3.5 care_tasks — tareas programadas de cuidado
create table public.care_tasks (
  id               uuid primary key default uuid_generate_v4(),
  resident_id      uuid not null references public.residents (id) on delete cascade,
  care_plan_id     uuid references public.care_plans (id) on delete set null,
  task_type        public.task_type not null,
  title            text not null,
  description      text,
  scheduled_time   time not null,
  days_of_week     smallint[] not null default '{1,2,3,4,5,6,7}'
                   check (days_of_week <@ '{1,2,3,4,5,6,7}'),
  frequency        text not null default 'diaria'
                   check (frequency in ('unica', 'diaria', 'alternodia', 'semanal', 'quincenal', 'mensual')),
  assigned_to      uuid references public.profiles (id) on delete set null,
  priority         text not null default 'normal'
                   check (priority in ('baja', 'normal', 'alta', 'urgente')),
  status           public.task_status not null default 'programada',
  effective_from   date not null default current_date,
  effective_until  date,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.care_tasks is 'Tareas de cuidado recurrentes/programadas por residente.';

-- 3.6 task_executions — registro de ejecución (bitácora) de tareas
create table public.task_executions (
  id           uuid primary key default uuid_generate_v4(),
  task_id      uuid not null references public.care_tasks (id) on delete cascade,
  executed_by  uuid references public.profiles (id) on delete set null,
  executed_at  timestamptz not null default now(),
  outcome      public.task_status not null
               check (outcome in ('completada', 'omitida', 'cancelada')),
  notes        text,
  vital_signs  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.task_executions is 'Bitácora de ejecuciones de tareas (quién, cuándo, resultado).';

-- 3.7 medications — catálogo de medicamentos prescritos por residente
create table public.medications (
  id              uuid primary key default uuid_generate_v4(),
  resident_id     uuid not null references public.residents (id) on delete cascade,
  name            text not null,
  generic_name    text,
  presentation    text,
  dosage          text not null,
  route           public.medication_route not null default 'oral',
  schedule_times  time[] not null default '{}',
  frequency       text not null default 'unica'
                  check (frequency in ('unica', 'diaria', 'cada_8h', 'cada_12h', 'cada_24h', 'nocturna', 'bajo_demanda')),
  start_date      date not null default current_date,
  end_date        date,
  prescribed_by   text,
  indications     text,
  active          boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint valid_med_date_range check (end_date is null or end_date >= start_date)
);
comment on table public.medications is 'Prescripciones farmacológicas activas por residente.';

-- 3.8 medication_administrations — registro de administración de medicación
create table public.medication_administrations (
  id                uuid primary key default uuid_generate_v4(),
  medication_id     uuid not null references public.medications (id) on delete cascade,
  administered_by   uuid references public.profiles (id) on delete set null,
  administered_at   timestamptz not null default now(),
  scheduled_at      timestamptz,
  dose_given        text not null,
  route_used        public.medication_route not null,
  outcome           text not null default 'administrada'
                    check (outcome in ('administrada', 'rechazada', 'omitida', 'parcial')),
  adverse_reaction  boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now()
);
comment on table public.medication_administrations is 'Registro de cada administración real de medicación.';

-- 3.9 access_logs — auditoría de accesos al sistema
create table public.access_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  ip_address  inet,
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.access_logs is 'Auditoría de acciones sensibles sobre los datos.';

-- ---------------------------------------------------------------------
-- 4. Índices
-- ---------------------------------------------------------------------
create index idx_residents_status     on public.residents (status);
create index idx_residents_full_name  on public.residents (last_name, first_name);
create index idx_vgi_resident         on public.vgi_assessments (resident_id, assessment_date desc);
create index idx_care_plans_resident  on public.care_plans (resident_id, status);
create index idx_care_tasks_resident  on public.care_tasks (resident_id, status);
create index idx_care_tasks_assigned  on public.care_tasks (assigned_to, scheduled_time);
create index idx_task_executions_task on public.task_executions (task_id, executed_at desc);
create index idx_medications_resident on public.medications (resident_id, active);
create index idx_med_admin_medication on public.medication_administrations (medication_id, administered_at desc);
create index idx_access_logs_user     on public.access_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. Funciones helper
-- ---------------------------------------------------------------------

-- Devuelve el rol del usuario autenticado actual (desde public.profiles).
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid();
$$;

-- Verdadero si el usuario autenticado es administrador.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

-- Verdadero si el usuario autenticado es enfermero/a jefe o superior (admin).
create or replace function public.is_nurse_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role() in ('admin', 'nurse_jefe'),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------
-- 6.1 update_updated_at_column — mantiene actualizada la columna updated_at
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

create trigger trg_residents_updated_at
  before update on public.residents
  for each row execute function public.update_updated_at_column();

create trigger trg_vgi_updated_at
  before update on public.vgi_assessments
  for each row execute function public.update_updated_at_column();

create trigger trg_care_plans_updated_at
  before update on public.care_plans
  for each row execute function public.update_updated_at_column();

create trigger trg_care_tasks_updated_at
  before update on public.care_tasks
  for each row execute function public.update_updated_at_column();

create trigger trg_medications_updated_at
  before update on public.medications
  for each row execute function public.update_updated_at_column();

-- 6.2 handle_new_user — crea automáticamente el perfil al registrarse en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'auxiliar'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 7. Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles                   enable row level security;
alter table public.residents                  enable row level security;
alter table public.vgi_assessments            enable row level security;
alter table public.care_plans                 enable row level security;
alter table public.care_tasks                 enable row level security;
alter table public.task_executions            enable row level security;
alter table public.medications                enable row level security;
alter table public.medication_administrations enable row level security;
alter table public.access_logs                enable row level security;

-- 7.1 profiles ---------------------------------------------------------
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_self_or_admin"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- 7.2 residents --------------------------------------------------------
create policy "residents_select_authenticated"
  on public.residents for select
  to authenticated
  using (true);

create policy "residents_insert_clinical_staff"
  on public.residents for insert
  to authenticated
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "residents_update_clinical_staff"
  on public.residents for update
  to authenticated
  using (public.is_nurse_or_above() or public.current_user_role() = 'medico')
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "residents_delete_admin"
  on public.residents for delete
  to authenticated
  using (public.is_admin());

-- 7.3 vgi_assessments ---------------------------------------------------
create policy "vgi_select_authenticated"
  on public.vgi_assessments for select
  to authenticated
  using (true);

create policy "vgi_insert_clinical_staff"
  on public.vgi_assessments for insert
  to authenticated
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "vgi_update_author_or_admin"
  on public.vgi_assessments for update
  to authenticated
  using (assessed_by = auth.uid() or public.is_admin())
  with check (assessed_by = auth.uid() or public.is_admin());

create policy "vgi_delete_admin"
  on public.vgi_assessments for delete
  to authenticated
  using (public.is_admin());

-- 7.4 care_plans ---------------------------------------------------------
create policy "plans_select_authenticated"
  on public.care_plans for select
  to authenticated
  using (true);

create policy "plans_insert_clinical_staff"
  on public.care_plans for insert
  to authenticated
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "plans_update_creator_or_admin"
  on public.care_plans for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy "plans_delete_admin"
  on public.care_plans for delete
  to authenticated
  using (public.is_admin());

-- 7.5 care_tasks ----------------------------------------------------------
create policy "tasks_select_authenticated"
  on public.care_tasks for select
  to authenticated
  using (true);

create policy "tasks_insert_clinical_staff"
  on public.care_tasks for insert
  to authenticated
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "tasks_update_assignee_or_nurse_above"
  on public.care_tasks for update
  to authenticated
  using (assigned_to = auth.uid() or public.is_nurse_or_above())
  with check (assigned_to = auth.uid() or public.is_nurse_or_above());

create policy "tasks_delete_nurse_or_above"
  on public.care_tasks for delete
  to authenticated
  using (public.is_nurse_or_above());

-- 7.6 task_executions ------------------------------------------------------
create policy "executions_select_authenticated"
  on public.task_executions for select
  to authenticated
  using (true);

create policy "executions_insert_executor"
  on public.task_executions for insert
  to authenticated
  with check (executed_by = auth.uid() or public.is_nurse_or_above());

create policy "executions_update_executor_or_admin"
  on public.task_executions for update
  to authenticated
  using (executed_by = auth.uid() or public.is_admin())
  with check (executed_by = auth.uid() or public.is_admin());

create policy "executions_delete_admin"
  on public.task_executions for delete
  to authenticated
  using (public.is_admin());

-- 7.7 medications ------------------------------------------------------------
create policy "medications_select_authenticated"
  on public.medications for select
  to authenticated
  using (true);

create policy "medications_insert_clinical_staff"
  on public.medications for insert
  to authenticated
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "medications_update_clinical_staff"
  on public.medications for update
  to authenticated
  using (public.is_nurse_or_above() or public.current_user_role() = 'medico')
  with check (public.is_nurse_or_above() or public.current_user_role() = 'medico');

create policy "medications_delete_admin"
  on public.medications for delete
  to authenticated
  using (public.is_admin());

-- 7.8 medication_administrations ----------------------------------------------
create policy "administrations_select_authenticated"
  on public.medication_administrations for select
  to authenticated
  using (true);

create policy "administrations_insert_administrator"
  on public.medication_administrations for insert
  to authenticated
  with check (administered_by = auth.uid() or public.is_nurse_or_above());

create policy "administrations_update_admin_only"
  on public.medication_administrations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "administrations_delete_admin"
  on public.medication_administrations for delete
  to authenticated
  using (public.is_admin());

-- 7.9 access_logs ----------------------------------------------------------------
create policy "access_logs_select_own_or_admin"
  on public.access_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "access_logs_insert_any_authenticated"
  on public.access_logs for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_admin());

-- Solo administradores pueden depurar el histórico de auditoría.
create policy "access_logs_delete_admin"
  on public.access_logs for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Datos semilla de prueba (Seed)
-- ---------------------------------------------------------------------
-- 8.1 Cuentas de demostración (auth.users + perfiles vía handle_new_user()).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, encrypted_password, aud, role)
values
  ('00000000-0000-4000-8000-000000000001', 'admin@gericare.test',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Laura Giménez Prados"}',
   crypt('GeriCare#Seed2026', gen_salt('bf')), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000002', 'jefe@gericare.test',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Marta Ruiz Oliva"}',
   crypt('GeriCare#Seed2026', gen_salt('bf')), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000003', 'auxiliar@gericare.test',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Carlos Méndez Vega"}',
   crypt('GeriCare#Seed2026', gen_salt('bf')), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000004', 'medico@gericare.test',
   '{"provider":"email","providers":["email"]}', '{"full_name":"Dr. Antonio Salas Peña"}',
   crypt('GeriCare#Seed2026', gen_salt('bf')), 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- El trigger handle_new_user ya insertó los perfiles con rol 'auxiliar';
-- a continuación se ajustan los roles reales de las cuentas semilla.
update public.profiles set role = 'admin'
 where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'nurse_jefe'
 where id = '00000000-0000-4000-8000-000000000002';
update public.profiles set role = 'auxiliar'
 where id = '00000000-0000-4000-8000-000000000003';
update public.profiles set role = 'medico'
 where id = '00000000-0000-4000-8000-000000000004';

-- 8.2 Cinco residentes de prueba
insert into public.residents
  (id, first_name, last_name, birth_date, gender, room_number, admission_date, status,
   allergies, diagnoses, emergency_contact_name, emergency_contact_phone, notes, created_by)
values
  ('00000000-0000-4000-8000-000000000101', 'Josefa', 'Martínez López', date '1934-05-12', 'femenino', '101-A', date '2023-03-01', 'activo',
   array['Penicilina'], array['Alzheimer moderado', 'Hipertensión arterial'],
   'María López (hija)', '+34 611 222 333', 'Prefiere desayunar temprano. Paseos diarios cortos.',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000102', 'Antonio', 'García Fernández', date '1938-11-30', 'masculino', '102-B', date '2022-09-15', 'activo',
   array['Aspirina'], array['Parkinson idiopático', 'Diabetes tipo 2'],
   'Pedro García (hijo)', '+34 622 333 444', 'Control glucémico antes de comidas.',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000103', 'Pilar', 'Sánchez Romero', date '1941-02-08', 'femenino', '205-A', date '2024-01-20', 'activo',
   array[], array['Osteoporosis', 'Úlcera por presión sacra grado II'],
   'Ana Sánchez (nieta)', '+34 633 444 555', 'Cambios posturales cada 2 horas imprescindibles.',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000104', 'Manuel', 'Díaz Torres', date '1936-07-22', 'masculino', '206-B', date '2021-06-10', 'ingresado',
   array['Iodo', 'Contrastes yodados'], array['Insuficiencia cardíaca congestiva', 'EPOC'],
   'Lucía Díaz (hija)', '+34 644 555 666', 'Ingresado en Hospital Central por descompensación.',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000105', 'Dolores', 'Navarro Jiménez', date '1943-09-14', 'femenino', '103-A', date '2024-08-05', 'activo',
   array['Lactosa'], array['Depresión mayor', 'Fibrilación auricular'],
   'Javier Navarro (sobrino)', '+34 655 666 777', 'Terapia ocupacional 3 veces por semana.',
   '00000000-0000-4000-8000-000000000002');

-- 8.3 Tres valoraciones geriátricas integrales (VGI)
insert into public.vgi_assessments
  (resident_id, assessment_date, assessed_by, barthel_index, mmse_score, mna_sf_score,
   downton_score, yesavage_score, charlson_score, frailty_level, clinical_summary, recommendations)
values
  ('00000000-0000-4000-8000-000000000101', date '2026-01-15',
   '00000000-0000-4000-8000-000000000004', 55, 18, 9, 2, 6, 4, 'fragil',
   'Deterioro cognitivo moderado con dependencia parcial para AVD básicas. Buen estado nutricional límite.',
   array['Estimulación cognitiva diaria', 'Vigilancia de hidratación', 'Reevaluar en 6 meses']),
  ('00000000-0000-4000-8000-000000000102', date '2026-02-10',
   '00000000-0000-4000-8000-000000000004', 70, 23, 11, 1, 4, 5, 'pre_fragil',
   'Temblor en reposo y rigidez moderada. Glucemias controladas con pauta actual.',
   array['Fisioterapia motora 3 días/semana', 'Control glucémico preprandial', 'Revisión neurología trimestral']),
  ('00000000-0000-4000-8000-000000000103', date '2026-03-05',
   '00000000-0000-4000-8000-000000000004', 35, 21, 7, 3, 8, 3, 'fragil',
   'Alto riesgo de caídas y UPP sacra en evolución. Desnutrición leve.',
   array['Cambios posturales cada 2 h', 'Curación diaria de UPP', 'Suplementación proteica', 'Colchón antiescaras']);

-- 8.4 Cuatro medicaciones de prueba
insert into public.medications
  (resident_id, name, generic_name, presentation, dosage, route, schedule_times,
   frequency, start_date, prescribed_by, indications, active, created_by)
values
  ('00000000-0000-4000-8000-000000000101', 'Donepezilo', 'clorhidrato de donepezilo', 'Comprimidos 10 mg', '10 mg', 'oral',
   array[time '21:00'], 'unica', date '2025-06-01', 'Dr. Antonio Salas Peña', 'Demencia tipo Alzheimer', true,
   '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000102', 'Levodopa/Carbidopa', 'levodopa y carbidopa', 'Comprimidos 500/50 mg', '500 mg', 'oral',
   array[time '08:00', time '14:00', time '20:00'], 'cada_8h', date '2025-01-10', 'Dr. Antonio Salas Peña', 'Enfermedad de Parkinson', true,
   '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000103', 'Enoxaparina', 'enoxaparina sódica', 'Jeringa precargada 40 mg/0,4 ml', '40 mg', 'subcutanea',
   array[time '22:00'], 'unica', date '2026-02-20', 'Dra. Elena Costa Marín', 'Profilaxis trombótica en movilidad reducida', true,
   '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000105', 'Sertralina', 'clorhidrato de sertralina', 'Comprimidos 50 mg', '50 mg', 'oral',
   array[time '09:00'], 'unica', date '2025-09-01', 'Dra. Elena Costa Marín', 'Trastorno depresivo mayor', true,
   '00000000-0000-4000-8000-000000000004');

-- 8.5 Dos planes de cuidado
insert into public.care_plans
  (id, resident_id, title, description, goals, start_date, end_date, review_date, status, created_by, reviewed_by)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'Plan de estimulación y autonomía funcional',
   'Mantener capacidades cognitivas residuales y fomentar la autonomía posible en AVD.',
   array['Mantener orientación temporo-espacial', 'Conseguir aseo parcial asistido sin ayuda total', 'Paseo diario de 15 minutos'],
   date '2026-01-20', date '2026-07-20', date '2026-04-20', 'activo',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000103',
   'Plan de prevención y curación de úlceras por presión',
   'Cicatrización de UPP sacra grado II y prevención de nuevas lesiones.',
   array['Curación diaria hasta granulación completa', 'Cambios posturales cada 2 horas día y noche', 'Recuperar peso saludable (IMC > 22)'],
   date '2026-03-08', null, date '2026-06-08', 'activo',
   '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004');

-- 8.6 Cuatro tareas de cuidado
insert into public.care_tasks
  (id, resident_id, care_plan_id, task_type, title, description, scheduled_time,
   days_of_week, frequency, assigned_to, priority, status, created_by)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000201', 'acompanamiento',
   'Estimulación cognitiva dirigida', 'Sesión de orientación a la realidad con fotografías familiares.',
   time '10:30', '{1,3,5}', 'semanal',
   '00000000-0000-4000-8000-000000000003', 'normal', 'programada',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000102',
   null, 'signos_vitales',
   'Control de tensión arterial y glucemia', 'Medición en ayunas; registrar en hoja de constantes.',
   time '07:45', '{1,2,3,4,5,6,7}', 'diaria',
   '00000000-0000-4000-8000-000000000003', 'alta', 'programada',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000103',
   '00000000-0000-4000-8000-000000000202', 'curacion',
   'Curación de úlcera sacra', 'Técnica estéril con solución salina y apósito de hidrocoloide.',
   time '09:00', '{1,2,3,4,5,6,7}', 'diaria',
   '00000000-0000-4000-8000-000000000002', 'urgente', 'programada',
   '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000105',
   null, 'higiene',
   'Aseo matinal asistido', 'Ayuda parcial en aseo personal y vestido; fomentar autonomía.',
   time '08:15', '{1,2,3,4,5,6,7}', 'diaria',
   '00000000-0000-4000-8000-000000000003', 'normal', 'programada',
   '00000000-0000-4000-8000-000000000002');
