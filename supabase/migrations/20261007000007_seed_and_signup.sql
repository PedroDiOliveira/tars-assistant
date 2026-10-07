-- Cadastro do dono: cria o perfil e os catálogos iniciais em PT-BR (decisão H).
-- Roda como `security definer` porque o gatilho dispara no INSERT em auth.users, onde não há JWT
-- (auth.uid() é nulo) e o RLS barraria. Fica em `private`, fora da API, e ninguém além do gatilho a executa.
-- Fichas de treino NÃO são semeadas: a conta real começa sem dados fictícios.

create function private.seed_defaults(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- idempotente: se o usuário já tem catálogo, não duplica
  if exists (select 1 from public.categories where user_id = p_user_id) then
    return;
  end if;

  insert into public.categories (id, user_id, name, type, icon, hue) values
    (gen_random_uuid(), p_user_id, 'Alimentação', 'expense', 'utensils', 100),
    (gen_random_uuid(), p_user_id, 'Transporte',  'expense', 'car',      178),
    (gen_random_uuid(), p_user_id, 'Moradia',     'expense', 'home',     140),
    (gen_random_uuid(), p_user_id, 'Saúde',       'expense', 'heart',    118),
    (gen_random_uuid(), p_user_id, 'Lazer',       'expense', 'fun',      162),
    (gen_random_uuid(), p_user_id, 'Compras',     'expense', 'bag',      186),
    (gen_random_uuid(), p_user_id, 'Educação',    'expense', 'school',   128),
    (gen_random_uuid(), p_user_id, 'Outros',      'expense', 'dots',     150),
    (gen_random_uuid(), p_user_id, 'Salário',     'income',  'wage',     150),
    (gen_random_uuid(), p_user_id, 'Outros',      'income',  'plus',     170);

  insert into public.exercises (id, user_id, name, muscle_group, load_type) values
    (gen_random_uuid(), p_user_id, 'Supino reto',                  'Peito',   'external'),
    (gen_random_uuid(), p_user_id, 'Supino inclinado com halteres','Peito',   'external'),
    (gen_random_uuid(), p_user_id, 'Crucifixo',                    'Peito',   'external'),
    (gen_random_uuid(), p_user_id, 'Tríceps pulley',               'Tríceps', 'external'),
    (gen_random_uuid(), p_user_id, 'Tríceps testa',                'Tríceps', 'external'),
    (gen_random_uuid(), p_user_id, 'Barra fixa',                   'Costas',  'bodyweight'),
    (gen_random_uuid(), p_user_id, 'Puxada frontal',               'Costas',  'external'),
    (gen_random_uuid(), p_user_id, 'Remada curvada',               'Costas',  'external'),
    (gen_random_uuid(), p_user_id, 'Remada baixa',                 'Costas',  'external'),
    (gen_random_uuid(), p_user_id, 'Rosca direta',                 'Bíceps',  'external'),
    (gen_random_uuid(), p_user_id, 'Rosca martelo',                'Bíceps',  'external'),
    (gen_random_uuid(), p_user_id, 'Agachamento livre',            'Pernas',  'external'),
    (gen_random_uuid(), p_user_id, 'Leg press',                    'Pernas',  'external'),
    (gen_random_uuid(), p_user_id, 'Mesa flexora',                 'Pernas',  'external'),
    (gen_random_uuid(), p_user_id, 'Panturrilha em pé',            'Pernas',  'external'),
    (gen_random_uuid(), p_user_id, 'Desenvolvimento com halteres', 'Ombros',  'external'),
    (gen_random_uuid(), p_user_id, 'Elevação lateral',             'Ombros',  'external');
end
$$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        ''
      ),
      60
    )
  )
  on conflict (id) do nothing;

  perform private.seed_defaults(new.id);
  return new;
end
$$;

revoke all on function private.seed_defaults(uuid) from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
