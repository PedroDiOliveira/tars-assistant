-- Escrita: `apply_command(jsonb)` é o espelho SQL do reducer TypeScript (src/domain/reducers.ts). Recebe o
-- MESMO comando (src/domain/commands.ts, camelCase) e faz a mesma coisa no banco, de forma atômica e
-- idempotente. O teste de paridade garante que os dois não divergem.
--
-- Regras comuns:
--  * INSERT ... ON CONFLICT (id) DO NOTHING: repetir o comando não duplica e responde "saved".
--  * Tudo roda com os direitos de quem chama (security invoker): o RLS vale dentro das funções.
--  * Relógio e fuso decididos AQUI (private.app_now / app_tz); o `nowMs` do cliente não manda em regra nenhuma.
--  * Erros de regra usam mensagens em português e códigos 23514/P0002, que a API traduz em "validação".

create function private.outcome(p_outcome text) returns jsonb
language sql immutable parallel safe
as $$ select jsonb_build_object('outcome', p_outcome) $$;

/* ---------- finanças ---------- */

create function private.cmd_transaction_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  t jsonb := p -> 'transaction';
begin
  insert into public.transactions (id, type, amount_cents, category_id, description, occurred_on, source)
  values (
    (t ->> 'id')::uuid,
    (t ->> 'type')::public.tx_type,
    (t ->> 'amountCents')::bigint,
    (t ->> 'categoryId')::uuid,
    coalesce(t ->> 'description', ''),
    (t ->> 'occurredOn')::public.business_date,
    coalesce(t ->> 'source', 'manual')::public.tx_source
  )
  on conflict (id) do nothing;
  return private.outcome('saved');
end
$$;

