# Publicar na Vercel (plano gratuito)

Pré-requisito: o banco já está de pé ([setup-supabase.md](setup-supabase.md)) e você tem em mãos a *Project URL* e a
chave *publishable* do Supabase.

> Limites do plano **Hobby** conferidos na documentação da Vercel em 07/10/2026: funções com até 300 s (o assistente
> usa no máximo ~30 s), cron **uma vez por dia** (é o que o app usa), e o plano **não conecta repositórios de
> organizações do GitHub** (o seu, `PedroDiOliveira/tars-assistant`, é pessoal). O plano é para uso pessoal e não
> comercial.

## 1. Importar o projeto

1. Em [vercel.com/new](https://vercel.com/new), escolha o repositório `tars-assistant`.
2. O framework (Next.js) é detectado sozinho; não mude *Build Command* nem *Output Directory*.
3. **Antes** de clicar em Deploy, abra *Environment Variables* e preencha a tabela abaixo.

## 2. Variáveis de ambiente

O modo do app é **fixo por deploy**. A regra que protege seus dados: só o ambiente **Production** usa dados reais.

| Variável | Production | Preview | Observação |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_MODE` | `live` | *(deixe em branco)* | Em branco = demonstração com dados fictícios. **Previews nunca tocam o seu banco.** |
| `SUPABASE_URL` | Project URL | — | |
| `SUPABASE_PUBLISHABLE_KEY` | chave `sb_publishable_…` | — | Nunca use a `service_role`/secret |
| `CRON_SECRET` | 32+ caracteres aleatórios | — | `openssl rand -hex 32`. A Vercel o envia ao cron do keep-alive |
| `AI_PROVIDER` | `groq` ou `xai` | — | `none` desliga a IA; o resto do app continua inteiro |
| `AI_MODEL` | modelo do provedor | — | Veja limites e preços no console do provedor antes de escolher |
| `AI_API_KEY` | sua chave | — | Marque como **Sensitive** |
| `AI_BASE_URL` | *(em branco: o padrão do provedor)* | — | Só para apontar para outro endereço |
| `AI_DAILY_REQUEST_LIMIT` | `60` | — | Perguntas por dia |
| `AI_PER_MINUTE_LIMIT` | `10` | — | |
| `AI_MONTHLY_TOKEN_BUDGET` | `500000` | — | Tokens por mês: seu teto de gasto |

Marque `SUPABASE_PUBLISHABLE_KEY`, `CRON_SECRET` e `AI_API_KEY` como *Sensitive*. Como nenhuma delas começa com
`NEXT_PUBLIC_`, elas existem **só no servidor** e nunca chegam ao navegador.

> Se faltar qualquer variável obrigatória do modo `live`, o **build falha** e mostra a lista do que falta (nenhum valor
> é impresso). É melhor quebrar o deploy do que descobrir em produção.

## 3. Depois do primeiro deploy

1. **URL de produção** → copie para *Authentication → URL Configuration* no Supabase (Site URL e Redirect URLs).
2. Abra `https://SEU-APP.vercel.app/api/health`: deve responder `{"status":"ok"}`.
3. Entre com o usuário que você criou no Supabase.
4. **Settings → Cron Jobs**: deve haver `/api/cron/keep-alive` (diário). Ele impede que o Supabase gratuito pause o
   projeto por inatividade.
5. **Região das funções** (*Settings → Functions*): escolha a mais próxima do Supabase (São Paulo, `gru1`), se o seu
   plano permitir. *(Não consegui confirmar se o Hobby permite escolher; verifique no painel.)*
6. Teste de ponta a ponta no navegador: lançar R$ 3.500 de receita e R$ 42 de despesa deve dar **R$ 3.458,00**; recarregue
   e confira que persistiu.

## 4. Instalar no iPhone

1. Abra a URL de produção no **Safari** (não funciona pelo Chrome do iOS).
2. *Compartilhar → Adicionar à Tela de Início*.
3. Abra pelo ícone: deve abrir em tela cheia, com a animação de abertura.
4. Feche e abra de novo, bloqueie a tela durante um cronômetro de estudo e volte: o tempo continua certo.

*Ainda não foi testado em um iPhone físico* (é a validação pendente listada no README).

## 5. Operação

- **IA fora do ar ou sem crédito:** o assistente mostra uma mensagem e oferece o formulário manual; nada mais é afetado.
  Para desligar de propósito, `AI_PROVIDER=none` e faça um novo deploy.
- **Gasto da IA:** o teto vem de `AI_MONTHLY_TOKEN_BUDGET` e `AI_DAILY_REQUEST_LIMIT`. Confira o consumo real no console
  da xAI. **Não aceite o programa de "compartilhamento de dados"** em troca de créditos: seriam dados financeiros.
- **Projeto Supabase pausado:** *Restore project* no painel (os dados são preservados). O cron diário evita isso.
- **Backup:** *Configurações → Exportar dados (JSON)* no app. Confira também o que o seu plano do Supabase oferece.
- **Trocar uma chave:** gere outra no provedor, atualize a variável na Vercel e faça redeploy; revogue a antiga.
- **Logs:** a Vercel guarda os logs de função. Eles são estruturados e **nunca** têm texto de mensagens, valores ou e-mails.

## 6. Segurança, em uma lista

- Cadastro desativado no Supabase; só o seu usuário existe.
- Nenhuma chave secreta/`service_role` no projeto; o navegador só fala com o próprio servidor (CSP `connect-src 'self'`).
- Toda tabela tem RLS; toda ação revalida a sessão no servidor.
- O cache offline guarda só arquivos estáticos: nada financeiro, nada de IA.
- Previews são sempre demonstração.
