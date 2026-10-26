import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

// PostgreSQL WASM allows repeatable local SQL/RLS checks without Docker.
// Supabase Auth and extensions are deliberately stubbed; this is not staging.
const db = new PGlite({ extensions: { pgcrypto } })
const users = {
  admin: '00000000-0000-4000-8000-000000000001',
  jefe: '00000000-0000-4000-8000-000000000002',
  medico: '00000000-0000-4000-8000-000000000004',
  enfermeria: '10000000-0000-4000-8000-000000000004',
  auxiliar: '00000000-0000-4000-8000-000000000003',
  auxiliarOtro: '10000000-0000-4000-8000-000000000006',
  familiar: '10000000-0000-4000-8000-000000000007',
}
const residents = {
  uno: '20000000-0000-4000-8000-000000000001',
  dos: '20000000-0000-4000-8000-000000000002',
}
const tasks = {
  asignada: '30000000-0000-4000-8000-000000000001',
  ajena: '30000000-0000-4000-8000-000000000002',
}
const medication = '40000000-0000-4000-8000-000000000001'

before(async () => {
  await db.exec('create extension pgcrypto')
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      deleted_at timestamptz,
      email_confirmed_at timestamptz,
      confirmation_token text default '',
      confirmation_sent_at timestamptz,
      recovery_token text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      encrypted_password text default '',
      instance_id uuid default '00000000-0000-0000-0000-000000000000',
      aud text default 'authenticated',
      role text default 'authenticated',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      authentication_method text,
      provider text
    );
    create table auth.identities (
      id uuid primary key default gen_random_uuid(),
      identity_id uuid,
      user_id uuid not null,
      provider_id text not null,
      provider text not null,
      identity_data jsonb not null default '{}'::jsonb,
      last_sign_in_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(provider_id, provider)
    );
    create table auth.mfa_factors (id uuid primary key, user_id uuid not null);
    create table auth.mfa_challenges (id uuid primary key, factor_id uuid not null);
    create table auth.refresh_tokens (id uuid primary key, user_id uuid not null);
    create table auth.sessions (id uuid primary key, user_id uuid not null);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.uuid_generate_v4() returns uuid language sql volatile as $$
      select gen_random_uuid()
    $$;
  `)

  const migrationNames = [
    '001_initial_schema.sql',
    '002_fase4_care_plan_rpc.sql',
    '003_fase5_report_indexes.sql',
    '004_fase6_task_recurrence.sql',
      '005_fix_seed_email_confirmation.sql',
      '006_fix_grants_identities_roles.sql',
      '007_comprehensive_auth_fix.sql',
      '008_final_auth_fix.sql',
    '009_add_enfermeria_familiar_roles.sql',
    '010_resident_scoped_access.sql',
  ]
  for (const name of migrationNames) {
    let sql = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
    sql = sql.replace(/^create extension if not exists .*;\s*$/gim, '')
    // Migration 001 seeds real demo users with pgcrypto. Tests use synthetic rows.
    if (name === '001_initial_schema.sql') {
      const seedStart = sql.indexOf('-- 8. Datos semilla de prueba')
      assert.notEqual(seedStart, -1, 'seed block marker exists before omitting demo rows')
      sql = sql.slice(0, seedStart)
    }
    if (name === '010_resident_scoped_access.sql') {
      // Model the broad ACLs introduced by remote migrations 006–008 before
      // checking that 010 removes the grants it is responsible for repairing.
      await db.exec(`
        grant all privileges on all tables in schema public to authenticated, service_role;
        grant all privileges on all sequences in schema public to authenticated, service_role;
        grant execute on all functions in schema public to authenticated, service_role;
        alter default privileges in schema public grant all privileges on tables to authenticated, service_role;
        alter default privileges in schema public grant all privileges on sequences to authenticated, service_role;
        alter default privileges in schema public grant execute on functions to authenticated, service_role;
      `)
    }
    await db.exec(sql)
  }

  await db.exec(`
    insert into auth.users (id) values
      ('${users.admin}'), ('${users.jefe}'), ('${users.medico}'),
      ('${users.enfermeria}'), ('${users.auxiliar}'), ('${users.auxiliarOtro}'),
      ('${users.familiar}') on conflict (id) do nothing;
    update public.profiles set full_name = case id
      when '${users.admin}' then 'Admin prueba'
      when '${users.jefe}' then 'Jefe prueba'
      when '${users.medico}' then 'Médico prueba'
      when '${users.enfermeria}' then 'Enfermería prueba'
      when '${users.auxiliar}' then 'Auxiliar prueba'
      when '${users.auxiliarOtro}' then 'Auxiliar otro'
      when '${users.familiar}' then 'Familiar prueba' end,
      role = case id
      when '${users.admin}' then 'admin'::public.user_role
      when '${users.jefe}' then 'nurse_jefe'::public.user_role
      when '${users.medico}' then 'medico'::public.user_role
      when '${users.enfermeria}' then 'enfermeria'::public.user_role
      when '${users.auxiliar}' then 'auxiliar'::public.user_role
      when '${users.auxiliarOtro}' then 'auxiliar'::public.user_role
      when '${users.familiar}' then 'familiar'::public.user_role end;
    insert into public.residents (id, first_name, last_name, birth_date, gender, created_by) values
      ('${residents.uno}', 'Ana', 'Prueba', '1945-05-10', 'femenino', '${users.medico}'),
      ('${residents.dos}', 'Luis', 'Ejemplo', '1940-03-12', 'masculino', '${users.admin}');
    insert into public.resident_user_access (resident_id, user_id, access_kind, created_by) values
      ('${residents.uno}', '${users.medico}', 'care', '${users.admin}'),
      ('${residents.uno}', '${users.enfermeria}', 'care', '${users.admin}'),
      ('${residents.uno}', '${users.auxiliar}', 'care', '${users.admin}'),
      ('${residents.dos}', '${users.auxiliarOtro}', 'care', '${users.admin}'),
      ('${residents.uno}', '${users.familiar}', 'family', '${users.admin}');
    insert into public.care_tasks
      (id, resident_id, task_type, title, scheduled_time, assigned_to, created_by)
    values
      ('${tasks.asignada}', '${residents.uno}', 'higiene', 'Tarea asignada', '08:00', '${users.auxiliar}', '${users.medico}'),
      ('${tasks.ajena}', '${residents.dos}', 'higiene', 'Tarea de otra persona', '08:00', '${users.auxiliarOtro}', '${users.admin}');
    insert into public.medications (id, resident_id, name, dosage, created_by)
    values ('${medication}', '${residents.uno}', 'Medicamento de prueba', '1 unidad', '${users.medico}');
  `)
})

after(async () => db.close())

async function asUser(userId, callback) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false)`)
  try {
    return await callback()
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)")
  }
}

