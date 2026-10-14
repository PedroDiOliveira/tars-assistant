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
| H | **Catálogos iniciais em PT-BR** (categorias, exercícios) e atalhos de uso recente. | Menos digitação. | `data/demo/seed.ts` |
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

## Marca

O nome vem do robô de *Interstellar*, e a marca traduz isso sem ilustrar nada: **quatro lâminas verticais idênticas, deslocadas umas em relação às outras** — o monólito segmentado no instante em que se articula para andar.

A regra que define o desenho: **as alturas são iguais de propósito.** As primeiras tentativas usaram lâminas em degrau ascendente e todas liam como gráfico de barras ou sinal de celular — o clichê que um app de metas tem mais obrigação de evitar. Com alturas iguais não há o que "medir", então o olho lê um objeto em movimento. As fendas são estreitas para o conjunto continuar sendo uma silhueta só até 18 px.

A forma é uma só, em `currentColor`, servindo cabeçalho, ícone do app e os dois temas: [`src/components/brand/logo.tsx`](../src/components/brand/logo.tsx). Versões soltas em [`docs/brand/`](brand). No ícone do app a mesma geometria é reduzida a 68% para respirar dentro do quadrado.

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

## Nome de exibição

O nome da saudação, do avatar e de Configurações nascia da parte do e-mail antes do "@" (algo como `pedro.h.soterio`) e não dava para mudar. Agora o **lápis no cartão de perfil de Configurações** abre um editor. A regra mora num lugar só, `domain/profile.ts`, e vale igual no formulário, no servidor e no modo demo.

- **O que muda e o que não muda.** Só o nome de exibição. O e-mail de login fica como está: trocar e-mail é um fluxo de autenticação com confirmação, e não faz parte desta entrega.
- **Regras.** De 1 a 60 caracteres (contados em pontos de código, então um emoji conta 1), com pelo menos uma letra ou número. O texto é normalizado, nunca "limpo" em silêncio: Unicode NFC (o "ã" digitado e o "a" + til colado viram o mesmo), qualquer espaço (inclusive o não separável, comum ao colar) vira um espaço comum e as sobras nas pontas e as repetições somem. Acentos, apóstrofo, hífen, ponto, emoji e outras escritas passam.
- **O que é recusado, com o motivo na tela:** quebras de linha e caracteres de controle; caracteres invisíveis e de direção (largura zero, inversão de direção), que servem para fazer um nome parecer outro; pilhas de mais de 4 acentos seguidos; uso privado. Contrapartida aceita: os conectores de largura zero (ZWJ/ZWNJ) também caem, então emojis compostos (família, bandeiras de profissões) e a grafia persa com meio-espaço não passam. Para um app pessoal em português, isso é preferível a abrir a porta para texto invisível.
- **Não existe nome vazio nem "voltar ao automático".** O campo exige um nome; o automático (parte do e-mail) só vale para quem ainda não definiu nenhum.
- **Salvar não é otimista.** A tela só mostra o nome novo e o aviso "Nome atualizado" depois que o servidor gravou, e usa o nome que o servidor devolveu (já normalizado). Se o servidor recusar, o motivo aparece no campo e o nome antigo continua.
- **Inicial do avatar.** É o primeiro grafema, não `charAt(0)`: com emoji ou letra acentuada decomposta, `charAt(0)` mostraria metade de um caractere.
- **Nomes longos.** Os 60 caracteres sem espaço quebram a linha em vez de estourar a Home e o cartão de perfil.
- **Privacidade.** O nome não vai para o assistente de IA nem para os logs; só aparece na tela, no backup (`/api/export`) e no banco.
- **Frequência.** Não há limite: trocar o nome é idempotente, só quem está logado altera o próprio e a superfície é a mesma das demais escritas. Um limite só faria sentido com mais de um dono.
- **Demo.** Mesma regra, guardada no `localStorage`. "Resetar dados de demonstração" volta ao nome de demonstração.

## Corrida (área Exercícios)

A área da navegação inferior que era "Treino" passou a se chamar **Exercícios** e tem duas seções, como Estudos tem Estudo e Leitura: **Musculação** (`/treino`, a funcionalidade que já existia) e **Corrida** (`/treino/corrida`, nova). As abas são rotas de verdade; o histórico de corridas é `/treino/corrida/historico`. A barra inferior continua com quatro destinos, e as rotas e arquivos de musculação (`/treino/sessao`, `/treino/historico`, tabelas `workout_*`) não foram renomeados: o ganho de uma refatoração só por nomenclatura não compensa o risco.

