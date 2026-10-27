-- GeriCare security hardening. Review against the live schema before applying.
-- Intentionally does not modify Supabase Auth project settings or user rows.

create table public.resident_user_access (
  resident_id uuid not null references public.residents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_kind text not null check (access_kind in ('care', 'family')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (resident_id, user_id, access_kind)
);
alter table public.resident_user_access enable row level security;
alter table public.resident_user_access force row level security;
revoke all on public.resident_user_access from anon, authenticated;

-- Remove broad default ACLs left by the historical 006–008 migrations for
-- future objects created by the migration owner in this schema.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

create or replace function public.has_active_profile()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.can_access_resident(target_resident uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role in ('admin', 'nurse_jefe')
  ) or exists (
    select 1 from public.resident_user_access a
    join public.profiles p on p.id = a.user_id and p.active
    where a.user_id = auth.uid() and a.resident_id = target_resident and a.access_kind = 'care'
      and p.role in ('medico', 'enfermeria', 'auxiliar')
  ) or exists (
    select 1 from public.care_tasks t
    join public.profiles p on p.id = auth.uid() and p.active
    where t.resident_id = target_resident and t.assigned_to = auth.uid()
      and p.role in ('medico', 'enfermeria', 'auxiliar')
  )
$$;

-- Convert historical creator-based doctor access into revocable assignments.
insert into public.resident_user_access(resident_id, user_id, access_kind, created_by)
select r.id, r.created_by, 'care', r.created_by
from public.residents r
join public.profiles p on p.id = r.created_by and p.active and p.role = 'medico'
where r.created_by is not null
on conflict (resident_id, user_id, access_kind) do nothing;

create or replace function public.grant_creator_resident_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by = auth.uid() and public.has_active_profile()
    and public.current_user_role() = 'medico' then
    insert into public.resident_user_access(resident_id, user_id, access_kind, created_by)
      values (new.id, auth.uid(), 'care', auth.uid())
      on conflict (resident_id, user_id, access_kind) do nothing;
    insert into public.access_logs(user_id, action, entity_type, entity_id, metadata)
      values (auth.uid(), 'resident_access.creator_assigned', 'resident_user_access', new.id,
        jsonb_build_object('access_kind', 'care'));
  end if;
  return new;
end;
$$;
revoke all on function public.grant_creator_resident_access() from public, anon, authenticated;
create trigger trg_grant_creator_resident_access
  after insert on public.residents
  for each row execute function public.grant_creator_resident_access();

create or replace function public.get_linked_resident_summaries()
returns table (id uuid, first_name text, last_name text, room_number text, status public.resident_status)
language sql stable security definer set search_path = '' as $$
  select r.id, r.first_name, r.last_name, r.room_number, r.status
  from public.residents r
  join public.resident_user_access a on a.resident_id = r.id and a.user_id = auth.uid()
  join public.profiles p on p.id = a.user_id and p.active and p.role = 'familiar'
  where a.access_kind = 'family'
$$;

create or replace function public.list_assignable_staff()
returns table (id uuid, full_name text, role public.user_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role from public.profiles p
  where public.has_active_profile()
    and public.current_user_role() in ('admin','nurse_jefe','medico')
    and p.active and p.role in ('auxiliar','nurse_jefe','enfermeria')
$$;

create or replace function public.is_assignable_staff(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = target_user and p.active
    and p.role in ('auxiliar','nurse_jefe','enfermeria'))
$$;

create or replace function public.get_staff_display_names(target_profile_ids uuid[])
returns table (id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where p.id = any(coalesce(target_profile_ids, '{}'::uuid[]))
    and p.active and p.role in ('admin','nurse_jefe','medico','enfermeria','auxiliar')
    and public.has_active_profile()
    and public.current_user_role() in ('admin','nurse_jefe','medico','enfermeria','auxiliar')
$$;

create or replace function public.record_auth_event(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_active_profile() then
    raise exception 'active session required' using errcode = '42501';
  end if;
  if p_action not in ('auth.login', 'auth.logout') then
    raise exception 'invalid auth event' using errcode = '22023';
  end if;
  insert into public.access_logs(user_id, action, entity_type, metadata)
    values (auth.uid(), p_action, 'auth', jsonb_build_object('source', 'server_action'));
end;
$$;

create or replace function public.admin_set_profile_role(target_user uuid, new_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_active_profile() or not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if new_role <> 'admin' and exists (
    select 1 from public.profiles target
    where target.id = target_user and target.active and target.role = 'admin'
      and (select count(*) from public.profiles p where p.active and p.role = 'admin') <= 1
  ) then
    raise exception 'cannot demote the last active admin' using errcode = '23514';
  end if;
  update public.profiles set role = new_role, updated_at = now() where id = target_user;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  insert into public.access_logs(user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'admin.profile_role_changed', 'profiles', target_user, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_resident_access(
  target_resident uuid, target_user uuid, access_type text, allow_access boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role public.user_role;
begin
  if auth.uid() is null or not public.has_active_profile() or not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select role into target_role from public.profiles where id = target_user and active;
  if not found then raise exception 'active profile not found' using errcode = 'P0002'; end if;
  if (access_type = 'family' and target_role <> 'familiar')
    or (access_type = 'care' and target_role not in ('medico','enfermeria','auxiliar'))
    or access_type not in ('family','care') then
    raise exception 'role and access type do not match' using errcode = '22023';
  end if;
  if allow_access then
    insert into public.resident_user_access(resident_id, user_id, access_kind, created_by)
      values (target_resident, target_user, access_type, auth.uid())
      on conflict (resident_id, user_id, access_kind) do nothing;
  else
    delete from public.resident_user_access
      where resident_id = target_resident and user_id = target_user and access_kind = access_type;
  end if;
  insert into public.access_logs(user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'admin.resident_access_changed', 'resident_user_access', target_resident,
      jsonb_build_object('target_user', target_user, 'access_kind', access_type, 'allowed', allow_access));
end;
$$;

create or replace function public.record_task_execution(
  p_task_id uuid, p_outcome public.task_status, p_notes text, p_vital_signs jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  task_row public.care_tasks%rowtype;
  execution_id uuid;
  actor_role public.user_role;
  signs jsonb := coalesce(p_vital_signs, '{}'::jsonb);
begin
  if auth.uid() is null or not public.has_active_profile() then
    raise exception 'active session required' using errcode = '42501';
  end if;
  actor_role := public.current_user_role();
  if actor_role not in ('admin','nurse_jefe','enfermeria','auxiliar') then
    raise exception 'role cannot execute care tasks' using errcode = '42501';
  end if;
  if p_outcome not in ('completada','omitida','cancelada') then
    raise exception 'invalid task outcome' using errcode = '22023';
  end if;
  if length(coalesce(p_notes, '')) > 1000 then
    raise exception 'notes too long' using errcode = '22023';
  end if;
  if jsonb_typeof(signs) <> 'object'
    or (signs - 'tension_arterial' - 'frecuencia_cardiaca' - 'temperatura' - 'saturacion_oxigeno' - 'glucemia' - 'photo_data_url') <> '{}'::jsonb then
    raise exception 'invalid vital signs payload' using errcode = '22023';
  end if;
  if signs ? 'photo_data_url' and (
    jsonb_typeof(signs->'photo_data_url') <> 'string'
    or length(signs->>'photo_data_url') > 250000
    or signs->>'photo_data_url' !~* '^data:image/(png|jpe?g|webp);base64,[a-z0-9+/]*={0,2}$'
  ) then
    raise exception 'invalid task photo evidence' using errcode = '22023';
  end if;
  if signs ? 'tension_arterial' and
    (jsonb_typeof(signs->'tension_arterial') <> 'string' or (signs->>'tension_arterial') !~ '^\d{2,3}/\d{2,3}$') then
    raise exception 'invalid blood pressure' using errcode = '22023';
  end if;
  if signs ? 'frecuencia_cardiaca' then
    if jsonb_typeof(signs->'frecuencia_cardiaca') <> 'number' then
      raise exception 'invalid heart rate' using errcode = '22023';
    end if;
    if (signs->>'frecuencia_cardiaca')::numeric not between 20 and 250 then
      raise exception 'invalid heart rate' using errcode = '22023';
    end if;
  end if;
  if signs ? 'temperatura' then
    if jsonb_typeof(signs->'temperatura') <> 'number' then
      raise exception 'invalid temperature' using errcode = '22023';
    end if;
    if (signs->>'temperatura')::numeric not between 25 and 45 then
      raise exception 'invalid temperature' using errcode = '22023';
    end if;
  end if;
  if signs ? 'saturacion_oxigeno' then
    if jsonb_typeof(signs->'saturacion_oxigeno') <> 'number' then
      raise exception 'invalid oxygen saturation' using errcode = '22023';
    end if;
    if (signs->>'saturacion_oxigeno')::numeric not between 50 and 100 then
      raise exception 'invalid oxygen saturation' using errcode = '22023';
    end if;
  end if;
  if signs ? 'glucemia' then
    if jsonb_typeof(signs->'glucemia') <> 'number' then
      raise exception 'invalid glucose' using errcode = '22023';
    end if;
    if (signs->>'glucemia')::numeric not between 20 and 800 then
      raise exception 'invalid glucose' using errcode = '22023';
    end if;
  end if;
  select * into task_row from public.care_tasks where id = p_task_id for update;
  if not found or task_row.status = 'cancelada' then
    raise exception 'task unavailable' using errcode = 'P0002';
  end if;
  if actor_role not in ('admin','nurse_jefe') and task_row.assigned_to is distinct from auth.uid() then
    raise exception 'task not assigned to current user' using errcode = '42501';
  end if;
  if p_outcome = 'completada' and task_row.requires_vitals
    and not (signs ?| array['tension_arterial','frecuencia_cardiaca','temperatura','saturacion_oxigeno','glucemia']) then
    raise exception 'task requires vital signs' using errcode = '22023';
  end if;
  if p_outcome = 'completada' and task_row.requires_photo and not (signs ? 'photo_data_url') then
    raise exception 'task requires photo evidence' using errcode = '22023';
  end if;
  insert into public.task_executions(task_id, executed_by, executed_at, outcome, notes, vital_signs)
    values (p_task_id, auth.uid(), now(), p_outcome, nullif(btrim(p_notes), ''), signs)
    returning id into execution_id;
  return execution_id;
end;
$$;

create or replace function public.record_medication_administration(
  p_medication_id uuid, p_dose_given text, p_route_used public.medication_route,
  p_outcome text, p_adverse_reaction boolean default false,
  p_notes text default null, p_scheduled_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  med_row public.medications%rowtype;
  actor_role public.user_role;
  administration_id uuid;
begin
  if auth.uid() is null or not public.has_active_profile() then
    raise exception 'active session required' using errcode = '42501';
  end if;
  actor_role := public.current_user_role();
  if actor_role not in ('admin','nurse_jefe','enfermeria') then
    raise exception 'role cannot administer medication' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_dose_given, ''))) not between 1 and 80
    or length(coalesce(p_notes, '')) > 1000
    or p_outcome not in ('administrada','rechazada','omitida','parcial') then
    raise exception 'invalid medication administration data' using errcode = '22023';
  end if;
  select * into med_row from public.medications where id = p_medication_id for update;
  if not found or not med_row.active then
    raise exception 'medication unavailable' using errcode = 'P0002';
  end if;
  if not public.can_access_resident(med_row.resident_id) then
    raise exception 'resident access required' using errcode = '42501';
  end if;
  insert into public.medication_administrations(
    medication_id, administered_by, administered_at, scheduled_at, dose_given,
    route_used, outcome, adverse_reaction, notes
  ) values (
    p_medication_id, auth.uid(), now(), p_scheduled_at, btrim(p_dose_given),
    p_route_used, p_outcome, coalesce(p_adverse_reaction, false) and p_outcome = 'administrada',
    nullif(btrim(p_notes), '')
  ) returning id into administration_id;
  return administration_id;
end;
$$;

-- Revoke broad default table rights. Grant only CRUD; RLS below scopes rows.
revoke all on table public.profiles, public.residents, public.vgi_assessments,
  public.care_plans, public.care_tasks, public.task_executions, public.medications,
  public.medication_administrations, public.access_logs from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.residents to authenticated;
grant update (first_name, last_name, birth_date, gender, room_number, admission_date,
  status, allergies, diagnoses, emergency_contact_name, emergency_contact_phone, notes)
  on public.residents to authenticated;
grant select, insert on public.vgi_assessments, public.care_plans, public.care_tasks to authenticated;
grant select on public.task_executions, public.medication_administrations to authenticated;
grant select, insert on public.medications to authenticated;
grant update (active) on public.medications to authenticated;
grant select on public.access_logs to authenticated;
grant select on public.resident_user_access to authenticated;
revoke all on public.resident_user_access from anon, authenticated;
grant select on public.resident_user_access to authenticated;
revoke all on function public.current_user_role(), public.is_admin(), public.is_nurse_or_above() from public, anon;
grant execute on function public.current_user_role(), public.is_admin(), public.is_nurse_or_above() to authenticated;
revoke all on function public.has_active_profile(), public.can_access_resident(uuid), public.get_linked_resident_summaries(), public.list_assignable_staff(), public.is_assignable_staff(uuid), public.get_staff_display_names(uuid[]), public.record_auth_event(text) from public, anon;
grant execute on function public.has_active_profile(), public.can_access_resident(uuid), public.get_linked_resident_summaries(), public.list_assignable_staff(), public.is_assignable_staff(uuid), public.get_staff_display_names(uuid[]), public.record_auth_event(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.admin_set_profile_role(uuid, public.user_role), public.admin_set_resident_access(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, public.user_role), public.admin_set_resident_access(uuid, uuid, text, boolean) to authenticated;
revoke all on function public.record_task_execution(uuid, public.task_status, text, jsonb), public.record_medication_administration(uuid, text, public.medication_route, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.record_task_execution(uuid, public.task_status, text, jsonb), public.record_medication_administration(uuid, text, public.medication_route, text, boolean, text, timestamptz) to authenticated;

-- Historical migrations 006–008 grant EXECUTE on every public function.
-- Reset the whole schema ACL, then expose only the RPCs used by the app.
revoke execute on all functions in schema public from public, anon, authenticated;
-- UUID defaults are evaluated by authenticated INSERT statements on rows.
grant execute on function extensions.uuid_generate_v4() to public;
grant execute on function public.current_user_role(), public.is_admin(), public.is_nurse_or_above(),
  public.has_active_profile(), public.can_access_resident(uuid), public.get_linked_resident_summaries(),
  public.list_assignable_staff(), public.is_assignable_staff(uuid), public.get_staff_display_names(uuid[]),
  public.record_auth_event(text), public.admin_set_profile_role(uuid, public.user_role),
  public.admin_set_resident_access(uuid, uuid, text, boolean),
  public.record_task_execution(uuid, public.task_status, text, jsonb),
  public.record_medication_administration(uuid, text, public.medication_route, text, boolean, text, timestamptz),
  public.create_care_plan_with_tasks(uuid, text, text, text[], date, date, date, text, jsonb)
  to authenticated;

-- Profiles: users can read their own row; only an existing admin may read others.
drop policy if exists profiles_insert_self_or_admin on public.profiles;
drop policy if exists profiles_update_own_or_admin on public.profiles;
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- No direct profile inserts/updates: role and active state are protected fields.
drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles for delete to authenticated using (public.is_admin());

-- Explicit resident scope. Family members must use the summary RPC only.
drop policy if exists residents_select_authenticated on public.residents;
create policy residents_select_scoped on public.residents for select to authenticated
  using (public.can_access_resident(id));
drop policy if exists residents_insert_clinical_staff on public.residents;
create policy residents_insert_staff on public.residents for insert to authenticated
  with check (created_by = auth.uid() and public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico'));
drop policy if exists residents_update_clinical_staff on public.residents;
create policy residents_update_staff on public.residents for update to authenticated
  using (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(id))
  with check (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(id));

-- Clinical records are visible only to staff with resident access.
drop policy if exists vgi_select_authenticated on public.vgi_assessments;
create policy vgi_select_scoped on public.vgi_assessments for select to authenticated using (public.can_access_resident(resident_id));
drop policy if exists plans_select_authenticated on public.care_plans;
create policy plans_select_scoped on public.care_plans for select to authenticated using (public.can_access_resident(resident_id));
drop policy if exists tasks_select_authenticated on public.care_tasks;
create policy tasks_select_scoped on public.care_tasks for select to authenticated using (public.can_access_resident(resident_id));
drop policy if exists executions_select_authenticated on public.task_executions;
create policy executions_select_scoped on public.task_executions for select to authenticated
  using (exists(select 1 from public.care_tasks t where t.id = task_id and public.can_access_resident(t.resident_id)));
drop policy if exists medications_select_authenticated on public.medications;
create policy medications_select_scoped on public.medications for select to authenticated using (public.can_access_resident(resident_id));
drop policy if exists administrations_select_authenticated on public.medication_administrations;
create policy administrations_select_scoped on public.medication_administrations for select to authenticated
  using (exists(select 1 from public.medications m where m.id = medication_id and public.can_access_resident(m.resident_id)));

-- Clinical writes require an active staff profile and resident access.
drop policy if exists vgi_insert_clinical_staff on public.vgi_assessments;
create policy vgi_insert_staff_scoped on public.vgi_assessments for insert to authenticated
  with check (assessed_by = auth.uid() and public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico','enfermeria') and public.can_access_resident(resident_id));
drop policy if exists vgi_update_author_or_admin on public.vgi_assessments;
create policy vgi_update_staff_scoped on public.vgi_assessments for update to authenticated
  using (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id))
  with check (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id));
drop policy if exists plans_insert_clinical_staff on public.care_plans;
create policy plans_insert_staff_scoped on public.care_plans for insert to authenticated
  with check (created_by = auth.uid() and public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id));
drop policy if exists plans_update_creator_or_admin on public.care_plans;
create policy plans_update_staff_scoped on public.care_plans for update to authenticated
  using (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id))
  with check (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id));
drop policy if exists tasks_insert_clinical_staff on public.care_tasks;
create policy tasks_insert_staff_scoped on public.care_tasks for insert to authenticated
  with check (created_by = auth.uid() and public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id)
    and (assigned_to is null or public.is_assignable_staff(assigned_to)));
drop policy if exists tasks_update_assignee_or_nurse_above on public.care_tasks;
create policy tasks_update_staff_scoped on public.care_tasks for update to authenticated
  using (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id))
  with check (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id));
drop policy if exists executions_insert_executor on public.task_executions;
drop policy if exists medications_insert_clinical_staff on public.medications;
create policy medications_insert_staff_scoped on public.medications for insert to authenticated
  with check (created_by = auth.uid() and public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id));
drop policy if exists medications_update_clinical_staff on public.medications;
create policy medications_update_staff_scoped on public.medications for update to authenticated
  using (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id))
  with check (public.has_active_profile() and public.current_user_role() in ('admin','nurse_jefe','medico') and public.can_access_resident(resident_id));
