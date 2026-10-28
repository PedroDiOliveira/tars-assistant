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
- **Nada de cor fora da família verde.** Categorias, matérias e capas de livro continuam se distinguindo por matiz, mas restrito à faixa 95–185 (lime → esmeralda → teal) em [src/lib/hues.ts](../src/lib/hues.ts). Antes eram matizes de todo o círculo cromático e destoavam. A **água** usa o azul-água no limite da faixa (matiz 185, `--water*` em [globals.css](../src/app/globals.css)), distinto do teal do Estudo (171): lê como água sem abrir exceção.
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
| Início | 4 cartões grandes com anel, selo de %, duas linhas de detalhe cada; seções de atenção (4 itens) e de sequências | 1 destaque (resultado do mês, número grande), 4 ações rápidas circulares, 1 cartão de **água** (contador de um toque), 1 cartão "Esta semana" com 4 linhas, no máximo 2 avisos. Sequências saíram para dentro dos módulos |
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

## Água

Contador de hidratação, no cartão que fica **acima de "Esta semana"** na Início e numa tela própria, `/agua` (sem aba na navegação inferior: o cartão e Configurações levam até ela). Registra no ritmo real do hábito: um toque, e o resto (porção, desfazer, meta) fica ao redor.

- **Por que na Início, e por que um cartão novo.** As outras áreas têm cadência semanal; a água é diária e curta. A Início já era "1 destaque + 4 ações + 1 cartão semanal + até 2 avisos"; o cartão de água é a quinta peça. Aberto, ele ocupava boa parte da tela, então **nasce recolhido numa faixa** (ícone, "Água · hoje", total e meta, barra fina): o "Esta semana" aparece logo abaixo. Tocar na faixa abre o cartão inteiro; um botão no cabeçalho recolhe de novo. O estado aberto/recolhido **não é guardado**: a cada visita à Início a faixa volta recolhida, e o foco acompanha a troca (abrir leva ao botão de recolher; recolher leva à faixa). Sem meta, a faixa mostra só o total, e o convite para definir uma fica no cartão aberto.
- **Botão "+" + três porções.** Copo, garrafa e garrafa grande, com a do meio (garrafa) selecionada. Escolher uma porção **não soma nada**; quem soma é o botão "+" (círculo cheio na cor da água, como as ações rápidas da Início), e o rótulo embaixo dele diz sempre quanto vai somar ("500 ml"). Antes era uma gota grande, que não parecia botão. Padrão 100 ml, 500 ml e 1 L, **editáveis** (de 1 ml a 5 L, em ordem crescente) e guardados só no aparelho. Os ícones são SVG próprios, no traço do app, em vez de emoji (que muda de desenho entre sistemas, destoa dos demais ícones e não anima).
- **Desfazer em vez de confirmar.** Um toque errado (selecionar 1 L e tocar sem querer) se corrige no próprio cartão: "Desfazer +1 L" aparece no cabeçalho por 6 segundos. Fica no cabeçalho, que nunca muda de altura, para o aviso não empurrar o botão "+" debaixo do dedo nem ir parar atrás da barra de navegação. Remove exatamente o registro do toque (cada toque tem id próprio).
- **Sem aviso de sucesso por toque.** Seria ruído a cada gole; o total que sobe e o "Desfazer" já respondem. O erro, sim, avisa, uma vez só mesmo que vários toques falhem em sequência.
- **Meta diária.** Em litros ("2,5"), guardada em ml por dia, com vigência a partir da segunda-feira da semana escolhida ("esta semana" ou "próxima"): trocar a meta não reescreve semanas passadas, mas reavalia os dias já passados da semana atual. Referência na tela: "2 a 3 litros por dia. Siga a orientação do seu médico": o app não prescreve quantidade. Passar da meta é sucesso (barra cheia, "Meta batida · 2,1 L acima"), nunca vermelho.
- **Indicadores.** "X de 7 dias na meta" (a semana de segunda a domingo, só os dias que já passaram), a sequência de dias seguidos e a melhor sequência. A sequência é diária, mas o dia **em andamento** nunca a zera: só um dia encerrado sem a meta a interrompe. A média considera só os dias **com registro** (um dia esquecido não puxa a média para baixo) e é arredondada a 10 ml.
- **Tela `/agua`.** Hoje (copo que enche, meta, sequência), o contador, os registros de hoje (remover com "Desfazer"), "Outra quantidade" (registro avulso de hoje ou de ontem, com horário), a semana (barras com a linha da meta e os números), o mês (calendário em que cada dia fica mais escuro quanto mais perto da meta; tocar abre os registros do dia) e o ritmo do dia (manhã 5h-12h, tarde 12h-18h, noite 18h-5h, nos últimos 30 dias, com uma frase só quando há dados suficientes: 3 dias e 3 L).
- **Remover num dia antigo.** O servidor só aceita registrar hoje e ontem, então desfazer a remoção de um dia mais antigo seria recusado. Nesses dias remover pede confirmação e avisa que não dá para desfazer. Dentro de uma folha o "Desfazer" fica na própria folha: com o modal aberto um toast não recebe toque.
- **Aviso de ritmo, só dentro do app.** Entre 14h e 22h, com menos de 60% do que seria esperado para a hora (a meta sobe em linha reta das 7h às 22h), a Início mostra um aviso informativo ("Hoje você bebeu 0 L de 2,5 L: faltam 2,5 L"), nunca de alarme. Sem notificação push (a spec deixa para depois) e sem aviso quando não há meta.
- **Offline.** Segue a regra do app (decisão sobre PWA): sem conexão o toque **não é salvo**, o total volta ao que o servidor tem e um aviso diz isso. Uma fila local de toques, que seria o ganho mais óbvio para água, fica como evolução e exige uma decisão própria (reverte "sem escrita offline").
- **Assistente.** Não registra água (convenção: a IA nunca escreve, e um toque é mais rápido que uma frase). Consultar por chat ("quanto bebi esta semana?") fica para depois: cada ferramenta nova aumenta os tokens de toda pergunta no plano gratuito.
- **Dados e fuso.** O dia vem do instante em `America/Sao_Paulo`: um toque às 23h58 é do dia, às 00h01 é do dia seguinte, no cliente e no banco. Uma regra só, provada pelo teste de paridade e por um e2e que atravessa a meia-noite com o relógio do navegador.
- **Fora da primeira versão:** lembretes por notificação, fila offline de toques, outras bebidas, sugestão de meta por peso ou clima, registro por linguagem natural e compactação de dias antigos.


