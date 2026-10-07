-- Permissões. Regra: `anon` (sem login) não acessa NADA, exceto ping(). `authenticated` lê/escreve só o que o
-- RLS permite. O Supabase concede privilégios amplos por padrão às tabelas novas; aqui restringimos.

-- Tabelas: sem acesso anônimo; o dono opera sob RLS.
do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    -- começa do zero (o Supabase concede ALL por padrão a authenticated) e concede só o necessário
    execute format('revoke all on public.%I from anon, authenticated, public', r.tablename);
    if r.tablename = 'profiles' then
      -- o perfil nasce pelo gatilho de cadastro e não é apagado pelo cliente
      execute format('grant select, update on public.%I to authenticated', r.tablename);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', r.tablename);
    end if;
  end loop;
end
$$;

-- Tabelas futuras também nascem sem acesso anônimo.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Funções: por padrão o PostgreSQL deixa PUBLIC executar. Fechamos tudo e abrimos só o necessário.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function private.app_now() to authenticated;
grant execute on function private.epoch_ms(timestamptz) to authenticated;
grant execute on function private.outcome(text) to authenticated;
grant execute on function public.app_tz() to authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'cmd\_%'
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$$;

grant execute on function public.apply_command(jsonb) to authenticated;
grant execute on function public.get_snapshot() to authenticated;
grant execute on function public.ping() to anon, authenticated;
