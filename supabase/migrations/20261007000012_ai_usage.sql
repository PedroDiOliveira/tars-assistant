-- Controle de uso da IA: teto diário de requisições, orçamento mensal de tokens e limite por minuto.
-- Não é gratuita: sem estes tetos um bug (ou um loop) poderia gerar custo sem limite.
--
-- As tabelas NÃO são graváveis pelo usuário (nem lidas, no caso de ai_rate): só as duas funções abaixo mexem
-- nelas. São `security definer` porque o contador é estado controlado pelo servidor, não um dado do usuário; elas
-- sempre usam auth.uid() e nunca aceitam um id de usuário como argumento.

create table public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day public.business_date not null,
  requests integer not null default 0 check (requests >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  primary key (user_id, day)
);

-- Janela fixa de 1 minuto por usuário.
create table public.ai_rate (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  calls integer not null default 0 check (calls >= 0)
);

alter table public.ai_usage enable row level security;
alter table public.ai_rate enable row level security;
create policy "ai_usage: ler o próprio" on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);
-- ai_rate: nenhuma política = ninguém lê nem escreve direto (só as funções abaixo).

revoke all on public.ai_usage, public.ai_rate from public, anon, authenticated;
grant select on public.ai_usage to authenticated;

/**
 * Reserva uma chamada de IA, de forma atômica: confere os três tetos e, se couber, conta a requisição. Conta a
 * tentativa mesmo que o provedor falhe depois (evita tempestade de novas tentativas).
 * Devolve { allowed, reason } com reason em 'rate' | 'daily' | 'monthly'.
 */
create function public.ai_reserve(p_daily_limit integer, p_monthly_tokens bigint, p_per_minute integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := private.app_now();
  v_day date := (private.app_now() at time zone public.app_tz())::date;
  v_month_start date := date_trunc('month', v_day)::date;
  v_calls integer;
  v_requests integer;
  v_tokens bigint;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if p_daily_limit < 1 or p_monthly_tokens < 1 or p_per_minute < 1 then
    raise exception 'Limites inválidos.' using errcode = '22023';
  end if;

  -- Trava a linha do usuário: duas chamadas simultâneas passam uma de cada vez pela mesma contagem.
  insert into public.ai_rate (user_id, window_start, calls) values (v_uid, v_now, 0) on conflict (user_id) do nothing;
  select calls into v_calls from public.ai_rate where user_id = v_uid for update;

  if v_now - (select window_start from public.ai_rate where user_id = v_uid) >= interval '1 minute' then
    update public.ai_rate set window_start = v_now, calls = 0 where user_id = v_uid;
    v_calls := 0;
  end if;
  if v_calls >= p_per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate');
  end if;

  select coalesce(requests, 0) into v_requests from public.ai_usage where user_id = v_uid and day = v_day;
  if coalesce(v_requests, 0) >= p_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily');
  end if;

  select coalesce(sum(tokens), 0) into v_tokens
  from public.ai_usage where user_id = v_uid and day >= v_month_start and day <= v_day;
  if v_tokens >= p_monthly_tokens then
    return jsonb_build_object('allowed', false, 'reason', 'monthly');
  end if;

  update public.ai_rate set calls = calls + 1 where user_id = v_uid;
  insert into public.ai_usage (user_id, day, requests, tokens) values (v_uid, v_day, 1, 0)
  on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1;
  return jsonb_build_object('allowed', true, 'reason', null);
end
$$;

/** Soma os tokens que a chamada realmente gastou ao dia de hoje (para o orçamento mensal). */
create function public.ai_record(p_tokens bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_day date := (private.app_now() at time zone public.app_tz())::date;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  insert into public.ai_usage (user_id, day, requests, tokens)
  values (v_uid, v_day, 0, greatest(0, least(coalesce(p_tokens, 0), 10000000)))
  on conflict (user_id, day) do update
  set tokens = public.ai_usage.tokens + greatest(0, least(coalesce(p_tokens, 0), 10000000));
end
$$;

revoke all on function public.ai_reserve(integer, bigint, integer) from public, anon;
revoke all on function public.ai_record(bigint) from public, anon;
grant execute on function public.ai_reserve(integer, bigint, integer) to authenticated;
grant execute on function public.ai_record(bigint) to authenticated;
