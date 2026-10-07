-- Fundação: tipos, funções de apoio e perfil.
--
-- Convenções de todas as tabelas deste projeto:
--  * `id uuid` gerado no CLIENTE: repetir um comando (toque duplo, nova tentativa) nunca duplica,
--    porque o INSERT usa ON CONFLICT (id) DO NOTHING.
--  * `user_id` com default auth.uid() e RLS `user_id = auth.uid()`. As FKs entre tabelas são COMPOSTAS
--    (pai_id, user_id), então um filho jamais aponta para um pai de outro usuário.
--  * Dinheiro em centavos (bigint); datas de negócio em `date`; instantes em `timestamptz`.
--  * Histórico é preservado: o que já foi usado é ARQUIVADO (archived_at), não apagado.

create schema if not exists private;
-- Funções chamadas pelo despachante de comandos vivem aqui, fora do schema exposto pela API.
grant usage on schema private to authenticated;

-- Datas de negócio plausíveis; barra erros de digitação como o ano 0202.
create domain public.business_date as date
  check (value between date '2000-01-01' and date '2100-12-31');

create type public.tx_type as enum ('income', 'expense');
create type public.tx_source as enum ('manual', 'ai');
create type public.goal_kind as enum
  ('savings', 'category_budget', 'workout_sessions', 'study_minutes', 'reading_pages');
create type public.load_type as enum ('external', 'bodyweight');
create type public.study_source as enum ('timer', 'manual');
create type public.book_status as enum ('want', 'reading', 'done', 'paused');

-- Fuso único do app (app de um dono só). Também existe em src/lib/constants.ts: o teste de paridade
-- falha se os dois divergirem.
create function public.app_tz() returns text
language sql immutable parallel safe
as $$ select 'America/Sao_Paulo'::text $$;

-- "Agora" do servidor. Os testes fixam o relógio com `set_config('app.test_now', ...)`; em produção a
-- variável não existe e vale now(). Nenhum comando aceita horário vindo do cliente para decidir regras.
create function private.app_now() returns timestamptz
language sql stable
as $$ select coalesce(nullif(current_setting('app.test_now', true), '')::timestamptz, now()) $$;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Perfil do dono. É criado pelo gatilho de signup (ver 0007), nunca pelo cliente.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
create policy "profiles: ler o próprio" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: editar o próprio" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
