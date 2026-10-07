-- Estudos: matérias, sessões e o cronômetro.

create table public.study_subjects (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  objective text check (objective is null or char_length(objective) <= 60),
  hue smallint not null default 150 check (hue between 0 and 360),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index study_subjects_active_name_uq
  on public.study_subjects (user_id, lower(name)) where archived_at is null;
create trigger study_subjects_updated_at before update on public.study_subjects
  for each row execute function private.set_updated_at();

create table public.study_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  source public.study_source not null,
  occurred_on public.business_date not null,
  -- mínimo 1 min (menos é ruído do cronômetro); máximo 24 h (MAX_SESSION_SECONDS no domínio)
  duration_seconds integer not null check (duration_seconds between 60 and 86400),
  notes text check (notes is null or char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id)
    references public.study_subjects (id, user_id) on delete restrict
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, occurred_on desc);
create index study_sessions_user_subject_idx on public.study_sessions (user_id, subject_id, occurred_on);
create trigger study_sessions_updated_at before update on public.study_sessions
  for each row execute function private.set_updated_at();

-- Cronômetro ativo. A PK é o usuário: no máximo UM por usuário, mesmo com duas abas ou dois aparelhos.
-- O tempo é guardado como instantes + segundos acumulados (nunca um contador que pare com a tela bloqueada).
create table public.study_timers (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  started_at timestamptz not null,
  -- instante do último "iniciar/retomar"; null enquanto pausado
  running_since timestamptz,
  accumulated_seconds integer not null default 0 check (accumulated_seconds >= 0),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id)
    references public.study_subjects (id, user_id) on delete restrict
);
create trigger study_timers_updated_at before update on public.study_timers
  for each row execute function private.set_updated_at();

alter table public.study_subjects enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_timers enable row level security;
create policy "study_subjects: dono" on public.study_subjects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_sessions: dono" on public.study_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "study_timers: dono" on public.study_timers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
