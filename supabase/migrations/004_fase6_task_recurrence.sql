-- ============================================================================
-- GeriCare · FASE 6 — Motor de recurrencia de tareas de cuidado
-- ----------------------------------------------------------------------------
-- Añade a `public.care_tasks` las columnas necesarias para generar instancias
-- físicas diarias con recurrencia durante los próximos 30 días y permitir
-- cancelar la serie completa en bloque:
--   * recurrence_group_id : uuid que agrupa todas las instancias de una serie.
--   * requires_vitals     : la tarea exige registrar signos vitales al ejecutar.
--   * requires_photo      : la tarea exige adjuntar fotografía al ejecutar.
-- No modifica datos existentes: valores por defecto seguros (serie = propia id,
-- flags = false). Compatible con las políticas RLS ya creadas en 001.
-- ============================================================================

-- 1. Columnas nuevas ---------------------------------------------------------
alter table public.care_tasks
  add column if not exists recurrence_group_id uuid not null default gen_random_uuid();

alter table public.care_tasks
  add column if not exists requires_vitals boolean not null default false;

alter table public.care_tasks
  add column if not exists requires_photo boolean not null default false;

comment on column public.care_tasks.recurrence_group_id is
  'Identificador de la serie de recurrencia. Todas las instancias generadas juntas comparten el mismo valor; permite cancelar/actualizar la serie completa.';
comment on column public.care_tasks.requires_vitals is
  'Verdadero si al ejecutar la tarea se deben registrar signos vitales (Fase 7 móvil auxiliar).';
comment on column public.care_tasks.requires_photo is
  'Verdadero si al ejecutar la tarea se debe adjuntar una fotografía de evidencia.';

-- Backfill determinista para filas históricas: cada tarea es su propia serie.
update public.care_tasks
set recurrence_group_id = id
where recurrence_group_id is null;

-- 2. Índices -----------------------------------------------------------------
-- Búsqueda rápida de series completas (cancelar/editar en bloque) y agenda.
create index if not exists idx_care_tasks_recurrence_group
  on public.care_tasks (recurrence_group_id);

create index if not exists idx_care_tasks_resident_day
  on public.care_tasks (resident_id, effective_from);

-- 3. Compatibilidad con RLS ----------------------------------------------------
-- Las columnas nuevas quedan cubiertas por las políticas existentes de
-- care_tasks (select para autenticados; insert/update para personal clínico
-- creado en 001). No se crean políticas nuevas porque no hay tablas nuevas.
