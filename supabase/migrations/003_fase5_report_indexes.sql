-- =====================================================================
-- GeriCare · Fase 5 — Índices de apoyo para reportes, auditoría y alertas
--
-- Las consultas agregadas de `getDashboardMetrics`, `getAuditLogs` y el
-- AlertBanner filtran por fecha/estado/resultado. Estos índices evitan
-- secuenciales completas sobre tablas que crecen con la bitácora diaria.
-- =====================================================================

-- Auditoría: rango de fechas global y filtro por entidad/acción.
create index if not exists idx_access_logs_created
  on public.access_logs (created_at desc);

create index if not exists idx_access_logs_action
  on public.access_logs (action, created_at desc);

-- Bitácora de tareas: conteos del día y adherencia por periodo.
create index if not exists idx_task_executions_executed
  on public.task_executions (executed_at desc);

create index if not exists idx_task_executions_outcome
  on public.task_executions (outcome, executed_at desc);

-- DURO: administraciones del día y reacciones adversas.
create index if not exists idx_med_admin_executed
  on public.medication_administrations (administered_at desc);

create index if not exists idx_med_admin_adverse
  on public.medication_administrations (adverse_reaction, administered_at desc)
  where adverse_reaction = true;

-- Agenda diaria: tareas vigentes por estado + ventana de validez.
create index if not exists idx_care_tasks_agenda
  on public.care_tasks (status, effective_from, scheduled_time);

-- Medicaciones activas por horario (pase farmacológico).
create index if not exists idx_medications_active_schedule
  on public.medications (active, start_date, end_date)
  where active = true;

-- VGI: última valoración por residente (top-N por riesgo).
create index if not exists idx_vgi_resident_fecha
  on public.vgi_assessments (resident_id, assessment_date desc, frailty_level);
