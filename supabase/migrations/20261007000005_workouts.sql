-- Treino: exercícios, fichas e sessões já realizadas.
-- O treino em andamento é um rascunho local (decisão B); só a sessão FINALIZADA chega ao banco,
-- por isso não existe coluna `status`.

create table public.exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  muscle_group text not null check (char_length(btrim(muscle_group)) between 1 and 30),
  -- peso corporal tem carga externa 0 e não entra no cálculo de volume
  load_type public.load_type not null default 'external',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index exercises_active_name_uq
  on public.exercises (user_id, lower(name)) where archived_at is null;
create trigger exercises_updated_at before update on public.exercises
  for each row execute function private.set_updated_at();

create table public.workout_plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  notes text check (notes is null or char_length(notes) <= 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index workout_plans_user_idx on public.workout_plans (user_id, created_at);
create trigger workout_plans_updated_at before update on public.workout_plans
  for each row execute function private.set_updated_at();

create table public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  exercise_id uuid not null,
  position integer not null check (position >= 0),
  planned_sets integer not null check (planned_sets between 1 and 20),
  rep_min integer not null check (rep_min >= 1),
  rep_max integer not null,
  rest_seconds integer not null check (rest_seconds between 0 and 1800),
  check (rep_max >= rep_min),
  foreign key (plan_id, user_id) references public.workout_plans (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete restrict,
  -- adiada: trocar a ordem dos itens numa única instrução não colide no meio do caminho
  unique (plan_id, position) deferrable initially deferred
);

create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid,
  -- cópia do nome: renomear ou apagar a ficha não reescreve o histórico
  name_snapshot text not null check (char_length(btrim(name_snapshot)) between 1 and 60),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  occurred_on public.business_date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  check (finished_at >= started_at),
  unique (id, user_id),
  -- se a ficha for apagada, só plan_id vira nulo (user_id não pode)
  foreign key (plan_id, user_id)
    references public.workout_plans (id, user_id) on delete set null (plan_id)
);
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, occurred_on desc);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  -- identificação estável: permite comparar o exercício entre fichas e sessões
  exercise_id uuid not null,
  position integer not null check (position >= 0),
  name_snapshot text not null check (char_length(btrim(name_snapshot)) between 1 and 60),
  load_type public.load_type not null,
  planned_sets integer not null check (planned_sets >= 1),
  rep_min integer not null check (rep_min >= 1),
  rep_max integer not null,
  rest_seconds integer not null check (rest_seconds >= 0),
  check (rep_max >= rep_min),
  unique (id, user_id),
  unique (session_id, position),
  foreign key (session_id, user_id)
    references public.workout_sessions (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete restrict
);

-- Só séries concluídas são gravadas (finalizeDraft), então não há coluna `completed`.
create table public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_exercise_id uuid not null,
  set_number integer not null check (set_number >= 1),
  weight_kg numeric(6, 2) not null check (weight_kg >= 0),
  reps integer not null check (reps > 0),
  unique (session_exercise_id, set_number),
  foreign key (session_exercise_id, user_id)
    references public.session_exercises (id, user_id) on delete cascade
);

alter table public.exercises enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_plan_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.exercise_sets enable row level security;
create policy "exercises: dono" on public.exercises for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workout_plans: dono" on public.workout_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workout_plan_exercises: dono" on public.workout_plan_exercises for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workout_sessions: dono" on public.workout_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "session_exercises: dono" on public.session_exercises for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exercise_sets: dono" on public.exercise_sets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
