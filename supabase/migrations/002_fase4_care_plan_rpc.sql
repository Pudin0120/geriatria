-- ============================================================================
-- GeriCare · Fase 4 — Creación transaccional de planes de cuidado con tareas
-- ============================================================================
-- Aporta la función RPC `create_care_plan_with_tasks`, usada por la Server
-- Action `createCarePlan` para escribir el plan y TODAS sus tareas recurrentes
-- en una única transacción de PostgreSQL (todo o nada).
--
-- Seguridad:
--   * SECURITY INVOKER: la función ejecuta los INSERT con los privilegios del
--     usuario autenticado, por lo que las políticas RLS de la Fase 1 siguen
--     aplicándose fila a fila (plans_insert_clinical_staff /
--     tasks_insert_clinical_staff).
--   * Ejecutable solo por usuarios autenticados.
-- ===========================================================================

create or replace function public.create_care_plan_with_tasks(
  p_resident_id uuid,
  p_title       text,
  p_description text    default null,
  p_goals       text[]  default '{}',
  p_start_date  date    default current_date,
  p_end_date    date    default null,
  p_review_date date    default null,
  p_status      text    default 'activo',
  p_tasks       jsonb   default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_plan_id uuid;
  v_item    jsonb;
  v_days    smallint[];
begin
  -- Solo personal autenticado (RLS refuerza el rol clínico en los INSERT).
  if auth.uid() is null then
    raise exception 'create_care_plan_with_tasks requiere una sesión autenticada'
      using errcode = '42501';
  end if;

  insert into public.care_plans (
    resident_id, title, description, goals,
    start_date, end_date, review_date, status, created_by
  ) values (
    p_resident_id, p_title, nullif(p_description, ''), coalesce(p_goals, '{}'),
    p_start_date, p_end_date, p_review_date, p_status, auth.uid()
  )
  returning id into v_plan_id;

  if p_tasks is not null and jsonb_typeof(p_tasks) = 'array' then
    for v_item in select * from jsonb_array_elements(p_tasks)
    loop
      -- days_of_week: array JSON -> smallint[], filtrando días válidos 1..7.
      select coalesce(
               array_agg(d)::smallint[],
               '{}'::smallint[]
             )
        into v_days
        from jsonb_array_elements_text(coalesce(v_item -> 'days_of_week', '[]'::jsonb)) as d
        where d::int between 1 and 7;

      if v_days is null or cardinality(v_days) = 0 then
        v_days := '{1,2,3,4,5,6,7}'::smallint[];
      end if;

      insert into public.care_tasks (
        resident_id, care_plan_id, task_type, title, description,
        scheduled_time, days_of_week, frequency, priority, status,
        effective_from, effective_until, created_by
      ) values (
        p_resident_id,
        v_plan_id,
        (v_item ->> 'task_type')::public.task_type,
        v_item ->> 'title',
        nullif(v_item ->> 'description', ''),
        coalesce(v_item ->> 'scheduled_time', '08:00:00')::time,
        v_days,
        coalesce(nullif(v_item ->> 'frequency', ''), 'diaria'),
        coalesce(nullif(v_item ->> 'priority', ''), 'normal'),
        'programada'::public.task_status,
        p_start_date,
        p_end_date,
        auth.uid()
      );
    end loop;
  end if;

  return jsonb_build_object('plan_id', v_plan_id, 'task_count', jsonb_array_length(coalesce(p_tasks, '[]'::jsonb)));
end;
$$;

comment on function public.create_care_plan_with_tasks is
  'Fase 4: crea un plan de cuidado y sus tareas recurrentes en una sola transacción (SECURITY INVOKER, sujeto a RLS).';

revoke execute on function public.create_care_plan_with_tasks(uuid, text, text, text[], date, date, date, text, jsonb) from public;
grant execute on function public.create_care_plan_with_tasks(uuid, text, text, text[], date, date, date, text, jsonb) to authenticated;
