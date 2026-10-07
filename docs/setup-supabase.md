# Configurar o Supabase

Passo a passo para colocar o banco no ar. Tudo que é **código** (migrações, políticas de segurança, funções)
já está no repositório em `supabase/`; aqui você só cria o projeto e liga as pontas.

> Nada disto precisa de Docker. Os testes de banco rodam em PGlite (`npm run db:test`); o Supabase real só
> entra neste passo.

## 1. Criar o projeto

1. Crie uma conta em [supabase.com](https://supabase.com) e um **novo projeto** (plano gratuito).
2. **Região: São Paulo (`sa-east-1`).** Não dá para mudar depois.
3. Guarde a **senha do banco** (só será usada na sua máquina, para aplicar as migrações; nunca vai para a
   Vercel nem para o git).

## 2. Anotar as chaves

Em **Project Settings → API**:

| O quê | Vai para | Observação |
| --- | --- | --- |
| *Project URL* | `SUPABASE_URL` | |
| Chave **publishable** (`sb_publishable_...`) | `SUPABASE_PUBLISHABLE_KEY` | Pode ser a `anon` antiga se o projeto for antigo |
| Chave **secret / service_role** | **não use** | O app foi desenhado para nunca precisar dela |

Coloque as duas em `.env.local` (ele é ignorado pelo git). O modelo está em [.env.example](../.env.example).

## 3. Aplicar o banco

```bash
npm run db:link      # pede a senha do banco e o "project ref" (o código curto da URL do projeto)
npm run db:push      # aplica supabase/migrations/*.sql, em ordem
```

Conferir: em **Table Editor** devem aparecer `transactions`, `categories`, `goals`, `study_timers`… todas com
o cadeado do RLS ativo.

> Sem `link` (não pede login no Supabase): `npx supabase db push --dry-run --db-url "postgresql://postgres:<SENHA>@db.<REF>.supabase.co:5432/postgres"`
> mostra o que seria aplicado; tire o `--dry-run` para aplicar. Prefira rodar com a senha numa variável de ambiente de
> uma sessão que você apaga depois, e **troque a senha do banco** se ela já passou por chat ou histórico de terminal.

> Alternativa sem o CLI: `psql "<string de conexão do painel>" -f supabase/migrations/<arquivo>.sql`, um arquivo
> por vez, na ordem do nome. O CLI é melhor porque registra o que já foi aplicado.

## 4. Criar o seu usuário e fechar o cadastro

O app é de um dono só: **não existe tela de cadastro**.

1. **Authentication → Users → Add user → Create new user.** Informe seu e-mail e uma senha forte (10+
   caracteres) e marque **Auto Confirm User**. Ao criar, o banco gera sozinho seu perfil e os catálogos
   iniciais (categorias e exercícios em PT-BR).
2. **Authentication → Sign In / Providers → desligue "Allow new users to sign up".** A partir daí ninguém
   mais consegue criar conta, nem chamando a API direto.

## 5. Redirecionamentos e recuperação de senha

Em **Authentication → URL Configuration**:

- **Site URL:** a URL de produção (ex.: `https://tars.vercel.app`).
- **Redirect URLs:** a de produção e, para previews, `https://*-seu-usuario.vercel.app/**`. Para testar
  local: `http://localhost:3000/**`.

Em **Authentication → Email Templates → Reset Password**, troque o link para apontar para o app:

```html
<h2>Redefinir senha</h2>
<p><a href="{{ .SiteURL }}/redefinir-senha?token_hash={{ .TokenHash }}&type=recovery">
  Escolher uma nova senha</a></p>
```

O link abre a tela de nova senha e o token de uso único **só é consumido quando você envia o formulário**. Isso é de
propósito: programas de e-mail e antivírus costumam "abrir" os links antes da pessoa, e se abrir consumisse o token a
redefinição falharia. (O fluxo está coberto pelo teste `npm run test:e2e:live`, inclusive o cenário do scanner.)

> O e-mail padrão do Supabase tem limite baixo de envios por hora; para um único usuário é suficiente.

## 6. Conferir a segurança

- **Authentication → Policies** (ou o Table Editor): todas as tabelas com RLS ativo.
- **Database → Roles:** o papel `anon` não deve ter privilégio de leitura nas tabelas (a migração `0010`
  revoga). Se quiser verificar: `select has_table_privilege('anon', 'public.transactions', 'select');` → `false`.
- **Project Settings → API:** a chave *secret* nunca deve aparecer em arquivos do repositório nem na Vercel.

## 7. Manter o projeto vivo

No plano gratuito o Supabase **pausa o projeto após cerca de 1 semana sem atividade**. O app tem um cron diário
(`/api/cron/keep-alive`, configurado em `vercel.json`) que evita isso. Se mesmo assim pausar, restaure pelo
painel (**Restore project**); os dados são preservados.

## 8. Backup

Confira no painel o que o seu plano oferece. Independentemente disso, **Configurações → Exportar dados (JSON)**
no app baixa tudo. Um dump completo também funciona:

```bash
pg_dump "<string de conexão>" --schema=public --no-owner > tars-backup.sql
```

## Como as regras estão garantidas

- **Isolamento:** toda tabela tem RLS (`user_id = auth.uid()`) e as chaves estrangeiras são compostas
  `(pai_id, user_id)`: é impossível apontar para um registro de outro usuário.
- **Idempotência:** os ids vêm do cliente (UUID) e as escritas usam `ON CONFLICT (id) DO NOTHING`. Uma proposta da IA
  usa o id da proposta: confirmar duas vezes cria um só lançamento.
- **Limites da IA:** `ai_usage` e `ai_rate` só são alteradas pelas funções `ai_reserve`/`ai_record`; o usuário não
  consegue zerar o próprio contador.
- **Nada executável por quem não está logado**, exceto `ping()` (usado pelo keep-alive). Um teste enumera todas as
  funções do banco e quebra se aparecer uma nova aberta por engano.
- **Um cronômetro por vez:** a chave primária de `study_timers` é o usuário.
- **Paridade com o TypeScript:** `npm run db:test` roda cada comando no reducer e no banco e exige estados iguais.
