-- Nome de exibição editável (Configurações > perfil).
--
-- Até aqui o perfil nascia com a parte do e-mail antes do "@" e a única regra do banco era "até 60 caracteres".
-- Como o app fala com o Supabase só pelo servidor, mas o PostgREST continua exposto a quem tem um JWT válido, a
-- validação não pode ficar só no TypeScript. Esta migração fecha três coisas:
--
--  1. Privilégio mínimo: o cliente só pode atualizar `display_name`. Antes podia reescrever qualquer coluna da
--     própria linha (created_at, updated_at...), o que o app nunca precisou.
--  2. Um gatilho recusa nomes inválidos POR QUALQUER CAMINHO (a RPC abaixo, um PATCH direto no PostgREST, o psql
--     de alguém com o papel authenticated): controles, espaços exóticos, caracteres invisíveis e de direção
--     (spoofing), espaços sobrando e texto fora do NFC. É um subconjunto conservador de `domain/profile.ts`: o
--     TypeScript normaliza e dá a mensagem; o banco só garante que o que NÃO passou pelo app também não entra sujo.
--     O que depende de propriedades Unicode (letra ou número, pilhas de acentos) fica só no TypeScript, porque o
--     Postgres não tem \p{...}. O teste supabase/tests/profile-name.test.ts garante que o banco nunca recusa o que o
--     app aceita.
--  3. `set_display_name(text)`: a escrita do app. `security invoker` + RLS, o dono vem do JWT (`auth.uid()`), nunca
--     de um argumento, e devolve o nome como ficou gravado.
--
-- O gatilho só valida quando o nome MUDA, e só em UPDATE: o cadastro (que deriva o nome do e-mail e pode, num caso
-- extremo, gerar um nome vazio) nunca é barrado por esta regra, e perfis antigos continuam válidos como estão.

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create function private.check_profile_name() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_name text := new.display_name;
begin
  if v_name is not distinct from old.display_name then
    return new;
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Informe um nome.' using errcode = '23514';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'O nome pode ter no máximo 60 caracteres.' using errcode = '23514';
  end if;
  -- Controles C0/C1, espaços que não são o comum (NBSP, ideográfico, tipográficos), hífen suave, marcas e isolamentos
  -- bidirecionais, largura zero, separadores de linha/parágrafo, BOM, anotações, uso privado e caracteres de tag.
  if v_name ~ '[\u0001-\u001f\u007f-\u009f\u00a0\u00ad\u061c\u1680\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff\ufff9-\ufffc\ue000-\uf8ff\U000e0000-\U000e007f]' then
    raise exception 'O nome tem caracteres inválidos.' using errcode = '23514';
  end if;
  if v_name <> normalize(v_name, nfc) or v_name ~ '^ | $|  ' then
    raise exception 'O nome tem espaços sobrando ou não está normalizado.' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function private.check_profile_name() from public, anon, authenticated;

create trigger profiles_check_name before update of display_name on public.profiles
  for each row execute function private.check_profile_name();

create function public.set_display_name(p_name text) returns text
language plpgsql set search_path = ''
as $$
declare
  v_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  update public.profiles
  set display_name = p_name
  where id = (select auth.uid())
  returning display_name into v_name;

  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
  return v_name;
end
$$;

revoke all on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