- **Entidade própria.** Corrida não é uma `WorkoutSession` com exercícios vazios: a musculação tem regras específicas (exige séries concluídas para finalizar). `RunningSession` guarda só `id`, `occurredOn` e, quando se sabe, `distanceMeters`, `durationSeconds` e `notes`; a tabela é `running_sessions`.
- **Distância opcional, nunca zero.** Ausente é NULL no banco e chave ausente no domínio (convenção do projeto). Uma corrida sem distância conta como corrida e marca o dia, mas não soma quilômetros, e nenhuma tela mostra "0 km" quando a distância simplesmente não foi preenchida (`domain/running-text.ts`).
- **Metros e segundos inteiros.** 5,25 km = 5250. A conversão texto <-> metros é feita por inteiros (`parseDistanceKm`, `formatKm`): `1,005` não vira `1004,9999…`. Aceita vírgula e ponto; recusa o que não entende em vez de "limpar" a entrada (apagar a vírgula de `12,5` daria 125). Casas além do metro só passam se forem zeros; qualquer outro dígito é recusado, não arredondado. Tetos: 500 km por corrida, 24 h de duração, 1.000 km de meta semanal.
- **Três contagens diferentes.** Corridas = registros; dias com corrida = datas distintas; distância = soma só das informadas. O ritmo (min/km) é calculado de distância e duração, nunca guardado, e some quando falta qualquer um dos dois. Não há ritmo agregado na primeira versão.
- **Meta semanal de distância** é um `GoalKind` novo, `running_meters`, pelo mesmo mecanismo de vigência (segunda-feira, "esta semana" ou "próxima", alvo 0 = removida). Corrida não conta na meta de musculação e vice-versa; a sequência de semanas de corrida usa a meta de distância e vem rotulada assim.
- **Data futura.** O reducer recusa com o `nowMs` do comando (o app é puro), e o banco recusa **por conta própria**, com o relógio e o fuso do servidor, num gatilho (`running_session_not_future`): um aparelho com o relógio adiantado não libera uma data futura, e inserir direto na tabela também é barrado. Ao editar, só *mover* a data para o futuro é recusado.
- **Idempotência de verdade.** O id da corrida nasce quando o formulário abre e é reenviado em toda nova tentativa. Isso cobre o caso que o bloqueio de toque duplo não cobre: o servidor salvou e a resposta se perdeu. No banco, repetir o id responde "salvo" sem duplicar; o id de *outro* usuário falha em vez de fingir que salvou.
- **Falha não deixa total otimista.** Quando o servidor recusa ou fica fora do ar, a camada remota desfaz na hora o efeito otimista (a releitura que já existia falha justamente nesse caso). Só desfaz quando é o único comando em andamento, para não desfazer o de outro.
- **Home.** "Esta semana" separa Musculação, Corrida, Estudo e Leitura; os atalhos continuam sendo quatro ("Treinar" virou "Musculação"). O aviso de corrida é objetivo ("Faltam 4 km para sua meta semanal…"), nunca uma recomendação de treino, e não afirma quanto falta quando só há corridas sem distância.
- **Assistente.** Ganhou `get_running_summary` (mesmo cálculo da tela, distância informada x desconhecida) e as instruções dizem que "treinos" de musculação e corridas são coisas separadas. Ele **não** registra corridas: o registro por linguagem natural fica para depois.
- **Fora da primeira versão:** GPS e mapas, rastreamento em tempo real, cronômetro de corrida, relógios e serviços esportivos, planos, metas de frequência, recordes e novas modalidades.

## Respostas do assistente: texto formatado e cards

O assistente respondia com texto puro (`whitespace-pre-line`), o que escondia números e listas num bloco difícil de ler. Agora a resposta é um texto curto e formatado, mais um **card** por assunto com os detalhes (número principal, meta, barras por dia ou semana, lista por categoria, matéria ou livro) e um link para a tela do módulo.

- **O modelo não desenha nada.** Ele só escreve `text`. Quem decide haver card é a ferramenta que achou registros (`get_*_summary`), e o card é montado no app a partir de uma referência (ver decisão 25 em [arquitetura-backend.md](arquitetura-backend.md)). Por isso não há custo extra de API nem de banco; o prompt passou a pedir 1 a 3 frases (o card carrega o resto), o que reduz os tokens de saída.
- **Sem registros, sem card.** Um card de zeros contradiria o texto "sem registros" (`hasRecords=false` não é o mesmo que zero).
- **Um card por tipo.** Se o modelo consultar dois períodos do mesmo assunto, vale o maior; a ordem é a de sempre do app (Finanças, Musculação, Corrida, Estudos, Leitura). Com três ou mais cards a resposta vira uma lista compacta, no mesmo molde do bloco "Esta semana" da Home.
- **Foco decidido no cliente.** Em "Quanto gastei com alimentação?" o card mostra o mês e destaca a categoria citada, em vez de acrescentar um parâmetro à ferramenta (que custaria tokens em toda chamada).
- **Corrida mantém a regra do projeto:** distância informada x desconhecida, nunca "0 km" quando a distância não foi preenchida (mesma redação de `running-text.ts`, inclusive na descrição falada das barras).
- **Congelado ao chegar.** O card é montado quando a resposta chega e não muda depois, mesmo que os dados mudem.
- **A conversa mora só na memória do navegador** (store zustand, sem localStorage nem banco): tocar num link do card e voltar não zera o chat, recarregar apaga, e sair da conta recarrega a página de propósito. Persistir o histórico exigiria tabela, RLS e retenção, e fica fora do escopo.
- **Texto do modelo é entrada não confiável.** O renderizador próprio (`lib/reply-text.ts`) só entende parágrafos, **negrito** e listas; tabelas viram linhas "a · b", títulos viram negrito, links viram só o texto, e tudo é desenhado como nó de texto do React (nunca HTML). Sem dependência nova.
- **Falha do modelo depois de achar os números** (resposta vazia ou laço de ferramentas esgotado) devolve um texto fixo mais os cards, em vez de uma tela de erro. Timeout, limite e falhas de infraestrutura continuam sendo erro, e o gasto de tokens segue registrado.
