-- Plano de treino (fase 1): respostas do formulário e planos aceitos.
-- Espelha src/domain/training-profile.ts, src/domain/training-proposal.ts e o reducer (training.saveProfile /
-- training.applyPlan).
--
-- Decisões:
--  * A PROPOSTA em revisão vive só no aparelho; só o plano ACEITO chega aqui. Gerar ou trocar exercícios não grava
--    nada; aceitar é um único comando atômico.
--  * Respostas do formulário: UMA linha por pessoa (refazer as perguntas substitui). Limitações (dor, lesão) são dado de
--    saúde: só existem com o instante do consentimento, e a triagem guarda só o RESULTADO, nunca as respostas
--    (docs/avaliacao-lgpd.md). O banco normaliza como o app (listas sem repetição, em ordem fixa).
--  * Plano aceito: colunas para o que o banco precisa entender (id, instante, origem) e um documento (`details`, jsonb,
--    até 32 KB) com o resto, validado pelo app ao entrar e ao sair. É imutável: o próximo plano é outra linha.
--  * `training.applyPlan` reaproveita os comandos de exercício e de ficha (mesmas regras e mensagens) dentro da mesma
--    transação: se um passo falha, nada fica gravado.
--  * `schemaVersion` sobe para 17: o app novo recusa abrir num banco sem esta migração.
--
-- Ordem de implantação (ver docs/setup-supabase.md): aplique esta migração ANTES de publicar a versão do app com o
-- plano de treino. Ela é aditiva e a versão antiga do app continua funcionando com ela aplicada.

/* ---------- tabelas ---------- */

create table public.training_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goal text not null check (goal in ('massa', 'forca', 'saude', 'emagrecer')),
  experience text not null check (experience in ('iniciante', 'intermediario', 'avancado')),
  days_per_week smallint not null check (days_per_week between 2 and 6),
  session_minutes smallint not null check (session_minutes in (30, 45, 60, 75)),
  location text not null check (location in ('academia', 'casa-halteres')),
  limitations text[] not null default '{}'
    check (limitations <@ array['ombro', 'cotovelo', 'punho', 'lombar', 'quadril', 'joelho', 'tornozelo']::text[]),
  screening text not null check (screening in ('liberado', 'liberacao-medica', 'nao-respondida')),
  health_consent_at timestamptz,
  priorities text[] not null default '{}'
    check (priorities <@ array['peito', 'costas', 'ombros', 'bracos', 'pernas', 'gluteos']::text[] and cardinality(priorities) <= 2),
  notes text check (notes is null or char_length(notes) between 1 and 280),
  updated_at timestamptz not null,
  -- Dado de saúde só com consentimento: quem pulou a parte de saúde não tem consentimento nem limitações guardadas.
  check ((screening = 'nao-respondida') = (health_consent_at is null)),
  check (screening <> 'nao-respondida' or cardinality(limitations) = 0)
);

create table public.training_plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  accepted_at timestamptz not null,
  source text not null check (source in ('ai', 'rules')),
  details jsonb not null check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 32768),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index training_plans_user_idx on public.training_plans (user_id, accepted_at, id);

alter table public.training_profiles enable row level security;
create policy "training_profiles: dono" on public.training_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.training_plans enable row level security;
create policy "training_plans: dono" on public.training_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Tabelas novas nascem abertas no Supabase: fecha tudo e concede só o necessário (mesmo padrão de 0010, 0013 e 0015).
-- Respostas: substituídas, nunca apagadas (sem DELETE; a exclusão da conta apaga em cascata). Plano aceito: imutável.
revoke all on public.training_profiles from public, anon, authenticated;
grant select, insert, update on public.training_profiles to authenticated;
revoke all on public.training_plans from public, anon, authenticated;
grant select, insert on public.training_plans to authenticated;

/* ---------- comandos ---------- */