## Respiração guiada

Um respiro dentro do app, em `/respirar` (sem aba). A entrada é um ícone de vento no cabeçalho das quatro abas, à esquerda do assistente e **mais apagado que ele** (`text-foreground/50`): é um apoio da rotina, não uma ação dela. A tela tem poucos elementos de propósito: o personagem no centro, a fase atual com uma barra fina e, só enquanto está parado, o ritmo atual numa pílula. Sem listas à vista, sem métricas, sem cronômetro de sessão.

- **O personagem é uma bolinha de luz com rosto** (`breath-face.tsx`; escolha do Pedro em 2026-10-28, no lugar das quatro lâminas do logo, que não ficaram legais). Uma esfera lime com dois olhos, sorriso e bochechas, tudo medido em `em` dentro dela (1em = 1/10 do diâmetro), então o rosto cresce junto. Parada, boia de leve, pisca de vez em quando e sorri de olhos abertos. No "Prepare-se" fecha os olhos (os abertos baixam e somem; um arco tranquilo aparece). Na inspiração incha de 0,72 a 1, estica um pouquinho para cima, acende por dentro, as bochechas coram e estufam e o sorriso se aperta. Na retenção fica cheia e parada. Na expiração a boca vira um "o", saem baforadas de ar e ela murcha achatando um pouquinho. Ao parar, abre os olhos de novo. A boca segue o **fluxo** de ar, não o nível: `breathFlow` (domínio) é a derivada normalizada da curva do pulmão (`sin(πt)`), 0 nas viradas e 1 no meio da fase, e vira `--inflow`/`--outflow`. Assim o "o" abre e fecha sozinho no ritmo, sem saber de fases. Em volta, as órbitas do splash (cada uma com um pequeno atraso, como uma onda que vai para fora), um halo e um céu de estrelas que cintila devagar. **Fundo sempre escuro**, nos dois temas (decisão do Pedro), com fade de entrada; enquanto a tela está aberta, uma meta `theme-color` própria escurece a barra de status onde o sistema respeita isso.
- **Ritmos.** Quatro, com o coerente como padrão. Durações em `domain/breathing.ts` (`BREATH_PATTERNS`, em ms); a descrição do ritmo, a contagem e a animação saem delas.
  - **Coerente** (padrão): inspira 5 s, expira 5 s, 6 ciclos por minuto. É a frequência de ressonância média (~0,1 Hz), a mais estudada; a meta-análise de Laborde et al. (2022, *Neurosci. Biobehav. Rev.* 138:104711, 223 estudos) mostra aumento da variabilidade cardíaca vagal durante, logo depois e após semanas de prática. Fases de segundos inteiros deixam a contagem limpa.
  - **Suave**: inspira 4 s, expira 6 s (também 6 por minuto). Laborde et al. (2021, *Sustainability* 13:7775) acharam RMSSD maior com expiração mais longa, mas uma revisão de 2024 (Meehan e Shaffer) aponta resultados mistos entre estudos; por isso é opção, não padrão.
  - **Caixa**: 4 s em cada etapa (inspira, segura, expira, segura). Balban et al. (2023, *Cell Rep. Med.*) a testaram; o efeito mais forte no humor foi da prática com expiração longa, não da caixa.
  - **4-7-8**: inspira 4 s, segura 7 s, expira 8 s. Evidência limitada (Vierra et al., 2022; um estudo de 2025 a descreve como "pouco suporte empírico"). Fica como opção, **sem limite de ciclos** (decisão do Pedro).
  - Os dois com retenção avisam: "Se sentir tontura, volte a respirar normalmente."