test('la secuencia 001–010 aplica en PostgreSQL aislado con Auth simulado', async () => {
  const result = await db.query(`
    select to_regclass('public.resident_user_access') is not null as access_table,
           (select count(*) from pg_policies where schemaname = 'public') as policies,
           (select count(*) from auth.users where email like '%@gericare.test') as seed_users,
           (select count(*) from auth.identities i join auth.users u on u.id = i.user_id
             where u.email like '%@gericare.test' and i.provider = 'email') as seed_identities,
           (select count(*) from auth.users where email like '%@gericare.test'
             and email_confirmed_at is not null) as confirmed_seed_users
  `)
  assert.equal(result.rows[0].access_table, true)
  assert.ok(Number(result.rows[0].policies) >= 20)
  assert.equal(Number(result.rows[0].seed_users), 4)
  assert.equal(Number(result.rows[0].seed_identities), 4)
  assert.equal(Number(result.rows[0].confirmed_seed_users), 4)
})

test('médico, enfermería y auxiliar ven solo residentes vinculados; jefe tiene alcance operativo global', async () => {
  for (const role of ['medico', 'enfermeria', 'auxiliar']) {
    const result = await asUser(users[role], () => db.query('select id from public.residents order by id'))
    assert.deepEqual(result.rows.map((row) => row.id), [residents.uno])
  }
  const jefe = await asUser(users.jefe, () => db.query('select id from public.residents order by id'))
  assert.equal(jefe.rows.length, 2)
  const admin = await asUser(users.admin, () => db.query('select id from public.residents order by id'))
  assert.equal(admin.rows.length, 2)
})

test('el médico creador recibe asignación revocable y deja de ver el residente al retirarla', async () => {
  const residentId = '20000000-0000-4000-8000-000000000003'
  await asUser(users.medico, () => db.query(`
    insert into public.residents (id, first_name, last_name, birth_date, gender, created_by)
    values ($1, 'Elena', 'Nueva', '1942-02-20', 'femenino', $2)
  `, [residentId, users.medico]))

  const visible = await asUser(users.medico, () => db.query('select id from public.residents where id = $1', [residentId]))
  assert.deepEqual(visible.rows, [{ id: residentId }])
  await asUser(users.admin, () => db.query(
    'select public.admin_set_resident_access($1, $2, $3, $4)',
    [residentId, users.medico, 'care', false],
  ))
  const revoked = await asUser(users.medico, () => db.query('select id from public.residents where id = $1', [residentId]))
  assert.deepEqual(revoked.rows, [])
})

test('el rol anon no puede consultar datos ni invocar RPCs internos', async () => {
  await db.exec('set role anon')
  try {
    await assert.rejects(() => db.query('select id from public.residents'), /permission denied/i)
    await assert.rejects(() => db.query('select public.record_auth_event($1)', ['auth.login']), /permission denied/i)
  } finally {
    await db.exec('reset role')
  }
})