-- Mesma normalização de `normalizeProfile`: listas sem repetição e na ordem fixa, no máximo 2 prioridades, texto sem
-- espaços sobrando e, para quem pulou a parte de saúde, nenhuma limitação nem consentimento.
create function private.cmd_training_save_profile(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  f jsonb := p -> 'profile';
  v_answered boolean := (f ->> 'screening') <> 'nao-respondida';
  v_limitations text[];
  v_priorities text[];
  v_consent timestamptz;
  v_notes text := nullif(regexp_replace(btrim(coalesce(f ->> 'notes', '')), '\s+', ' ', 'g'), '');
begin
  v_limitations := case when v_answered then array(
    select c.v
    from unnest(array['ombro', 'cotovelo', 'punho', 'lombar', 'quadril', 'joelho', 'tornozelo']) with ordinality as c(v, n)
    where c.v in (select jsonb_array_elements_text(coalesce(f -> 'limitations', '[]'::jsonb)))
    order by c.n
  ) else '{}'::text[] end;
  v_priorities := (array(
    select c.v
    from unnest(array['peito', 'costas', 'ombros', 'bracos', 'pernas', 'gluteos']) with ordinality as c(v, n)
    where c.v in (select jsonb_array_elements_text(coalesce(f -> 'priorities', '[]'::jsonb)))
    order by c.n
  ))[1:2];
  v_consent := case when v_answered and f ->> 'healthConsentAt' is not null
    then to_timestamp((f ->> 'healthConsentAt')::bigint / 1000.0) end;

  -- Mesma mensagem do reducer; os CHECKs da tabela são só a última defesa.
  if v_answered and v_consent is null then
    raise exception 'Confirme o consentimento antes das perguntas de saúde.' using errcode = '23514';
  end if;

  insert into public.training_profiles (
    user_id, goal, experience, days_per_week, session_minutes, location, limitations, screening,
    health_consent_at, priorities, notes, updated_at
  ) values (
    (select auth.uid()), f ->> 'goal', f ->> 'experience', (f ->> 'daysPerWeek')::smallint,
    (f ->> 'sessionMinutes')::smallint, f ->> 'location', v_limitations, f ->> 'screening',
    v_consent, coalesce(v_priorities, '{}'::text[]), v_notes, to_timestamp((f ->> 'updatedAt')::bigint / 1000.0)
  )
  on conflict (user_id) do update set
    goal = excluded.goal,
    experience = excluded.experience,
    days_per_week = excluded.days_per_week,
    session_minutes = excluded.session_minutes,
    location = excluded.location,
    limitations = excluded.limitations,
    screening = excluded.screening,
    health_consent_at = excluded.health_consent_at,
    priorities = excluded.priorities,
    notes = excluded.notes,
    updated_at = excluded.updated_at;
  return private.outcome('saved');
end
$$;

-- Aceitar um plano, numa transação só: exercícios novos -> fichas novas -> fichas arquivadas -> registro do plano.
-- Cada passo é o próprio comando avulso (mesmas regras e mensagens); a primeira exceção desfaz tudo.
create function private.cmd_training_apply_plan(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  r jsonb := p -> 'record';
  v_id uuid := (r ->> 'id')::uuid;
  x jsonb;
begin
  -- Já aceito (toque duplo, nova tentativa depois de uma resposta perdida): nada muda.
  if exists (select 1 from public.training_plans where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;

  -- O registro precisa descrever exatamente as fichas criadas por este comando (mesma regra do reducer).
  if jsonb_path_query_array(r, '$.days[*].planId') is distinct from jsonb_path_query_array(p, '$.plans[*].id')
     or exists (
       select 1 from jsonb_array_elements_text(coalesce(p -> 'archivePlanIds', '[]'::jsonb)) a(v)
       where to_jsonb(a.v) in (select jsonb_array_elements(jsonb_path_query_array(p, '$.plans[*].id')))
     )
     or exists (
       select 1
       from jsonb_array_elements(r -> 'days') with ordinality d(day, i)
       join jsonb_array_elements(p -> 'plans') with ordinality pl(plan, j) on d.i = pl.j
       where jsonb_path_query_array(d.day, '$.exercises[*].exerciseId')
         is distinct from jsonb_path_query_array(pl.plan, '$.exercises[*].exerciseId')
     ) then
    raise exception 'Plano inconsistente com as fichas.' using errcode = '22023';
  end if;

  for x in select value from jsonb_array_elements(coalesce(p -> 'exercises', '[]'::jsonb)) loop
    perform private.cmd_exercise_add(jsonb_build_object('type', 'exercise.add', 'exercise', x));
  end loop;
  for x in select value from jsonb_array_elements(p -> 'plans') loop
    perform private.cmd_plan_save(jsonb_build_object('type', 'plan.save', 'plan', x));
  end loop;
  for x in select value from jsonb_array_elements(coalesce(p -> 'archivePlanIds', '[]'::jsonb)) loop
    perform private.cmd_plan_archive(jsonb_build_object('type', 'plan.archive', 'id', x #>> '{}', 'archived', true));
  end loop;

  insert into public.training_plans (id, accepted_at, source, details)
  values (v_id, to_timestamp((r ->> 'acceptedAt')::bigint / 1000.0), r ->> 'source', r - 'id' - 'acceptedAt' - 'source')
  on conflict (id) do nothing;

  -- Colisão com o id de um plano de OUTRA pessoa: falha em vez de fingir que salvou.
  if not exists (select 1 from public.training_plans where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Este identificador de plano já está em uso.' using errcode = '23505';
  end if;
  return private.outcome('saved');
end
$$;

/* ---------- despachante (versão completa, agora com o plano de treino) ---------- */

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
    when 'water.add' then private.cmd_water_add(p_command)
    when 'water.remove' then private.cmd_water_remove(p_command)
    when 'training.saveProfile' then private.cmd_training_save_profile(p_command)
    when 'training.applyPlan' then private.cmd_training_apply_plan(p_command)
  end;

  if v_out is null then
    raise exception 'Comando desconhecido: %', coalesce(v_type, '(vazio)') using errcode = '22023';
  end if;
  return v_out;
end
$$;

/* ---------- snapshot (versão completa, agora com o plano de treino) ---------- */

create or replace function public.get_snapshot() returns jsonb
language sql security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'serverNow', private.epoch_ms(private.app_now()),
    -- Versão do esquema: o app exige a sua (16: "como foi?" e biblioteca; 17: plano de treino).
    'schemaVersion', 17,

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
        'libraryKey', e.library_key, 'archived', e.archived_at is not null
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
        'occurredOn', s.occurred_on, 'notes', s.notes, 'effort', s.effort,
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
    ), '[]'::jsonb),

    -- `at` em milissegundos (epoch), como os demais instantes do snapshot.
    'waterIntakes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wi.id, 'at', private.epoch_ms(wi.occurred_at), 'ml', wi.ml
      ) order by wi.occurred_at, wi.id)
      from public.water_intakes wi where wi.user_id = (select auth.uid())
    ), '[]'::jsonb),

    -- Instantes em ms (epoch). Consentimento ausente vira null (o servidor converte em "ausente").
    'trainingProfile', (
      select jsonb_build_object(
        'goal', tp.goal, 'experience', tp.experience, 'daysPerWeek', tp.days_per_week,
        'sessionMinutes', tp.session_minutes, 'location', tp.location, 'limitations', to_jsonb(tp.limitations),
        'screening', tp.screening, 'healthConsentAt', private.epoch_ms(tp.health_consent_at),
        'priorities', to_jsonb(tp.priorities), 'notes', tp.notes, 'updatedAt', private.epoch_ms(tp.updated_at)
      )
      from public.training_profiles tp where tp.user_id = (select auth.uid())
    ),

    -- O detalhe do plano é um documento; as colunas (id, instante, origem) têm a palavra final.
    'trainingPlans', coalesce((
      select jsonb_agg(
        tr.details || jsonb_build_object('id', tr.id, 'acceptedAt', private.epoch_ms(tr.accepted_at), 'source', tr.source)
        order by tr.accepted_at, tr.id
      )
      from public.training_plans tr where tr.user_id = (select auth.uid())
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
    where n.nspname = 'private' and p.proname like 'cmd\_training\_%'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