- **Ritmo escondido** (pedido do Pedro): parado, só uma pílula com o nome do ritmo atual e, embaixo, a descrição ("Inspire 5 s · expire 5 s"). Tocar nela a desdobra para cima num cartão com os quatro ritmos (nome, para que serve e um desenho do próprio ciclo, amostrado de `breathFrame`), que entram em cascata de baixo para cima; um destaque desliza até o escolhido; escolher dobra o cartão de volta e o nome novo rola para dentro da pílula. Pílula e cartão são **o mesmo elemento** (`breath-pattern-picker.tsx`): o cartão está sempre montado e um `clip-path: inset(...)` mostra só a região da pílula quando fechado, então abrir é só a transição do recorte (e o recorte também limita o toque). Um véu escurece a tela, o personagem recua e olha para baixo, para o cartão. Tocar fora (no véu) só fecha, sem iniciar a sessão. Semântica: botão com `aria-expanded`/`aria-haspopup="listbox"` e uma `listbox`; setas/Home/End movem o foco, Enter escolhe, Esc fecha **sem sair da tela** e devolve o foco à pílula. Em paisagem baixa o cartão esconde as notas (continuam para leitores de tela). Some durante a sessão (`inert`), como antes.
- **Interação.** Tocar no personagem (alvo de ~290 px) começa; tocar de novo para. Começa com 2,5 s de "Prepare-se" sem números (a luz sobe), para a pessoa se acomodar. Parar não corta: o personagem volta ao repouso **a partir de onde estava** em 1,2 s, e recomeçar no meio disso também não salta. Sair (seta ou `Esc`) volta à aba de origem com `history.back()`, porque o ícone existe nas quatro abas; aberta direto pela URL, a saída vai para a Início (`breath-origin.ts`).
- **Uma fonte de tempo.** `breathFrame(padrão, ms desde o toque)` é pura. Um único `requestAnimationFrame` lê `performance.now()`, pergunta onde a respiração está e escreve `--breath`, `--inflow`, `--outflow`, `--presence` e `--wave-1..3` no elemento raiz; personagem, rosto, barra, órbitas, céu e som leem essas variáveis no mesmo quadro. Nada é somado entre quadros (sem `setInterval`), então não há deriva: o e2e confere a escala da bolinha contra o ar e o fluxo do instante e a mesma fase um minuto depois. O React só renderiza quando muda a fase ou o segundo da contagem.
- **Desempenho.** Só `transform` e `opacity` animam; bolinha e rosto são `span`s compostos e os brilhos são gradientes prontos (nada de `filter: blur` animado). O boiar usa uma variável registrada (`@property --bob`) com amplitude `1 − presença`: a animação nunca para, só perde efeito durante a sessão, então começar e parar não dão salto. O contêiner usa `overflow: clip`, porque as órbitas transbordam a tela e um contêiner `hidden` ainda podia ser rolado por foco (aconteceu no e2e: a tela inteira deslocava).
- **Movimento reduzido.** Nada se desloca, gira, boia ou se aproxima: a bolinha só varia a escala de 0,84 a 0,88, o rosto troca só por opacidade (olhos, bochechas, boca), sem piscar nem baforadas, e o ritmo segue guiado pela luz, pela barra, pelo rótulo e pela contagem. O seletor abre por opacidade, sem desdobrar.
- **Ciclo de vida.** Ir para o segundo plano (`visibilitychange`/`pagehide`) encerra a sessão e mostra "Pausado. Toque para continuar"; sair da tela cancela o rAF, os listeners, o wake lock e o som. O **wake lock** mantém a tela acesa durante a sessão e é pedido de novo quando o sistema o solta; falha em silêncio (no iOS, em PWA instalada, só funciona a partir do 18.4, bug WebKit 254545).
- **Som ambiente**, desligado de fábrica: ruído marrom num filtro passa-baixa (Web Audio, sem arquivos) que abre na inspiração, como vento ou mar. Começa dentro do toque (exigência do iOS) e usa `audioSession.type = "ambient"` quando existe: mistura com a música de quem estiver ouvindo e respeita a chave de silêncio. Volume e timbre ainda precisam de ajuste de ouvido no aparelho (`breath-audio.ts`, constantes no topo).
- **Sem háptico.** `navigator.vibrate` não existe no iOS; a experiência é completa sem ele. Fica como melhoria progressiva para outros aparelhos.
- **Preferências** (ritmo e som) só no aparelho, como as da água (`data/breath-prefs.ts`, apagadas ao sair da conta). Nada no Supabase, nenhuma migração.
- **Fora da primeira versão:** duração de sessão e lembretes, histórico de sessões, háptico, outros sons, ritmo personalizado, respiração pelo assistente.
