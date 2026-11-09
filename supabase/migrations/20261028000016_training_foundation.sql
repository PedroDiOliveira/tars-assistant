-- Treino, fase 0: base de dados para acompanhar a evolução (e, depois, para o plano de treino).
-- Espelha src/domain/exercise-library.ts, src/domain/workouts.ts (EFFORT_LABELS) e os reducers.
--
-- Decisões:
--  * `exercises.library_key`: vínculo OPCIONAL com a biblioteca de exercícios, que vive no código do app (lista fixa,
--    igual para todos), não no banco. O banco confere só o FORMATO da chave; a lista de chaves válidas é conferida pela
--    validação dos comandos (src/domain/command-schema.ts). Uma chave que um dia deixe de existir no app vira "sem
--    vínculo" na tela, sem quebrar nada. Os exercícios continuam sendo da pessoa (nome e grupo editáveis).
--  * `workout_sessions.effort`: o "como foi?" escolhido ao finalizar o treino (1 leve, 2 na medida, 3 pesado,
--    4 exaustivo). Opcional: NULL = finalizou sem avaliar. Não há comando novo; vai junto do `workout.finish`.
--  * Nada aqui é dado de saúde (dor e lesão ficam para depois, com consentimento próprio).
--  * Contas novas nascem com os exercícios iniciais já vinculados à biblioteca (seed_defaults).
--
-- Ordem de implantação (ver docs/setup-supabase.md): aplique esta migração ANTES de publicar a versão do app que a
-- usa. Ela é aditiva (duas colunas que aceitam NULL) e a versão antiga do app continua funcionando com ela aplicada.

/* ---------- colunas ---------- */

alter table public.exercises
  add column library_key text
  check (library_key is null or (char_length(library_key) <= 60 and library_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));

alter table public.workout_sessions
  add column effort smallint check (effort is null or effort between 1 and 4);

/* ---------- cadastro inicial (versão completa, agora com o vínculo) ---------- */

