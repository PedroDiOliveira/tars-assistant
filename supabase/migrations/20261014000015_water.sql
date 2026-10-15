-- Água: contador de hidratação (um registro por toque), independente das demais áreas.
-- Espelha src/domain/water.ts e o reducer (water.add / water.remove).
--
-- Decisões:
--  * Uma linha = um toque. O total do dia é DERIVADO (soma dos toques), nunca guardado.
--  * Guardamos o INSTANTE do toque (`occurred_at`), não só a data: o dia é derivado dele no fuso do app
--    (`public.app_tz()`), então um toque às 00:30 cai no dia novo, e o horário alimenta o desfazer exato e a análise
--    "ritmo do dia".
--  * Registros são IMUTÁVEIS (só nascem e são removidos; corrigir = remover e adicionar). Por isso a tabela não tem
--    `updated_at` e o usuário não recebe UPDATE.
--  * Meta diária = goal_kind 'water_ml', com `target` em ML POR DIA e vigência semanal (segunda-feira), pelo mesmo
--    mecanismo de vigência das outras metas. Não exige mudança no check de `valid_from`.
--  * A janela de horário é recusada AQUI, no banco, com o relógio e o fuso do servidor (private.app_now / app_tz):
--    o horário do cliente nunca decide. Fica num gatilho para valer também fora dos comandos.
--
-- Ordem de implantação (ver docs/setup-supabase.md): aplique esta migração ANTES de publicar a versão do app que usa
-- água. Ela é aditiva e a versão antiga do app continua funcionando com ela aplicada.

/* ---------- tipo de meta ---------- */

-- O valor novo só pode ser USADO depois do commit desta migração; por isso nada aqui o referencia como literal
-- (as funções abaixo comparam em tempo de execução, quando o valor já existe).
alter type public.goal_kind add value if not exists 'water_ml';

/* ---------- tabela ---------- */

create table public.water_intakes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_at timestamptz not null,
  -- mililitros inteiros; teto de 5 L por registro (MAX_WATER_ML no domínio) contra erro de digitação
  ml integer not null check (ml between 1 and 5000),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index water_intakes_user_time_idx on public.water_intakes (user_id, occurred_at desc, id);

-- Só se registra água de HOJE e de ONTEM (no fuso do app), e nunca no futuro (com 5 min de folga para relógios
-- de aparelho levemente adiantados). Mesma regra e mesmas mensagens do reducer (src/domain/water.ts).
create function private.water_intake_valid_time() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.occurred_at > private.app_now() + interval '5 minutes' then
    raise exception 'Horário no futuro.' using errcode = '23514';
  end if;
  if (new.occurred_at at time zone public.app_tz())::date
     < (private.app_now() at time zone public.app_tz())::date - 1 then
    raise exception 'Só é possível registrar água de hoje e de ontem.' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger water_intakes_valid_time before insert on public.water_intakes
  for each row execute function private.water_intake_valid_time();

alter table public.water_intakes enable row level security;
create policy "water_intakes: dono" on public.water_intakes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Tabelas novas nascem abertas no Supabase: fecha tudo e concede só o necessário (mesmo padrão de 0010 e 0013).
-- Sem UPDATE: o registro é imutável.
revoke all on public.water_intakes from public, anon, authenticated;
grant select, insert, delete on public.water_intakes to authenticated;

-- O gatilho dispara sem que o usuário precise poder executar a função; ela não é uma API.
revoke all on function private.water_intake_valid_time() from public, anon, authenticated;

/* ---------- comandos ---------- */

-- Repetir o mesmo id (toque duplo, nova tentativa depois de uma resposta perdida) responde "saved" sem duplicar.
-- O ON CONFLICT cobre duas requisições simultâneas com o mesmo id; se a linha que colidiu NÃO é do usuário
-- (id de outra pessoa), o comando falha em vez de fingir que salvou.
create function private.cmd_water_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  w jsonb := p -> 'intake';
  v_id uuid := (w ->> 'id')::uuid;
  v_ml integer := (w ->> 'ml')::integer;
begin
  if exists (select 1 from public.water_intakes where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;

  -- Mesma mensagem do reducer; o CHECK da tabela é só a última defesa.
  if v_ml is null or v_ml < 1 or v_ml > 5000 then
    raise exception 'Quantidade de água inválida.' using errcode = '23514';
  end if;

  insert into public.water_intakes (id, occurred_at, ml)
  values (v_id, to_timestamp((w ->> 'at')::bigint / 1000.0), v_ml)
  on conflict (id) do nothing;

  if not exists (select 1 from public.water_intakes where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Este identificador de registro de água já está em uso.' using errcode = '23505';
  end if;
  return private.outcome('saved');
end
$$;

-- Remover um registro que não existe (desfazer depois de uma releitura, toque duplo) é um no-op, não um erro.
create function private.cmd_water_remove(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.water_intakes
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- despachante (versão completa, agora com água) ---------- */

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
  end;

  if v_out is null then
    raise exception 'Comando desconhecido: %', coalesce(v_type, '(vazio)') using errcode = '22023';
  end if;
  return v_out;
end
$$;

/* ---------- snapshot (versão completa, agora com água) ---------- */

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

/* ---------- permissões das funções novas ---------- */

-- O PostgreSQL deixa PUBLIC executar funções novas por padrão: fechamos e abrimos só para quem está logado.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'cmd\_water\_%'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
