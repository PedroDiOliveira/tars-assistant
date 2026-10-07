-- Metas por vigência (decisão A): uma tabela única. A meta vigente de um período é a mais recente com
-- `valid_from` <= início do período; mudar a meta cria uma linha nova e o passado não é reescrito.
-- `target = 0` significa "meta removida a partir daqui" (preserva os períodos anteriores).

create table public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.goal_kind not null,
  category_id uuid,
  subject_id uuid,
  valid_from public.business_date not null,
  target bigint not null check (target >= 0),
  created_at timestamptz not null default now(),
  -- Só o orçamento por categoria tem categoria; só a meta de estudo pode ter matéria.
  check ((kind = 'category_budget') = (category_id is not null)),
  check (subject_id is null or kind = 'study_minutes'),
  -- valid_from é sempre o início do período: dia 1 (mensal) ou segunda-feira (semanal).
  check (
    case when kind in ('savings', 'category_budget')
      then extract(day from valid_from) = 1
      else extract(isodow from valid_from) = 1
    end
  ),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade,
  foreign key (subject_id, user_id) references public.study_subjects (id, user_id) on delete cascade,
  -- NULLS NOT DISTINCT: duas metas gerais (sem categoria nem matéria) da mesma vigência colidem.
  unique nulls not distinct (user_id, kind, category_id, subject_id, valid_from)
);

alter table public.goals enable row level security;
create policy "goals: dono" on public.goals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