create or replace function private.seed_defaults(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- idempotente: se o usuário já tem catálogo, não duplica
  if exists (select 1 from public.categories where user_id = p_user_id) then
    return;
  end if;

  insert into public.categories (id, user_id, name, type, icon, hue) values
    (gen_random_uuid(), p_user_id, 'Alimentação', 'expense', 'utensils', 100),
    (gen_random_uuid(), p_user_id, 'Transporte',  'expense', 'car',      178),
    (gen_random_uuid(), p_user_id, 'Moradia',     'expense', 'home',     140),
    (gen_random_uuid(), p_user_id, 'Saúde',       'expense', 'heart',    118),
    (gen_random_uuid(), p_user_id, 'Lazer',       'expense', 'fun',      162),
    (gen_random_uuid(), p_user_id, 'Compras',     'expense', 'bag',      186),
    (gen_random_uuid(), p_user_id, 'Educação',    'expense', 'school',   128),
    (gen_random_uuid(), p_user_id, 'Outros',      'expense', 'dots',     150),
    (gen_random_uuid(), p_user_id, 'Salário',     'income',  'wage',     150),
    (gen_random_uuid(), p_user_id, 'Outros',      'income',  'plus',     170);

  insert into public.exercises (id, user_id, name, muscle_group, load_type, library_key) values
    (gen_random_uuid(), p_user_id, 'Supino reto',                  'Peito',   'external', 'supino-reto-barra'),
    (gen_random_uuid(), p_user_id, 'Supino inclinado com halteres', 'Peito',   'external', 'supino-inclinado-halteres'),
    (gen_random_uuid(), p_user_id, 'Crucifixo',                    'Peito',   'external', 'crucifixo-halteres'),
    (gen_random_uuid(), p_user_id, 'Tríceps pulley',               'Tríceps', 'external', 'triceps-pulley'),
    (gen_random_uuid(), p_user_id, 'Tríceps testa',                'Tríceps', 'external', 'triceps-testa'),
    (gen_random_uuid(), p_user_id, 'Barra fixa',                   'Costas',  'bodyweight', 'barra-fixa'),
    (gen_random_uuid(), p_user_id, 'Puxada frontal',               'Costas',  'external', 'puxada-frontal'),
    (gen_random_uuid(), p_user_id, 'Remada curvada',               'Costas',  'external', 'remada-curvada'),
    (gen_random_uuid(), p_user_id, 'Remada baixa',                 'Costas',  'external', 'remada-baixa'),
    (gen_random_uuid(), p_user_id, 'Rosca direta',                 'Bíceps',  'external', 'rosca-direta'),
    (gen_random_uuid(), p_user_id, 'Rosca martelo',                'Bíceps',  'external', 'rosca-martelo'),
    (gen_random_uuid(), p_user_id, 'Agachamento livre',            'Pernas',  'external', 'agachamento-livre'),
    (gen_random_uuid(), p_user_id, 'Leg press',                    'Pernas',  'external', 'leg-press'),
    (gen_random_uuid(), p_user_id, 'Mesa flexora',                 'Pernas',  'external', 'mesa-flexora'),
    (gen_random_uuid(), p_user_id, 'Panturrilha em pé',            'Pernas',  'external', 'panturrilha-em-pe'),
    (gen_random_uuid(), p_user_id, 'Desenvolvimento com halteres', 'Ombros',  'external', 'desenvolvimento-halteres'),
    (gen_random_uuid(), p_user_id, 'Elevação lateral',             'Ombros',  'external', 'elevacao-lateral');
end
$$;

/* ---------- comandos ---------- */

create or replace function private.cmd_exercise_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  e jsonb := p -> 'exercise';
  v_id uuid := (e ->> 'id')::uuid;
begin
  if exists (select 1 from public.exercises where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;
  if exists (
    select 1 from public.exercises x
    where x.user_id = (select auth.uid()) and x.archived_at is null and lower(btrim(x.name)) = lower(btrim(e ->> 'name'))
  ) then
    raise exception 'Já existe um exercício com este nome.' using errcode = '23505';
  end if;
  insert into public.exercises (id, name, muscle_group, load_type, library_key)
  values (
    v_id, btrim(e ->> 'name'), btrim(e ->> 'muscleGroup'), (e ->> 'loadType')::public.load_type,
    nullif(e ->> 'libraryKey', '')
  );
  return private.outcome('saved');
end
$$;

create or replace function private.cmd_exercise_update(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  f jsonb := p -> 'fields';
begin
  if not exists (select 1 from public.exercises where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Exercício não encontrado.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.exercises x
    where x.user_id = (select auth.uid()) and x.id <> v_id and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(f ->> 'name'))
  ) then
    raise exception 'Já existe um exercício com este nome.' using errcode = '23505';
  end if;
  update public.exercises
  -- `libraryKey` ausente = sem vínculo (o formulário manda o estado inteiro, como no reducer).
  set name = btrim(f ->> 'name'), muscle_group = btrim(f ->> 'muscleGroup'), load_type = (f ->> 'loadType')::public.load_type,
      library_key = nullif(f ->> 'libraryKey', '')
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create or replace function private.cmd_workout_finish(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  s jsonb := p -> 'session';
  v_id uuid := (s ->> 'id')::uuid;
  v_started timestamptz := to_timestamp((s ->> 'startedAt')::bigint / 1000.0);
  v_finished timestamptz := to_timestamp((s ->> 'finishedAt')::bigint / 1000.0);
  v_ex record;
  v_se uuid;
begin
  if exists (select 1 from public.workout_sessions where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;

  insert into public.workout_sessions (id, plan_id, name_snapshot, started_at, finished_at, occurred_on, notes, effort)
  values (
    v_id,
    nullif(s ->> 'planId', '')::uuid,
    s ->> 'nameSnapshot',
    v_started,
    v_finished,
    (v_started at time zone public.app_tz())::date,
    nullif(s ->> 'notes', ''),
    (s ->> 'effort')::smallint
  );

  for v_ex in
    select e.value as ex, e.ordinality as pos
    from jsonb_array_elements(s -> 'exercises') with ordinality as e(value, ordinality)
  loop
    insert into public.session_exercises
      (session_id, exercise_id, position, name_snapshot, load_type, planned_sets, rep_min, rep_max, rest_seconds)
    values (
      v_id,
      (v_ex.ex ->> 'exerciseId')::uuid,
      (v_ex.pos - 1)::int,
      v_ex.ex ->> 'nameSnapshot',
      (v_ex.ex ->> 'loadType')::public.load_type,
      (v_ex.ex ->> 'plannedSets')::int,
      (v_ex.ex ->> 'repMin')::int,
      (v_ex.ex ->> 'repMax')::int,
      (v_ex.ex ->> 'restSeconds')::int
    )
    returning id into v_se;

    insert into public.exercise_sets (session_exercise_id, set_number, weight_kg, reps)
    select v_se, st.ordinality::int, (st.value ->> 'weightKg')::numeric, (st.value ->> 'reps')::int
    from jsonb_array_elements(v_ex.ex -> 'sets') with ordinality as st(value, ordinality)
    where coalesce((st.value ->> 'done')::boolean, true);
  end loop;

  if not exists (
    select 1 from public.session_exercises se
    join public.exercise_sets es on es.session_exercise_id = se.id and es.user_id = se.user_id
    where se.session_id = v_id and se.user_id = (select auth.uid())
  ) then
    raise exception 'Conclua ao menos uma série para salvar o treino.' using errcode = '23514';
  end if;

  return private.outcome('saved');
end
$$;

/* ---------- snapshot (versão completa, agora com vínculo e esforço) ---------- */

create or replace function public.get_snapshot() returns jsonb
language sql security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'serverNow', private.epoch_ms(private.app_now()),
    -- Versão do esquema: o app exige a sua. Sem isto, um app publicado antes desta migração gravaria `effort` e
    -- `libraryKey` num banco que os ignora EM SILÊNCIO (são campos dentro de registros, não chaves novas do snapshot).
    'schemaVersion', 16,

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
    ), '[]'::jsonb)
  )
$$;
