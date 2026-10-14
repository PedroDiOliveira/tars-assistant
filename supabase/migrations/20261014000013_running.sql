-- Corrida: acompanhamento de corridas realizadas, independente da musculação.
-- Espelha src/domain/running.ts e o reducer (running.addSession / updateSession / deleteSession).
--
-- Decisões:
--  * Uma linha = uma corrida. Várias no mesmo dia são permitidas (não há unicidade por data).
--  * Distância em METROS inteiros e duração em SEGUNDOS inteiros, ambas OPCIONAIS: NULL = "não informado",
--    nunca zero. Presentes, são sempre positivas.
--  * O ritmo NÃO é guardado: é calculado a partir de distância e duração.
--  * Meta semanal de distância = goal_kind 'running_meters' (metros), pelo mesmo mecanismo de vigência das outras.
--  * Data futura é recusada AQUI, no banco, com o relógio e o fuso do servidor (private.app_now / app_tz): o
--    horário do cliente nunca decide. Fica num gatilho para valer também fora dos comandos.
--
-- Ordem de implantação (ver docs/setup-supabase.md): aplique esta migração ANTES de publicar a versão do app
-- que usa corridas. Ela é aditiva e a versão antiga do app continua funcionando com ela aplicada.

/* ---------- tipo de meta ---------- */

-- O valor novo só pode ser USADO depois do commit desta migração; por isso nada aqui o referencia como literal
-- (as funções abaixo comparam em tempo de execução, quando o valor já existe).
alter type public.goal_kind add value if not exists 'running_meters';

/* ---------- tabela ---------- */

