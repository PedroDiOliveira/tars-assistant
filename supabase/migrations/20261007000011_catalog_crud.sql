-- Catálogos e edições: categorias, exercícios, fichas, matérias, livros e leituras.
-- Espelha src/domain/reducers.ts (mesmas regras, MESMAS mensagens): o teste de paridade garante.
--
-- Regra de ouro dos catálogos: o que já foi usado é ARQUIVADO, nunca apagado (preserva o histórico). Arquivar
-- libera o nome (o índice único só vale para itens ativos); desarquivar volta a checar o nome.

/* ---------- matérias ---------- */

-- Troca a versão anterior: agora recusa nome repetido com uma mensagem em português (em vez do erro do índice).
create or replace function private.cmd_subject_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  s jsonb := p -> 'subject';
  v_id uuid := (s ->> 'id')::uuid;
begin
  if exists (select 1 from public.study_subjects where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;
  if exists (
    select 1 from public.study_subjects x
    where x.user_id = (select auth.uid()) and x.archived_at is null and lower(btrim(x.name)) = lower(btrim(s ->> 'name'))
  ) then
    raise exception 'Já existe uma matéria com este nome.' using errcode = '23505';
  end if;
  insert into public.study_subjects (id, name, objective, hue)
  values (v_id, btrim(s ->> 'name'), nullif(s ->> 'objective', ''), (s ->> 'hue')::smallint);
  return private.outcome('saved');
end
$$;

create function private.cmd_subject_update(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  f jsonb := p -> 'fields';
begin
  if not exists (select 1 from public.study_subjects where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Matéria não encontrada.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.study_subjects x
    where x.user_id = (select auth.uid()) and x.id <> v_id and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(f ->> 'name'))
  ) then
    raise exception 'Já existe uma matéria com este nome.' using errcode = '23505';
  end if;
  update public.study_subjects
  set name = btrim(f ->> 'name'), objective = nullif(f ->> 'objective', '')
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_subject_archive(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_archive boolean := (p ->> 'archived')::boolean;
  v_name text;
begin
  select name into v_name from public.study_subjects where id = v_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Matéria não encontrada.' using errcode = 'P0002';
  end if;
  if not v_archive and exists (
    select 1 from public.study_subjects x
    where x.user_id = (select auth.uid()) and x.id <> v_id and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(v_name))
  ) then
    raise exception 'Já existe uma matéria com este nome.' using errcode = '23505';
  end if;
  update public.study_subjects
  set archived_at = case when v_archive then coalesce(archived_at, now()) else null end
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- categorias ---------- */

create function private.cmd_category_add(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  c jsonb := p -> 'category';
  v_id uuid := (c ->> 'id')::uuid;
  v_type public.tx_type := (c ->> 'type')::public.tx_type;
begin
  if exists (select 1 from public.categories where id = v_id and user_id = (select auth.uid())) then
    return private.outcome('saved');
  end if;
  if exists (
    select 1 from public.categories x
    where x.user_id = (select auth.uid()) and x.type = v_type and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(c ->> 'name'))
  ) then
    raise exception 'Já existe uma categoria com este nome.' using errcode = '23505';
  end if;
  insert into public.categories (id, name, type, icon, hue)
  values (v_id, btrim(c ->> 'name'), v_type, c ->> 'icon', (c ->> 'hue')::smallint);
  return private.outcome('saved');
end
$$;

create function private.cmd_category_update(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  f jsonb := p -> 'fields';
  v_type public.tx_type;
begin
  select type into v_type from public.categories where id = v_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.categories x
    where x.user_id = (select auth.uid()) and x.id <> v_id and x.type = v_type and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(f ->> 'name'))
  ) then
    raise exception 'Já existe uma categoria com este nome.' using errcode = '23505';
  end if;
  -- o tipo NÃO muda: os lançamentos da categoria dependem dele (FK composta)
  update public.categories
  set name = btrim(f ->> 'name'), icon = f ->> 'icon', hue = (f ->> 'hue')::smallint
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_category_archive(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_archive boolean := (p ->> 'archived')::boolean;
  v_name text;
  v_type public.tx_type;
begin
  select name, type into v_name, v_type from public.categories where id = v_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;
  if not v_archive and exists (
    select 1 from public.categories x
    where x.user_id = (select auth.uid()) and x.id <> v_id and x.type = v_type and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(v_name))
  ) then
    raise exception 'Já existe uma categoria com este nome.' using errcode = '23505';
  end if;
  update public.categories
  set archived_at = case when v_archive then coalesce(archived_at, now()) else null end
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- exercícios ---------- */

create function private.cmd_exercise_add(p jsonb) returns jsonb
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
  insert into public.exercises (id, name, muscle_group, load_type)
  values (v_id, btrim(e ->> 'name'), btrim(e ->> 'muscleGroup'), (e ->> 'loadType')::public.load_type);
  return private.outcome('saved');
end
$$;

