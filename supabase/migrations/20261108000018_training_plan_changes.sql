-- Ajustes no plano de treino EM USO (fase E): o histórico "O que mudou" e o comando que grava fichas + histórico.
-- Espelha src/domain/training-adjust.ts, src/domain/training-current.ts e o reducer (training.adjustPlan).
--
-- Decisões:
--  * Um ajuste aceito é UMA linha imutável: de qual plano aceito, quando, de onde veio (regras ou IA), o gatilho (um chip,
--    o texto livre ou a sugestão do app) e um documento (`details`, jsonb, até 16 KB) com as mudanças como a pessoa as viu
--    (onde, antes, depois, motivo, princípio). O TEXTO LIVRE da pessoa nunca chega aqui (pode conter dado de saúde).
--  * `training.adjustPlan` reaproveita os comandos de exercício e de ficha (mesmas regras e mensagens) na mesma transação:
--    se um passo falha, nada fica gravado. Só mexe em fichas que já existem e são do plano indicado.
--  * Apagar o plano aceito (ou a conta) apaga os ajustes dele (cascata).
--  * `schemaVersion` sobe para 18: o app novo recusa abrir num banco sem esta migração.
--
-- Ordem de implantação (ver docs/setup-supabase.md): aplique esta migração ANTES de publicar a versão do app com os
-- ajustes no plano em uso. Ela é aditiva e a versão anterior do app continua funcionando com ela aplicada.

/* ---------- tabela ---------- */

create table public.training_plan_changes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_record_id uuid not null,
  created_at timestamptz not null,
  source text not null check (source in ('ai', 'rules')),
  trigger text not null check (trigger in ('mais-curto', 'menos-exercicios', 'foco', 'mais-pesado', 'mais-leve', 'texto', 'troca', 'sugestao')),
  details jsonb not null check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 16384),
  unique (id, user_id),
  foreign key (plan_record_id, user_id) references public.training_plans (id, user_id) on delete cascade
);
create index training_plan_changes_user_idx on public.training_plan_changes (user_id, created_at, id);
create index training_plan_changes_record_idx on public.training_plan_changes (plan_record_id, user_id);

alter table public.training_plan_changes enable row level security;
create policy "training_plan_changes: dono" on public.training_plan_changes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Tabela nova nasce aberta no Supabase: fecha tudo e concede só o necessário (mesmo padrão de 0013, 0015 e 0017).
-- Histórico imutável: sem UPDATE nem DELETE (a exclusão da conta ou do plano apaga em cascata).
revoke all on public.training_plan_changes from public, anon, authenticated;
grant select, insert on public.training_plan_changes to authenticated;

/* ---------- comando ---------- */

-- Gravar um ajuste aceito, numa transação só: exercícios que faltavam -> fichas alteradas -> registro do ajuste.
-- Cada passo é o próprio comando avulso (mesmas regras e mensagens); a primeira exceção desfaz tudo.
create function private.cmd_training_adjust_plan(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  c jsonb := p -> 'change';
  v_id uuid := (c ->> 'id')::uuid;
  v_record uuid := (c ->> 'planRecordId')::uuid;
  v_days jsonb;
  x jsonb;
begin
  -- Já gravado (toque duplo, nova tentativa depois de uma resposta perdida): nada muda.
  if exists (select 1 from public.training_plan_changes where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;

  select tr.details -> 'days' into v_days
  from public.training_plans tr where tr.id = v_record and tr.user_id = (select auth.uid());
  if v_days is null then
    raise exception 'Plano de treino não encontrado.' using errcode = 'P0002';
  end if;

  -- Só fichas que já existem e são deste plano; cada mudança aponta uma das fichas salvas pelo comando.
  if exists (
       select 1 from jsonb_array_elements(p -> 'plans') pl(plan)
       where not (pl.plan -> 'id') in (select d -> 'planId' from jsonb_array_elements(v_days) d)
          or not exists (
            select 1 from public.workout_plans w where w.id = (pl.plan ->> 'id')::uuid and w.user_id = (select auth.uid())
          )
     )
     or exists (
       select 1 from jsonb_array_elements(c -> 'items') i(item)
       where not (i.item -> 'planId') in (select pl.plan -> 'id' from jsonb_array_elements(p -> 'plans') pl(plan))
     ) then
    raise exception 'Ajuste inconsistente com o plano.' using errcode = '22023';
  end if;

  for x in select value from jsonb_array_elements(coalesce(p -> 'exercises', '[]'::jsonb)) loop
    perform private.cmd_exercise_add(jsonb_build_object('type', 'exercise.add', 'exercise', x));
  end loop;
  for x in select value from jsonb_array_elements(p -> 'plans') loop
    perform private.cmd_plan_save(jsonb_build_object('type', 'plan.save', 'plan', x));
  end loop;

  insert into public.training_plan_changes (id, plan_record_id, created_at, source, trigger, details)
  values (
    v_id, v_record, to_timestamp((c ->> 'createdAt')::bigint / 1000.0), c ->> 'source', c ->> 'trigger',
    c - 'id' - 'planRecordId' - 'createdAt' - 'source' - 'trigger'
  )
  on conflict (id) do nothing;

  -- Colisão com o id de um ajuste de OUTRA pessoa: falha em vez de fingir que salvou.
  if not exists (select 1 from public.training_plan_changes where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Este identificador de ajuste já está em uso.' using errcode = '23505';
  end if;
  return private.outcome('saved');
end
$$;

/* ---------- despachante (versão completa, agora com os ajustes do plano) ---------- */

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
    when 'training.adjustPlan' then private.cmd_training_adjust_plan(p_command)
  end;

  if v_out is null then
    raise exception 'Comando desconhecido: %', coalesce(v_type, '(vazio)') using errcode = '22023';
  end if;
  return v_out;
end
$$;

/* ---------- snapshot (versão completa, agora com os ajustes do plano) ---------- */

create or replace function public.get_snapshot() returns jsonb
language sql security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'serverNow', private.epoch_ms(private.app_now()),
    -- Versão do esquema: o app exige a sua (16: "como foi?" e biblioteca; 17: plano de treino; 18: ajustes no plano).
    'schemaVersion', 18,

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
    ), '[]'::jsonb),

    -- Ajustes no plano em uso: o detalhe é um documento; as colunas (id, plano, instante, origem, gatilho) têm a palavra final.
    'trainingPlanChanges', coalesce((
      select jsonb_agg(
        tc.details || jsonb_build_object(
          'id', tc.id, 'planRecordId', tc.plan_record_id, 'createdAt', private.epoch_ms(tc.created_at),
          'source', tc.source, 'trigger', tc.trigger
        )
        order by tc.created_at, tc.id
      )
      from public.training_plan_changes tc where tc.user_id = (select auth.uid())
    ), '[]'::jsonb)
  )
$$;

/* ---------- permissões da função nova ---------- */

-- O PostgreSQL deixa PUBLIC executar funções novas por padrão: fechamos e abrimos só para quem está logado.
revoke all on function private.cmd_training_adjust_plan(jsonb) from public, anon;
grant execute on function private.cmd_training_adjust_plan(jsonb) to authenticated;
