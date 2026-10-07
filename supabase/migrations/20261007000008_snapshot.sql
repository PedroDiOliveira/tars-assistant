-- Leitura: `get_snapshot()` devolve, numa ida só ao banco, tudo o que o domínio consome, já no formato
-- de `AppData` (camelCase, instantes em milissegundos). O TypeScript só valida e converte nulos.
-- O filtro por `user_id` é explícito (além do RLS): defesa em profundidade e uso de índice.

create function private.epoch_ms(p_ts timestamptz) returns bigint
language sql immutable parallel safe
as $$ select (extract(epoch from p_ts) * 1000)::bigint $$;

create function public.get_snapshot() returns jsonb
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
    ), '[]'::jsonb)
  )
$$;