create function private.cmd_exercise_update(p jsonb) returns jsonb
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
  set name = btrim(f ->> 'name'), muscle_group = btrim(f ->> 'muscleGroup'), load_type = (f ->> 'loadType')::public.load_type
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_exercise_archive(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_archive boolean := (p ->> 'archived')::boolean;
  v_name text;
begin
  select name into v_name from public.exercises where id = v_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Exercício não encontrado.' using errcode = 'P0002';
  end if;
  if not v_archive and exists (
    select 1 from public.exercises x
    where x.user_id = (select auth.uid()) and x.id <> v_id and x.archived_at is null
      and lower(btrim(x.name)) = lower(btrim(v_name))
  ) then
    raise exception 'Já existe um exercício com este nome.' using errcode = '23505';
  end if;
  update public.exercises
  set archived_at = case when v_archive then coalesce(archived_at, now()) else null end
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- fichas ---------- */

-- Cria ou substitui a ficha e os exercícios dela numa transação. Treinos já feitos têm cópia própria
-- (session_exercises), então nada do histórico muda. O estado de arquivada é preservado.
create function private.cmd_plan_save(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  pl jsonb := p -> 'plan';
  v_id uuid := (pl ->> 'id')::uuid;
begin
  if exists (
    select 1 from jsonb_array_elements(pl -> 'exercises') e
    where not exists (
      select 1 from public.exercises x where x.id = (e ->> 'exerciseId')::uuid and x.user_id = (select auth.uid())
    )
  ) then
    raise exception 'Exercício não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.workout_plans (id, name, notes)
  values (v_id, btrim(pl ->> 'name'), nullif(pl ->> 'notes', ''))
  on conflict (id) do update set name = excluded.name, notes = excluded.notes;

  delete from public.workout_plan_exercises where plan_id = v_id and user_id = (select auth.uid());
  insert into public.workout_plan_exercises (plan_id, exercise_id, position, planned_sets, rep_min, rep_max, rest_seconds)
  select
    v_id,
    (e.value ->> 'exerciseId')::uuid,
    (e.ordinality - 1)::int,
    (e.value ->> 'plannedSets')::int,
    (e.value ->> 'repMin')::int,
    (e.value ->> 'repMax')::int,
    (e.value ->> 'restSeconds')::int
  from jsonb_array_elements(pl -> 'exercises') with ordinality as e(value, ordinality);

  return private.outcome('saved');
end
$$;

create function private.cmd_plan_archive(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_archive boolean := (p ->> 'archived')::boolean;
begin
  if not exists (select 1 from public.workout_plans where id = v_id and user_id = (select auth.uid())) then
    raise exception 'Ficha não encontrada.' using errcode = 'P0002';
  end if;
  update public.workout_plans
  set archived_at = case when v_archive then coalesce(archived_at, now()) else null end
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

/* ---------- livros e leituras ---------- */

create function private.cmd_book_update(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  f jsonb := p -> 'fields';
  v_total integer := (f ->> 'totalPages')::int;
  v_initial integer := (f ->> 'initialPage')::int;
  v_furthest integer;
begin
  perform 1 from public.books where id = v_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Livro não encontrado.' using errcode = 'P0002';
  end if;
  if v_initial > v_total then
    raise exception 'A página inicial passa do total do livro.' using errcode = '23514';
  end if;
  select coalesce(max(end_page), 0) into v_furthest
  from public.reading_sessions where book_id = v_id and user_id = (select auth.uid());
  if v_total < v_furthest then
    raise exception 'O livro já tem leituras até a página %.', v_furthest using errcode = '23514';
  end if;
  update public.books
  set title = btrim(f ->> 'title'), author = nullif(f ->> 'author', ''), total_pages = v_total, initial_page = v_initial
  where id = v_id and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

-- Apaga o livro e, por cascata, as leituras dele. Repetir não faz nada.
create function private.cmd_book_delete(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  delete from public.books where id = (p ->> 'id')::uuid and user_id = (select auth.uid());
  return private.outcome('saved');
end
$$;

create function private.cmd_reading_update_session(p jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  f jsonb := p -> 'fields';
  v_start integer := (f ->> 'startPage')::int;
  v_end integer := (f ->> 'endPage')::int;
  v_session public.reading_sessions;
  v_book public.books;
begin
  select * into v_session from public.reading_sessions where id = v_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Sessão de leitura não encontrada.' using errcode = 'P0002';
  end if;
  select * into v_book from public.books where id = v_session.book_id and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'Livro não encontrado.' using errcode = 'P0002';
  end if;
  -- mesma ordem e mesmas mensagens de validateReadingSession (src/domain/reading.ts)
  if v_start < 0 or v_end < 0 then
    raise exception 'As páginas não podem ser negativas.' using errcode = '23514';
  end if;
  if v_end > v_book.total_pages then
    raise exception 'O livro tem % páginas.', v_book.total_pages using errcode = '23514';
  end if;
  if v_end <= v_start then
    raise exception 'A página final deve ser maior que a inicial.' using errcode = '23514';
  end if;

  update public.reading_sessions
  set occurred_on = (f ->> 'occurredOn')::public.business_date, start_page = v_start, end_page = v_end,
      notes = nullif(f ->> 'notes', '')
  where id = v_id and user_id = (select auth.uid());

  if v_end >= v_book.total_pages then
    update public.books set status = 'done' where id = v_book.id and user_id = (select auth.uid());
  end if;
  return private.outcome('saved');
end
$$;

/* ---------- despachante (versão completa) ---------- */

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
  end;

  if v_out is null then
    raise exception 'Comando desconhecido: %', coalesce(v_type, '(vazio)') using errcode = '22023';
  end if;
  return v_out;
end
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
    where n.nspname = 'private' and p.proname like 'cmd\_%'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;
