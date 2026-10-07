# Decisões e mudanças em relação à especificação

A spec original ([especificacao-app-pessoal.md](especificacao-app-pessoal.md)) continua como referência. Este arquivo registra onde o projeto se afasta dela, por quê, e o que foi decidido ao construir o protótipo.

Contexto que motivou as mudanças: o app é **de uso pessoal** e o objetivo é **ver o progresso das metas da rotina de forma simples e rápida**.

## Mudanças propostas (a confirmar na validação do protótipo)

| # | Mudança | Por quê | Onde está no protótipo |
| --- | --- | --- | --- |
| A | **Metas por vigência (`valid_from`)** em vez de uma linha por período. Uma única tabela `goals` (`kind`, `scope` opcional, `valid_from`, `target`) no lugar de `budgets` + 4 tabelas de metas. A meta vigente é a mais recente com `valid_from <= início do período`. | A spec obriga a "definir meta" toda semana/mês. Com vigência a meta continua até você mudar, e o passado não é reescrito (regra da spec §9 preservada). | `domain/goals.ts`, sheet de meta ("Vale a partir de"), Configurações |
| B | **Treino local-first**: a sessão em andamento é um rascunho no aparelho; só vai ao banco ao finalizar. Séries pré-preenchidas com a última vez (1 toque para confirmar). | Academia tem sinal ruim; some a necessidade de linhas "em andamento" no banco e a recuperação fica trivial. | `workouts` no store (`draft`), `domain/workouts.ts` (`buildDraft`, `finalizeDraft`) |
| C | **Lançamento rápido**: teclado numérico, categorias por uso recente, atalhos ("Almoço R$ 35"), "repetir hoje". IA de texto vira acelerador opcional. | O fluxo diário mais frequente precisa de 2–3 toques, sem depender de rede/IA. | `components/finance/transaction-sheet.tsx` |
| D | **Sequência semanal** ("3 semanas seguidas batendo a meta"), derivada do histórico, no lugar de sequência diária. | Motivação sem culpa por um dia perdido; semana em andamento nunca zera a sequência. | `domain/streaks.ts` |
| E | **"Atenção desta semana"** determinística, por ritmo e limites. | Responde "o que merece atenção?" sem chamar IA (a spec já proíbe IA na abertura da home). | `domain/attention.ts` |
| F | **Simplificações de app de um dono**: fuso, moeda e semana como constantes; cadastro desativado no Supabase depois de criar a conta (em vez de allowlist); RLS simples `user_id = auth.uid()` sem FKs compostas pai/filho; `idempotency_key` só em `transactions`; PWA só com manifest + ícones. | Menos complexidade sem abrir mão de segurança real. | `lib/constants.ts`, `app/manifest.ts` |
| G | **Backup/export JSON** em Configurações. Conferir a política do plano gratuito do Supabase (pausa por inatividade, backups). | Dado pessoal precisa de saída fácil. | Botão desabilitado ("em breve") |
| H | **Catálogos iniciais em PT-BR** (categorias, exercícios) e atalhos de uso recente. | Menos digitação. | `data/mock/seed.ts` |
| I | **Sem botão flutuante global**: ações rápidas na Início, ação primária contextual em cada módulo, assistente como ícone no cabeçalho. | Resolve o conflito botão x barra inferior citado na spec §3. | `components/layout/app-header.tsx` |

## Decisões tomadas ao construir o protótipo

- **Stack**: Next.js 16 (App Router, Cache Components) + Tailwind 4 + shadcn/ui (base Radix) + zustand + date-fns. Sem biblioteca de gráficos: anéis, barras e sparkline são SVG/CSS próprios.
- **Os componentes do shadcn foram ajustados** para alvo de toque de 44 px (botão, input, select), porque o padrão deles é 32 px.
- **Gate de carregamento dentro de cada tela** (`withStoreGate`), e não no layout: com Cache Components o Next precisa renderizar a página no servidor para validar navegação instantânea.
- **Desarme após finalizar o cronômetro**: os botões de matéria ficam inativos por 700 ms depois de finalizar, porque o segundo toque de um duplo toque caía numa matéria e iniciava outro cronômetro sem querer (bug encontrado nos testes de fluxo).
- **Confirmações idempotentes**: o sheet de lançamento e a proposta do assistente têm trava contra toque duplo.
- **Cronômetro**: sessões < 1 min são descartadas; a sessão pertence ao dia em que começou.
- **Leitura**: posição atual = maior página já alcançada (leitura linear); registrar leitura de um livro "quero ler"/"pausado" o move para "lendo"; chegar na última página o marca "concluído".
- **Ids**: gerados sem `crypto.randomUUID` (indisponível em HTTP no Safari do iPhone, que é como o protótipo é testado na rede local).
- **Dependência `cn`**: o CLI atual do shadcn gera `export { cn } from "cn"`, pacote oficial do próprio shadcn (`shadcn-ui/cn`), no lugar de `clsx` + `tailwind-merge`.

## Fora do escopo do protótipo (previsto nas próximas fases)

Autenticação e banco reais, edição de fichas/categorias/exercícios, IA real, service worker/offline, exportação, XP e níveis (spec §8.3), notificações.

## A validar com você

- Ordem e densidade da Início (metas primeiro, depois ações rápidas, atenção e sequências).
- "Lançar por texto" ser o caminho principal ou só um atalho a mais.
- Se a sequência semanal e o "Atenção desta semana" fazem sentido ou viram ruído.
- Sensação de uso no iPhone real: teclado, áreas seguras, tela de início.