test('los grants de funciones quedan en lista permitida tras los grants históricos amplios', async () => {
  const acl = await db.query(`
    select has_function_privilege('authenticated', 'public.update_updated_at_column()', 'EXECUTE') as trigger_function,
           has_function_privilege('authenticated', 'public.record_task_execution(uuid,public.task_status,text,jsonb)', 'EXECUTE') as task_rpc,
           has_function_privilege('anon', 'public.record_task_execution(uuid,public.task_status,text,jsonb)', 'EXECUTE') as anon_task_rpc,
           has_function_privilege('authenticated', 'public.uuid_generate_v4()', 'EXECUTE') as uuid_default
  `)
  assert.equal(acl.rows[0].trigger_function, false)
  assert.equal(acl.rows[0].task_rpc, true)
  assert.equal(acl.rows[0].anon_task_rpc, false)
  assert.equal(acl.rows[0].uuid_default, true)
})

test('familiar recibe solo el resumen vinculado y no puede leer tablas clínicas directamente', async () => {
  const summary = await asUser(users.familiar, () => db.query('select id, first_name from public.get_linked_resident_summaries()'))
  assert.deepEqual(summary.rows, [{ id: residents.uno, first_name: 'Ana' }])
  const residentsDirect = await asUser(users.familiar, () => db.query('select id from public.residents'))
  assert.deepEqual(residentsDirect.rows, [])
  const medsDirect = await asUser(users.familiar, () => db.query('select id from public.medications'))
  assert.deepEqual(medsDirect.rows, [])
})

test('perfil propio es visible, el cambio directo de roles queda bloqueado y admin usa la RPC', async () => {
  const own = await asUser(users.auxiliar, () => db.query('select id from public.profiles'))
  assert.deepEqual(own.rows, [{ id: users.auxiliar }])
  await assert.rejects(
    () => asUser(users.auxiliar, () => db.exec(`update public.profiles set role = 'admin' where id = '${users.auxiliar}'`)),
    /permission denied|row-level security/i,
  )
  await assert.rejects(
    () => asUser(users.admin, () => db.query(
      'select public.admin_set_profile_role($1, $2::public.user_role)',
      [users.admin, 'auxiliar'],
    )),
    /cannot demote the last active admin|23514/i,
  )
  await asUser(users.admin, () => db.query(
    'select public.admin_set_profile_role($1, $2::public.user_role)',
    [users.auxiliarOtro, 'enfermeria'],
  ))
  const changed = await db.query('select role::text from public.profiles where id = $1', [users.auxiliarOtro])
  assert.equal(changed.rows[0].role, 'enfermeria')
})

test('eventos de sesión solo permiten login/logout y el actor siempre viene de auth.uid()', async () => {
  await assert.rejects(
    () => asUser(users.auxiliar, () => db.query('select public.record_auth_event($1)', ['profiles.delete'])),
    /invalid auth event|22023/i,
  )
  await asUser(users.familiar, () => db.query('select public.record_auth_event($1)', ['auth.login']))
  const audit = await db.query("select user_id, action from public.access_logs where action = 'auth.login'")
  assert.deepEqual(audit.rows, [{ user_id: users.familiar, action: 'auth.login' }])
})

test('RPC registra tareas solo al usuario asignado y sincroniza estado/auditoría en transacción', async () => {
  await assert.rejects(
    () => asUser(users.auxiliar, () => db.query(
      'select public.record_task_execution($1, $2::public.task_status, $3, $4::jsonb)',
      [tasks.ajena, 'completada', '', '{}'],
    )),
    /task not assigned|42501/i,
  )
  const before = await db.query('select count(*)::int as count from public.task_executions')
  assert.equal(before.rows[0].count, 0)
  await asUser(users.auxiliar, () => db.query(
    'select public.record_task_execution($1, $2::public.task_status, $3, $4::jsonb)',
    [tasks.asignada, 'completada', 'Hecho', '{"frecuencia_cardiaca":72}'],
  ))
  const task = await db.query('select status::text from public.care_tasks where id = $1', [tasks.asignada])
  assert.equal(task.rows[0].status, 'completada')
  const audit = await db.query("select count(*)::int as count from public.access_logs where action = 'task_executions.insert' and user_id = $1", [users.auxiliar])
  assert.equal(audit.rows[0].count, 1)
})

test('solo enfermería, jefatura y admin pueden administrar medicación dentro de su alcance', async () => {
  await assert.rejects(
    () => asUser(users.auxiliar, () => db.query(
      'select public.record_medication_administration($1, $2, $3::public.medication_route, $4)',
      [medication, '1 unidad', 'oral', 'administrada'],
    )),
    /role cannot administer medication|42501/i,
  )
  await asUser(users.enfermeria, () => db.query(
    'select public.record_medication_administration($1, $2, $3::public.medication_route, $4)',
    [medication, '1 unidad', 'oral', 'administrada'],
  ))
  const count = await db.query('select count(*)::int as count from public.medication_administrations')
  assert.equal(count.rows[0].count, 1)
})