drop policy if exists administrations_insert_administrator on public.medication_administrations;

-- Resident access assignments are administered only by an admin.
create policy resident_access_admin_select on public.resident_user_access for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy resident_access_admin_insert on public.resident_user_access for insert to authenticated with check (public.is_admin());
create policy resident_access_admin_update on public.resident_user_access for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy resident_access_admin_delete on public.resident_user_access for delete to authenticated using (public.is_admin());

-- Access log writes are not client-authorable; only server/admin tooling may insert.
drop policy if exists access_logs_insert_any_authenticated on public.access_logs;

-- Keep execution and task state in one transaction: a failed execution insert
-- cannot leave a task status changed, and direct valid inserts stay coherent.
create or replace function public.sync_task_status_from_execution()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.care_tasks set status = new.outcome where id = new.task_id;
  return new;
end;
$$;
drop trigger if exists trg_sync_task_status_from_execution on public.task_executions;
create trigger trg_sync_task_status_from_execution
  after insert on public.task_executions
  for each row execute function public.sync_task_status_from_execution();
revoke all on function public.sync_task_status_from_execution() from public, anon, authenticated;

-- Record clinical row changes inside the same transaction, without allowing
-- clients to forge access_log entries or recording clinical field contents.
create or replace function public.audit_clinical_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  entity_id_value uuid;
  action_value text;
begin
  entity_id_value := (to_jsonb(new) ->> 'id')::uuid;
  action_value := lower(tg_table_name) || '.' || lower(tg_op);
  insert into public.access_logs(user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), action_value, tg_table_name, entity_id_value,
      jsonb_build_object('source', 'postgres_trigger'));
  return new;
end;
$$;
revoke all on function public.audit_clinical_row_change() from public, anon, authenticated;
revoke all on function public.grant_creator_resident_access() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['residents','vgi_assessments','care_plans','care_tasks','task_executions','medications','medication_administrations'] loop
    execute format('drop trigger if exists trg_audit_%I on public.%I', table_name, table_name);
    execute format('create trigger trg_audit_%I after insert or update on public.%I for each row execute function public.audit_clinical_row_change()', table_name, table_name);
  end loop;
end;
$$;