create table public.running_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_on public.business_date not null,
  -- metros inteiros; teto de 500 km por corrida (MAX_DISTANCE_METERS no domínio)
  distance_meters integer check (distance_meters is null or distance_meters between 1 and 500000),
  -- segundos inteiros; teto de 24 h (MAX_RUN_SECONDS no domínio)
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  notes text check (notes is null or char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index running_sessions_user_date_idx on public.running_sessions (user_id, occurred_on desc, id);
create trigger running_sessions_updated_at before update on public.running_sessions
  for each row execute function private.set_updated_at();

-- Uma corrida é uma atividade REALIZADA: não pode estar no futuro (dia de hoje no fuso do app, não em UTC).
-- Ao editar, só mover a data para o futuro é recusado; corrigir distância ou observação de uma corrida que já
-- existe não depende do relógio.
create function private.running_session_not_future() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Corrigir distância/observação sem mexer na data nunca depende do relógio.
  if tg_op = 'UPDATE' and new.occurred_on = old.occurred_on then
    return new;
  end if;
  if new.occurred_on > (private.app_now() at time zone public.app_tz())::date then
    raise exception 'Não é possível registrar uma corrida em uma data futura.' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger running_sessions_not_future before insert or update on public.running_sessions
  for each row execute function private.running_session_not_future();

alter table public.running_sessions enable row level security;
create policy "running_sessions: dono" on public.running_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Tabelas novas nascem abertas no Supabase: fecha tudo e concede só o necessário (mesmo padrão de 0010 e 0012).
revoke all on public.running_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.running_sessions to authenticated;

-- O gatilho dispara sem que o usuário precise poder executar a função; ela não é uma API.
revoke all on function private.running_session_not_future() from public, anon, authenticated;

/* ---------- comandos ---------- */

-- Repetir o mesmo id (toque duplo, nova tentativa depois de uma resposta perdida) responde "saved" sem duplicar.
-- O ON CONFLICT cobre duas requisições simultâneas com o mesmo id; se a linha que colidiu NÃO é do usuário
-- (id de outra pessoa), o comando falha em vez de fingir que salvou.
create function private.cmd_running_add_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  s jsonb := p -> 'session';
  v_id uuid := (s ->> 'id')::uuid;
begin
  if exists (select 1 from public.running_sessions where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;

  insert into public.running_sessions (id, occurred_on, distance_meters, duration_seconds, notes)
  values (
    v_id,
    (s ->> 'occurredOn')::public.business_date,
    (s ->> 'distanceMeters')::integer,
    (s ->> 'durationSeconds')::integer,
    nullif(s ->> 'notes', '')
  )
  on conflict (id) do nothing;

  if not exists (select 1 from public.running_sessions where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Este identificador de corrida já está em uso.' using errcode = '23505';
  end if;
  return private.outcome('saved');
end
$$;

-- Substitui TODOS os campos (não é um patch): distância, duração ou observação omitidas voltam a "não informado".
create function private.cmd_running_update_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  f jsonb := p -> 'fields';
begin
  if not exists (select 1 from public.running_sessions where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Corrida não encontrada.' using errcode = 'P0002';
  end if;
  update public.running_sessions set
    occurred_on = (f ->> 'occurredOn')::public.business_date,
    distance_meters = (f ->> 'distanceMeters')::integer,
    duration_seconds = (f ->> 'durationSeconds')::integer,
    notes = nullif(f ->> 'notes', '')
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_running_delete_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.running_sessions
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- despachante (versão completa, agora com corrida) ---------- */

create or replace function public.apply_command(p_command jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_type text := p_command ->> 'type';
  v_out jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  v_out := case v_type
    when 'transaction.add' then private.cmd_transaction_add(p_command)
    when 'transaction.update' then private.cmd_transaction_update(p_command)
    when 'transaction.delete' then private.cmd_transaction_delete(p_command)
    when 'template.add' then private.cmd_template_add(p_command)
    when 'template.delete' then private.cmd_template_delete(p_command)
    when 'goal.set' then private.cmd_goal_set(p_command)
    when 'workout.finish' then private.cmd_workout_finish(p_command)
    when 'workout.deleteSession' then private.cmd_workout_delete_session(p_command)
    when 'study.start' then private.cmd_study_start(p_command)
    when 'study.pause' then private.cmd_study_pause(p_command)
    when 'study.resume' then private.cmd_study_resume(p_command)
    when 'study.finish' then private.cmd_study_finish(p_command)
    when 'study.discard' then private.cmd_study_discard(p_command)
    when 'studySession.add' then private.cmd_study_session_add(p_command)
    when 'studySession.update' then private.cmd_study_session_update(p_command)
    when 'studySession.delete' then private.cmd_study_session_delete(p_command)
    when 'subject.add' then private.cmd_subject_add(p_command)
    when 'subject.update' then private.cmd_subject_update(p_command)
    when 'subject.archive' then private.cmd_subject_archive(p_command)
    when 'category.add' then private.cmd_category_add(p_command)
    when 'category.update' then private.cmd_category_update(p_command)
    when 'category.archive' then private.cmd_category_archive(p_command)
    when 'exercise.add' then private.cmd_exercise_add(p_command)
    when 'exercise.update' then private.cmd_exercise_update(p_command)
    when 'exercise.archive' then private.cmd_exercise_archive(p_command)
    when 'plan.save' then private.cmd_plan_save(p_command)
    when 'plan.archive' then private.cmd_plan_archive(p_command)
    when 'book.add' then private.cmd_book_add(p_command)
    when 'book.update' then private.cmd_book_update(p_command)
    when 'book.delete' then private.cmd_book_delete(p_command)
    when 'book.setStatus' then private.cmd_book_set_status(p_command)
    when 'reading.addSession' then private.cmd_reading_add_session(p_command)
    when 'reading.updateSession' then private.cmd_reading_update_session(p_command)
    when 'reading.deleteSession' then private.cmd_reading_delete_session(p_command)
    when 'running.addSession' then private.cmd_running_add_session(p_command)
    when 'running.updateSession' then private.cmd_running_update_session(p_command)
    when 'running.deleteSession' then private.cmd_running_delete_session(p_command)
  end;

  if v_out is null then
    raise exception 'Comando desconhecido: %', coalesce(v_type, '(vazio)') using errcode = '22023';
  end if;
  return v_out;
end
$$;

/* ---------- snapshot (versão completa, agora com corridas) ---------- */

create or replace function public.get_snapshot() returns jsonb
language sql security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'serverNow', private.epoch_ms(private.app_now()),

    'profile', (
      select jsonb_build_object('displayName', p.display_name)
      from public.profiles p where p.id = (select auth.uid())
    ),

    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'type', c.type, 'icon', c.icon, 'hue', c.hue,
        'archived', c.archived_at is not null
      ) order by c.type, c.created_at, c.id)
      from public.categories c where c.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'type', t.type, 'amountCents', t.amount_cents, 'categoryId', t.category_id,
        'description', t.description, 'occurredOn', t.occurred_on, 'source', t.source
      ) order by t.occurred_on desc, t.id)
      from public.transactions t where t.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'label', x.label, 'type', x.type, 'amountCents', x.amount_cents,
        'categoryId', x.category_id
      ) order by x.created_at, x.id)
      from public.tx_templates x where x.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'kind', g.kind, 'scopeId', coalesce(g.category_id, g.subject_id),
        'validFrom', g.valid_from, 'target', g.target
      ) order by g.valid_from, g.id)
      from public.goals g where g.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'muscleGroup', e.muscle_group, 'loadType', e.load_type,
        'archived', e.archived_at is not null
      ) order by e.created_at, e.id)
      from public.exercises e where e.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl.id, 'name', pl.name, 'notes', pl.notes, 'archived', pl.archived_at is not null,
        'exercises', coalesce((
          select jsonb_agg(jsonb_build_object(
            'exerciseId', pe.exercise_id, 'plannedSets', pe.planned_sets, 'repMin', pe.rep_min,
            'repMax', pe.rep_max, 'restSeconds', pe.rest_seconds
          ) order by pe.position)
          from public.workout_plan_exercises pe
          where pe.plan_id = pl.id and pe.user_id = pl.user_id
        ), '[]'::jsonb)
      ) order by pl.created_at, pl.id)
      from public.workout_plans pl where pl.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'planId', s.plan_id, 'nameSnapshot', s.name_snapshot,
        'startedAt', private.epoch_ms(s.started_at), 'finishedAt', private.epoch_ms(s.finished_at),
        'occurredOn', s.occurred_on, 'notes', s.notes,
        'exercises', coalesce((
          select jsonb_agg(jsonb_build_object(
            'exerciseId', se.exercise_id, 'nameSnapshot', se.name_snapshot, 'loadType', se.load_type,
            'plannedSets', se.planned_sets, 'repMin', se.rep_min, 'repMax', se.rep_max,
            'restSeconds', se.rest_seconds,
            'sets', coalesce((
              select jsonb_agg(jsonb_build_object(
                'weightKg', es.weight_kg, 'reps', es.reps, 'done', true
              ) order by es.set_number)
              from public.exercise_sets es
              where es.session_exercise_id = se.id and es.user_id = se.user_id
            ), '[]'::jsonb)
          ) order by se.position)
          from public.session_exercises se
          where se.session_id = s.id and se.user_id = s.user_id
        ), '[]'::jsonb)
      ) order by s.finished_at, s.id)
      from public.workout_sessions s where s.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'objective', u.objective, 'hue', u.hue,
        'archived', u.archived_at is not null
      ) order by u.created_at, u.id)
      from public.study_subjects u where u.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'studySessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ss.id, 'subjectId', ss.subject_id, 'source', ss.source, 'occurredOn', ss.occurred_on,
        'durationSeconds', ss.duration_seconds, 'notes', ss.notes
      ) order by ss.occurred_on, ss.id)
      from public.study_sessions ss where ss.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'timer', (
      select jsonb_build_object(
        'subjectId', tm.subject_id,
        'startedAt', private.epoch_ms(tm.started_at),
        'runningSince', case when tm.running_since is null then null
                             else private.epoch_ms(tm.running_since) end,
        'accumulatedSeconds', tm.accumulated_seconds
      )
      from public.study_timers tm where tm.user_id = (select auth.uid())
    ),

    'books', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'title', b.title, 'author', b.author, 'totalPages', b.total_pages,
        'initialPage', b.initial_page, 'status', b.status
      ) order by b.created_at, b.id)
      from public.books b where b.user_id = (select auth.uid())
    ), '[]'::jsonb),

    'readingSessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'bookId', r.book_id, 'occurredOn', r.occurred_on,
        'startPage', r.start_page, 'endPage', r.end_page, 'notes', r.notes
      ) order by r.occurred_on, r.id)
      from public.reading_sessions r where r.user_id = (select auth.uid())
    ), '[]'::jsonb),

    -- distância e duração NULL viram null no JSON (o servidor as converte em "ausente"); nunca zero.
    'runningSessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rs.id, 'occurredOn', rs.occurred_on, 'distanceMeters', rs.distance_meters,
        'durationSeconds', rs.duration_seconds, 'notes', rs.notes
      ) order by rs.occurred_on, rs.id)
      from public.running_sessions rs where rs.user_id = (select auth.uid())
    ), '[]'::jsonb)
  )
$$;

/* ---------- permissões das funções novas ---------- */

-- O PostgreSQL deixa PUBLIC executar funções novas por padrão: fechamos e abrimos só para quem está logado.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'cmd\_running\_%'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