create function private.cmd_transaction_update(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  f jsonb := p -> 'fields';
begin
  update public.transactions set
    type = (f ->> 'type')::public.tx_type,
    amount_cents = (f ->> 'amountCents')::bigint,
    category_id = (f ->> 'categoryId')::uuid,
    description = coalesce(f ->> 'description', ''),
    occurred_on = (f ->> 'occurredOn')::public.business_date
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_transaction_delete(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.transactions
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_template_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  t jsonb := p -> 'template';
begin
  insert into public.tx_templates (id, label, type, amount_cents, category_id)
  values (
    (t ->> 'id')::uuid, t ->> 'label', (t ->> 'type')::public.tx_type,
    (t ->> 'amountCents')::bigint, (t ->> 'categoryId')::uuid
  )
  on conflict (id) do nothing;
  return private.outcome('saved');
end
$$;

create function private.cmd_template_delete(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.tx_templates
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- metas ---------- */

-- Mesma meta (tipo, escopo, vigência) = atualiza o alvo e MANTÉM o id da linha existente.
create function private.cmd_goal_set(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  g jsonb := p -> 'goal';
  v_kind public.goal_kind := (g ->> 'kind')::public.goal_kind;
  v_scope uuid := nullif(g ->> 'scopeId', '')::uuid;
begin
  insert into public.goals (id, kind, category_id, subject_id, valid_from, target)
  values (
    (g ->> 'id')::uuid,
    v_kind,
    case when v_kind = 'category_budget' then v_scope end,
    case when v_kind = 'study_minutes' then v_scope end,
    (g ->> 'validFrom')::public.business_date,
    (g ->> 'target')::bigint
  )
  on conflict (user_id, kind, category_id, subject_id, valid_from)
  do update set target = excluded.target;
  return private.outcome('saved');
end
$$;

/* ---------- treino ---------- */

-- Só a sessão finalizada chega aqui. `occurred_on` é derivado do início no fuso do app (o dia em que o
-- treino começou), nunca aceito do cliente.
create function private.cmd_workout_finish(p jsonb) returns jsonb
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

  insert into public.workout_sessions (id, plan_id, name_snapshot, started_at, finished_at, occurred_on, notes)
  values (
    v_id,
    nullif(s ->> 'planId', '')::uuid,
    s ->> 'nameSnapshot',
    v_started,
    v_finished,
    (v_started at time zone public.app_tz())::date,
    nullif(s ->> 'notes', '')
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

create function private.cmd_workout_delete_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.workout_sessions
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- estudos ---------- */

-- No máximo um cronômetro por usuário (PK): o segundo "iniciar" é ignorado e responde "none".
create function private.cmd_study_start(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.study_timers (subject_id, started_at, running_since, accumulated_seconds)
  values ((p ->> 'subjectId')::uuid, private.app_now(), private.app_now(), 0)
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  return private.outcome(case when v_rows = 1 then 'saved' else 'none' end);
end
$$;

-- Pausar duas vezes não soma o tempo em dobro: só atua se estiver correndo.
create function private.cmd_study_pause(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  update public.study_timers set
    accumulated_seconds = accumulated_seconds
      + greatest(0, floor(extract(epoch from (private.app_now() - running_since)))::int),
    running_since = null
  where user_id = (select auth.uid()) and running_since is not null;
  return private.outcome('saved');
end
$$;

create function private.cmd_study_resume(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  update public.study_timers set running_since = private.app_now()
  where user_id = (select auth.uid()) and running_since is null;
  return private.outcome('saved');
end
$$;

create function private.cmd_study_discard(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.study_timers where user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

-- Remove o cronômetro e cria a sessão numa transação só. A duração usa o relógio do servidor, e a sessão
-- pertence ao dia em que COMEÇOU (no fuso do app), mesmo que termine depois da meia-noite.
create function private.cmd_study_finish(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_session uuid := (p ->> 'sessionId')::uuid;
  v_timer public.study_timers;
  v_elapsed integer;
begin
  delete from public.study_timers where user_id = (select auth.uid()) returning * into v_timer;

  if not found then
    -- Repetição do mesmo comando (resposta perdida): se a sessão já existe, é o mesmo resultado.
    if exists (select 1 from public.study_sessions where id = v_session and user_id = (select auth.uid())) then
      return private.outcome('saved');
    end if;
    return private.outcome('none');
  end if;

  v_elapsed := v_timer.accumulated_seconds + case
    when v_timer.running_since is null then 0
    else greatest(0, floor(extract(epoch from (private.app_now() - v_timer.running_since)))::int)
  end;

  if v_elapsed < 60 then
    return private.outcome('too_short');
  end if;

  insert into public.study_sessions (id, subject_id, source, occurred_on, duration_seconds)
  values (
    v_session,
    v_timer.subject_id,
    'timer',
    (v_timer.started_at at time zone public.app_tz())::date,
    least(v_elapsed, 86400)
  )
  on conflict (id) do nothing;
  return private.outcome('saved');
end
$$;

create function private.cmd_study_session_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  s jsonb := p -> 'session';
begin
  insert into public.study_sessions (id, subject_id, source, occurred_on, duration_seconds, notes)
  values (
    (s ->> 'id')::uuid, (s ->> 'subjectId')::uuid, (s ->> 'source')::public.study_source,
    (s ->> 'occurredOn')::public.business_date, (s ->> 'durationSeconds')::int,
    nullif(s ->> 'notes', '')
  )
  on conflict (id) do nothing;
  return private.outcome('saved');
end
$$;

create function private.cmd_study_session_update(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  f jsonb := p -> 'fields';
begin
  update public.study_sessions set
    subject_id = (f ->> 'subjectId')::uuid,
    occurred_on = (f ->> 'occurredOn')::public.business_date,
    duration_seconds = (f ->> 'durationSeconds')::int,
    notes = nullif(f ->> 'notes', '')
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_study_session_delete(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.study_sessions
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_subject_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  s jsonb := p -> 'subject';
begin
  insert into public.study_subjects (id, name, objective, hue)
  values (
    (s ->> 'id')::uuid, s ->> 'name', nullif(s ->> 'objective', ''), (s ->> 'hue')::smallint
  )
  on conflict (id) do nothing;
  return private.outcome('saved');
end
$$;

/* ---------- leitura ---------- */

create function private.cmd_book_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  b jsonb := p -> 'book';
begin
  insert into public.books (id, title, author, total_pages, initial_page, status)
  values (
    (b ->> 'id')::uuid, b ->> 'title', nullif(b ->> 'author', ''),
    (b ->> 'totalPages')::int, (b ->> 'initialPage')::int, (b ->> 'status')::public.book_status
  )
  on conflict (id) do nothing;
  return private.outcome('saved');
end
$$;

create function private.cmd_book_set_status(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  update public.books set status = (p ->> 'status')::public.book_status
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

-- Valida na mesma ordem e com as mesmas mensagens de validateReadingSession (src/domain/reading.ts) e
-- aplica o efeito no status do livro: terminou => concluído; leu um livro parado/da lista => "lendo".
create function private.cmd_reading_add_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  s jsonb := p -> 'session';
  v_id uuid := (s ->> 'id')::uuid;
  v_start integer := (s ->> 'startPage')::int;
  v_end integer := (s ->> 'endPage')::int;
  v_book public.books;
begin
  if exists (select 1 from public.reading_sessions where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;

  select * into v_book from public.books
  where id = (s ->> 'bookId')::uuid and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Livro não encontrado.' using errcode = 'P0002';
  end if;
  if v_start < 0 or v_end < 0 then
    raise exception 'As páginas não podem ser negativas.' using errcode = '23514';
  end if;
  if v_end > v_book.total_pages then
    raise exception 'O livro tem % páginas.', v_book.total_pages using errcode = '23514';
  end if;
  if v_end <= v_start then
    raise exception 'A página final deve ser maior que a inicial.' using errcode = '23514';
  end if;

  insert into public.reading_sessions (id, book_id, occurred_on, start_page, end_page, notes)
  values (
    v_id, v_book.id, (s ->> 'occurredOn')::public.business_date, v_start, v_end, nullif(s ->> 'notes', '')
  );

  update public.books set status = case
    when v_end >= v_book.total_pages then 'done'::public.book_status
    when v_book.status in ('want', 'paused') then 'reading'::public.book_status
    else v_book.status
  end
  where id = v_book.id and user_id = (select auth.uid());

  return private.outcome('saved');
end
$$;

create function private.cmd_reading_delete_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.reading_sessions
  where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- despachante ---------- */

create function public.apply_command(p_command jsonb) returns jsonb
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
    when 'book.add' then private.cmd_book_add(p_command)
    when 'book.setStatus' then private.cmd_book_set_status(p_command)
    when 'reading.addSession' then private.cmd_reading_add_session(p_command)
    when 'reading.deleteSession' then private.cmd_reading_delete_session(p_command)
  end;

  if v_out is null then
    raise exception 'Comando desconhecido: %', coalesce(v_type, '(vazio)') using errcode = '22023';
  end if;
  return v_out;
end
$$;

-- Keep-alive: o Supabase gratuito pausa o projeto sem atividade; um cron diário chama isto.
-- Público e inofensivo (só devolve a hora).
create function public.ping() returns timestamptz
language sql stable security invoker
as $$ select now() $$;
