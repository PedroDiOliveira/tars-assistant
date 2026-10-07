# Arquitetura do backend

Registro das decisões que sustentam a passagem do protótipo (dados mock no navegador) para o app real
(Supabase + Vercel + um provedor de IA compatível com a OpenAI: Groq ou xAI). Cada decisão diz o que foi escolhido e **por quê**; o plano de fases está no
README e o contexto do produto em [especificacao-app-pessoal.md](especificacao-app-pessoal.md) e
[decisoes.md](decisoes.md).

Status: **aceitas em 2026-10-07**. Alterar uma delas exige atualizar este arquivo. As decisões 11 a 20 vieram durante a
implementação, cada uma com o problema real que a motivou.

## Princípios

1. **O domínio é puro e compartilhado.** `src/domain` não conhece React, banco nem rede. A tela, a atualização
   otimista, o modo demo e as ferramentas do assistente chamam as **mesmas** funções — por isso o número que a IA
   fala é, por construção, o da tela.
2. **O banco é a última linha de defesa.** Isolamento por usuário (RLS), integridade pai/filho, idempotência e
   regras como "uma sessão de estudo por vez" vivem no Postgres, não só no TypeScript.
3. **Nada de sucesso sem persistência.** Em modo real, o aviso de "salvo" só aparece depois da confirmação do servidor.
4. **A IA é opcional e nunca escreve.** Sem chave o app inteiro funciona; com chave, o modelo só *propõe*.

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Ports & adapters em `src/data`**: um contrato de ações/leitura com dois adapters, `demo` (store local) e `remote` (Supabase). O modo é `NEXT_PUBLIC_APP_MODE=live\|demo`, **fixo por deploy** | A spec exige demo separado dos dados pessoais. Sem alternância em runtime, é impossível misturar. Mantém os fluxos E2E rodando sem backend |
| 2 | **Comandos tipados + reducers puros** (`domain/commands.ts`, `domain/reducers.ts`) | O mesmo reducer alimenta a atualização otimista, o adapter demo e o **teste de paridade** com o banco |
| 3 | **TanStack Query** guarda o estado de servidor (um `["snapshot"]`); zustand fica só com estado do aparelho (rascunho de treino, descanso, UI) | O domínio já consome um snapshot inteiro; para um dono, carregar tudo é viável |
| 4 | **Leitura** por `GET /api/snapshot` (Route Handler); **escrita** por Server Actions | O Next despacha Server Actions uma por vez por cliente; leitura nelas ficaria presa atrás de escritas |
| 5 | **Todo acesso a dados no servidor.** Sem cliente Supabase no navegador e **sem service role em lugar nenhum** | Superfície de ataque mínima: se uma chave vazar, não há chave poderosa. CSP com `connect-src 'self'` |
| 6 | **Auth** com `@supabase/ssr` + `proxy.ts` + `getClaims()`; cadastro desativado | O proxy é só checagem otimista. A autorização real é `requireUser()` em **cada** action/handler. Nunca `getSession()` no servidor |
| 7 | **Páginas não leem cookies.** O portão é o proxy + 401 do `/api/snapshot` | Com Cache Components, ler sessão num Server Component exige `<Suspense>` e dispara a validação `instant`; assim as rotas continuam shells estáticos |
| 8 | Operações **compostas ou idempotentes** = RPC `security invoker`; CRUD de uma linha = PostgREST sob RLS | Atomicidade e invariantes no banco, com RLS valendo dentro das funções |
| 9 | **Ids UUID v4 gerados no cliente**; `INSERT ... ON CONFLICT (id) DO NOTHING` | É a chave de idempotência: toque duplo ou nova tentativa não duplica. Substitui o `idempotency_key` da spec |
| 10 | **Cronômetro de estudo no servidor** (PK = `user_id`); **rascunho de treino local** | A spec proíbe duas sessões simultâneas entre dispositivos. Treino: sinal ruim na academia (decisão B) |

