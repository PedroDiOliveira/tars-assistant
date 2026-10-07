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

## Identidade visual (rodada de polimento)

Paleta definida pelo Pedro, aplicada a todo o app:

| Cor | Hex | Papel |
| --- | --- | --- |
| Emerald Pine | `#084734` | primária no tema claro (botões, item ativo), marca |
| Lime Glow | `#CEF17B` | primária no tema escuro, texto sobre pine, destaques |
| Green Tea | `#CDEDB3` | fundos suaves, superfícies de apoio |

Regras que vieram junto:

- **Tudo sai de [src/app/globals.css](../src/app/globals.css)**: mudar a identidade é mexer só nas variáveis do topo.
- **Nada de cor fora da família verde.** Categorias, matérias e capas de livro continuam se distinguindo por matiz, mas restrito à faixa 95–185 (lime → esmeralda → teal) em [src/lib/hues.ts](../src/lib/hues.ts). Antes eram matizes de todo o círculo cromático e destoavam.
- As cores por módulo deixaram de ser cores avulsas (índigo/laranja/azul/rosa) e passaram a ser variações da mesma família.
- Ícone do app, `theme-color` do navegador e manifesto do PWA seguem a paleta.

## Densidade: o que saiu da tela (pedido do Pedro)

O protótipo mostrava informação demais de uma vez. Princípio adotado: **uma informação por linha, o resto a um toque de distância** (inspiração declarada: Nubank e AGF).

| Tela | Antes | Agora |
| --- | --- | --- |
| Início | 4 cartões grandes com anel, selo de %, duas linhas de detalhe cada; seções de atenção (4 itens) e de sequências | 1 destaque (resultado do mês, número grande), 4 ações rápidas circulares, 1 cartão "Esta semana" com 3 linhas, no máximo 2 avisos. Sequências saíram para dentro dos módulos |
| Finanças | resumo + 2 caixas + meta + todas as categorias + 3 controles de filtro sempre visíveis | destaque do mês, 4 categorias (+ "ver todas"), filtros atrás do botão "Filtrar", lista por dia paginada |
| Treino | 3 cartões de ficha altos com botão largo | lista compacta com botão de play; histórico 3 itens; evolução 4 itens (+ "ver todos") |
| Estudos | segmentos semana/mês, todas as matérias, 10 sessões | só semana, 5 sessões (+ "mostrar mais") |
| Leitura | 4 abas de estado + lista filtrada | lista única ordenada por estado |

A marcação do item ativo é **uma pílula única que desliza** até o item tocado (420 ms, curva de desaceleração), em vez de sumir de um e aparecer no outro. Dois detalhes que fazem a diferença:

- A posição é `translateX(índice × 100%)`, calculada a partir da largura igual dos itens. Não medimos o DOM, então não há salto no primeiro quadro nem recálculo ao girar a tela.
- O destino é marcado **no toque**, derivado em tempo de render a partir da rota de origem (sem `useEffect` sincronizando estado). Esperar a navegação resolver deixava a pílula ~160 ms parada, e o movimento parecia travado.

A animação respeita `prefers-reduced-motion`.

A barra inferior passou a ser **flutuante e só de ícones**: descolada das bordas, totalmente arredondada, com a aba ativa em pílula preenchida. Os rótulos continuam no HTML como texto para leitores de tela (`sr-only`), e cada alvo de toque tem 75×48 px.

O vidro usa `backdrop-blur-md` (12 px) com fundo a 25% de opacidade e saturação alta. **Desfoque grande demais é contraproducente**: com 64 px o fundo virava uma mancha uniforme e dava a impressão de que o efeito não existia. Há um fundo opaco de reserva via `supports-backdrop-filter` para navegadores sem suporte.

Componentes que ficaram sem uso foram removidos: `goal-card`, `progress-ring`, `page-title`, `category-breakdown`.

## Decisões tomadas ao construir o protótipo

- **Stack**: Next.js 16 (App Router, Cache Components) + Tailwind 4 + shadcn/ui (base Radix) + zustand + date-fns. Sem biblioteca de gráficos: anéis, barras e sparkline são SVG/CSS próprios.
- **Os componentes do shadcn foram ajustados** para alvo de toque de 44 px (botão, input, select), porque o padrão deles é 32 px.
- **Gate de carregamento dentro de cada tela** (`withStoreGate`), e não no layout: com Cache Components o Next precisa renderizar a página no servidor para validar navegação instantânea.
- **Aviso de carregamento travado**: se o JavaScript não roda (o caso real: abrir pelo IP da rede com o dev server bloqueando origens externas), um script embutido avisa em 8 s em vez de deixar o esqueleto girando. Ver `boot-check.tsx` e `allowedDevOrigins` no `next.config.ts`.
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
