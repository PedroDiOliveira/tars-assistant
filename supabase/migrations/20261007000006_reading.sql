-- Leitura: livros e sessões. Convenção: página inicial e final são a POSIÇÃO no livro antes e depois
-- da sessão; ler da 30 até a 50 registra 20 páginas. A página inicial do cadastro não é leitura.

create table public.books (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  author text check (author is null or char_length(author) <= 60),
  total_pages integer not null check (total_pages > 0),
  initial_page integer not null default 0 check (initial_page >= 0),
  status public.book_status not null default 'reading',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (initial_page <= total_pages),
  unique (id, user_id)
);
create index books_user_idx on public.books (user_id, created_at);
create trigger books_updated_at before update on public.books
  for each row execute function private.set_updated_at();

create table public.reading_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null,
  occurred_on public.business_date not null,
  start_page integer not null check (start_page >= 0),
  end_page integer not null,
  notes text check (notes is null or char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  check (end_page > start_page),
  -- excluir um livro apaga as leituras dele; a interface confirma mostrando quantas são
  foreign key (book_id, user_id) references public.books (id, user_id) on delete cascade
);
create index reading_sessions_user_date_idx on public.reading_sessions (user_id, occurred_on desc);
create index reading_sessions_book_idx on public.reading_sessions (book_id);

-- A página final não pode passar do total do livro (regra entre duas tabelas, por isso gatilho).
create function private.reading_session_within_book() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_total integer;
begin
  select b.total_pages into v_total
  from public.books b where b.id = new.book_id and b.user_id = new.user_id;
  if v_total is not null and new.end_page > v_total then
    raise exception 'O livro tem % páginas.', v_total using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger reading_sessions_within_book before insert or update on public.reading_sessions
  for each row execute function private.reading_session_within_book();

-- E o total de páginas não pode ficar abaixo do que já foi lido.
create function private.book_pages_cover_readings() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_max integer;
begin
  select max(r.end_page) into v_max
  from public.reading_sessions r where r.book_id = new.id and r.user_id = new.user_id;
  if v_max is not null and new.total_pages < v_max then
    raise exception 'O livro já tem leituras até a página %.', v_max using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger books_pages_cover_readings before update of total_pages on public.books
  for each row execute function private.book_pages_cover_readings();

alter table public.books enable row level security;
alter table public.reading_sessions enable row level security;
create policy "books: dono" on public.books for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reading_sessions: dono" on public.reading_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