| 11 | **O token de redefinição de senha só é consumido no envio do formulário**, nunca ao abrir o link | Scanners de e-mail "clicam" nos links antes da pessoa e queimariam um token de uso único aberto por GET |
| 12 | **Catálogos nunca são apagados depois de usados: são arquivados** (categorias, exercícios, matérias, fichas). Livro é a exceção: exclui junto as leituras, com confirmação que diz quantas | Preserva o histórico (spec §12); arquivar libera o nome (índice único parcial) |
| 13 | **O assistente só PROPÕE.** O modelo escolhe ferramentas que executam as mesmas funções puras do domínio; o texto da proposta é fixo; o id da proposta vira o id do lançamento | O número da IA é o da tela por construção; confirmar duas vezes não duplica; prompt injection não consegue gravar nada |
| 14 | **Limites de IA no banco, atômicos, e a IA só é chamada depois deles; se não der para conferir, não chama (falha fechada)** | A IA custa dinheiro: um bug ou laço não pode virar gasto sem teto |
| 15 | **Service worker com política mínima**: só `/_next/static/*` e `/offline`; nunca HTML das telas, `/api/*`, RSC nem POST | Spec §13: nada financeiro ou de IA em cache; sair da conta não deixa dados no aparelho |
| 16 | **CSP estrita em produção** (`connect-src 'self'`, sem eval, sem terceiros). `unsafe-inline` em scripts por causa dos scripts inline do Next/tema; nonce quebraria as telas estáticas | O navegador nunca fala com o Supabase nem com a IA, então um script injetado não teria para onde enviar dados |
| 17 | **Configuração inválida derruba o build** (validação no `next.config.ts`), não a primeira requisição em produção | Falhar cedo e com a lista do que falta |
| 18 | **Um adaptador só para provedores compatíveis com a OpenAI** (`openai-compatible.ts`) e uma fábrica por env (`AI_PROVIDER` = `groq`, `xai` ou `none`; `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`). Nomes de variável genéricos | Trocar de provedor é mudar variável, não código; uma `XAI_API_KEY` guardando chave da Groq seria enganosa. A Groq tem camada gratuita (com limite de tokens por minuto) e a xAI é paga |
| 19 | **O servidor entrega as datas prontas no prompt** (hoje, ontem, esta semana, semana passada, últimos 7/30 dias, este mês, mês passado), calculadas com as funções do app | Na avaliação com o modelo real, "esta semana" virou "2 a 8 de outubro" numa quarta-feira 7 (a semana vai de segunda 5 a domingo 11). Modelos erram aritmética de calendário; o servidor não |
| 20 | **Cookie de sessão `httpOnly` + `SameSite=Lax`, e `Secure` conforme o protocolo da requisição** | O @supabase/ssr grava `httpOnly: false` porque o cliente de navegador precisa ler; este app não tem esse cliente, então o JavaScript da página não deve enxergar o token. `Secure` por protocolo (não por ambiente) para o app seguir abrindo por http na rede local |

## Onde cada coisa mora

```
src/domain/     regras puras (dinheiro, períodos, metas, resumos) + commands/reducers
src/data/       a única porta de entrada das telas: demo/ (local) e remote/ (servidor)
src/server/     server-only: env, auth (requireUser), supabase, mappers, handlers, ai/
src/app/api/    snapshot, assistant, export, health, cron
supabase/       migrations SQL, testes de banco
```

## Variáveis de ambiente

Validadas com Zod em [src/server/env.ts](../src/server/env.ts) e checadas na subida do servidor
(`src/instrumentation.ts`): uma variável faltando derruba o deploy com a lista do que falta. A lista completa,
com o que é obrigatório em cada modo, está em [.env.example](../.env.example).

## Qualidade

- **Gate de CI** (`.github/workflows/ci.yml`): lint, typecheck, testes (inclui banco), `npm audit` de produção, build,
  E2E em modo demo, **E2E em modo live** (app real contra um Supabase e uma API de IA falsos) e varredura de segredos.
- **Teste de paridade**: para cada comando, `applyCommand(snapshot, cmd)` tem de ser igual ao snapshot lido do banco
  depois de executar o mesmo comando. Pega divergência entre o TypeScript e o SQL.
- **Banco**: RLS com dois usuários, constraints, idempotência e virada de dia no fuso, em PGlite (sem Docker). Travas
  que quebram se aparecer: tabela sem RLS, função aberta a quem não está logado, `security definer` desconhecida.
- **Teste de mutação manual**: ao escrever as regras de SQL e do service worker, cada regra crítica foi quebrada de
  propósito para confirmar que algum teste falha.
- **Fakes de infraestrutura** (`e2e/fake-supabase.mjs`, `e2e/fake-xai.mjs`, este último uma API compatível com a OpenAI): Auth + PostgREST sobre as migrações reais e
  uma API compatível com a da OpenAI. Provam a integração sem chaves; **não substituem** um teste contra os serviços de
  verdade. Esse teste foi feito em 2026-10-07 (Supabase e Groq reais, com um usuário descartável criado e apagado por um
  script fora do repositório): migrações, RLS, login com cookie `httpOnly`, persistência e assistente passaram.
