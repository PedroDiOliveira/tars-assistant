-- Finanças: categorias, lançamentos e atalhos.

create table public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  type public.tx_type not null,
  icon text not null default 'dots' check (char_length(icon) between 1 and 30),
  hue smallint not null default 150 check (hue between 0 and 360),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- permite que a FK dos lançamentos exija que o tipo do lançamento seja o tipo da categoria
  unique (id, user_id, type)
);
create unique index categories_active_name_uq
  on public.categories (user_id, type, lower(name)) where archived_at is null;
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

create table public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.tx_type not null,
  -- centavos inteiros e positivos; o tipo diferencia receita de despesa. Teto = R$ 99.999.999,99.
  amount_cents bigint not null check (amount_cents between 1 and 9999999999),
  category_id uuid not null,
  description text not null default '' check (char_length(description) <= 200),
  occurred_on public.business_date not null,
  source public.tx_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- categoria do mesmo usuário E do mesmo tipo; categoria em uso não pode ser apagada (arquive).
  foreign key (category_id, user_id, type)
    references public.categories (id, user_id, type) on delete restrict
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id, occurred_on);
create trigger transactions_updated_at before update on public.transactions
  for each row execute function private.set_updated_at();

-- Atalhos de lançamento ("Almoço R$ 35").
create table public.tx_templates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  type public.tx_type not null,
  amount_cents bigint not null check (amount_cents between 1 and 9999999999),
  category_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id, type)
    references public.categories (id, user_id, type) on delete cascade
);
create index tx_templates_user_idx on public.tx_templates (user_id, created_at);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.tx_templates enable row level security;
create policy "categories: dono" on public.categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions: dono" on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tx_templates: dono" on public.tx_templates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
