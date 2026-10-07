-- O mínimo do Supabase que as migrações assumem existir: papéis, schema `auth` e `auth.uid()`.
-- Usado pelos testes de banco (PGlite) e pelo Supabase falso dos testes E2E.
-- Os privilégios padrão replicam os do Supabase (tabelas e funções novas nascem abertas para anon e
-- authenticated), de propósito: o teste prova que as migrações FECHAM o que precisa estar fechado.
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
