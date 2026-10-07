# App pessoal de finanças, treino e estudos

> Briefing de produto e implementação para uma IA de código. Nome provisório: **Meu Ritmo**. O nome pode ser alterado sem mudar o escopo.

## 1. Instrução para a IA de código

Construa uma aplicação web pessoal, mobile-first, que reúna controle financeiro, acompanhamento de treinos e acompanhamento de estudos e leitura. A aplicação será hospedada na Vercel, usará Supabase e deverá poder ser adicionada à tela inicial do iPhone como PWA.

Use este documento como especificação. Antes de implementar, examine o repositório, caso exista, e preserve suas convenções. Organize um plano curto e execute em etapas funcionais. Tome decisões rotineiras com autonomia e registre as premissas no README. Pergunte somente quando houver um bloqueio real ou uma decisão que altere significativamente o produto.

Entregue uma aplicação funcional, com persistência e autenticação reais. Dados fictícios devem existir apenas em um modo de demonstração explicitamente identificado, separado dos dados pessoais. Não apresente recursos incompletos como funcionais.

Priorize simplicidade, boa experiência no celular e baixo custo. Não expanda o escopo para rede social, plataforma comercial ou sistema multiagente.

## 2. Visão do produto

Um painel pessoal de evolução que ajude a responder diariamente:

- Como estão minhas receitas, despesas e metas financeiras?
- Qual é meu treino e como estou evoluindo?
- Quanto estudei e li em relação às minhas metas?
- O que merece minha atenção nesta semana?

O conceito central é **acompanhar metas com registros rápidos e histórico confiável**. Cada módulo tem conteúdo próprio, mas a tela inicial e o assistente conectam as informações.

Público inicial: uso pessoal de um único proprietário. Mesmo assim, todos os dados devem pertencer a um usuário autenticado e ser isolados por usuário no banco.

Idioma: português brasileiro. Moeda inicial: BRL. Fuso padrão: America/Sao_Paulo, configurável no perfil.

## 3. Navegação e identidade visual

Barra inferior fixa com quatro itens, inspirada na facilidade de navegação do Nubank:

| Item | Rota sugerida | Conteúdo |
| --- | --- | --- |
| Início | `/inicio` | Resumo integrado e metas |
| Finanças | `/financas` | Receitas, despesas, categorias e orçamento |
| Treino | `/treino` | Fichas, execução, histórico e evolução |
| Estudos | `/estudos` | Matérias, sessões, livros e metas |

Configurações acessíveis pelo avatar no topo. Assistente global disponível em um botão discreto, abrindo uma tela ou painel de conversa. Evitar conflito entre esse botão, ações principais e barra inferior.

Direção visual:

- Aparência de aplicativo, com identidade própria; não copiar marca, logotipo ou telas do Nubank.
- Cards com hierarquia clara, bons espaçamentos e tipografia legível.
- Uma cor principal e cores secundárias consistentes para cada módulo.
- Ícones acompanhados de rótulos na navegação.
- Modo claro e escuro, inicialmente seguindo o sistema.
- Gráficos simples, sempre acompanhados dos valores em texto.
- Progresso com numerador, denominador e período: `3 de 4 treinos nesta semana`.
- Telas vazias úteis, com uma ação evidente para começar.
- Estados de carregamento, erro, salvamento e sucesso.
- Alvos de toque de pelo menos 44 × 44 pixels e navegação acessível.
- Respeitar a área segura inferior do iPhone e o teclado virtual.
- Sem rolagem horizontal na largura de 375 pixels; desktop também utilizável.

## 4. Escopo da primeira versão

A primeira versão deve conter os quatro módulos navegáveis, autenticação, metas, histórico e integração inicial de IA. Implementar por etapas, sem exigir que tudo seja construído de uma vez.

| Área | Incluído na primeira versão | Evolução posterior |
| --- | --- | --- |
| Início | Cards, metas, atalhos e resumo factual | Insights proativos |
| Finanças | CRUD, categorias, filtros, resumo, orçamentos e lançamento por texto | Contas, cartões, parcelas, recorrências e importação |
| Treino | Fichas, séries, cargas, histórico, comparação e meta semanal | Sugestões de progressão e planejamento por IA |
| Estudos | Matérias, cronômetro, registro manual, histórico e metas | XP, níveis e integração com editais |
| Leitura | Livros, progresso, sessões e meta de páginas | Notas, citações e recomendações |
| Assistente | Interpretar lançamento financeiro e consultar resumos dos módulos | Registro por voz e ações em outros módulos |
| PWA | Instalação, interface standalone e aviso offline | Sincronização offline e notificações push |

## 5. Tela inicial

Exibir saudação e data local, seguidas de:

1. **Finanças do mês:** receitas, despesas, resultado e progresso da meta de economia.
2. **Treino da semana:** quantidade concluída, meta e acesso rápido às fichas.
3. **Estudos da semana:** duração acumulada, meta e botão para iniciar sessão.
4. **Leitura:** livro em andamento, página atual e páginas lidas no período.
5. **Ações rápidas:** registrar gasto, iniciar treino e estudar/ler.

Não inventar um “próximo treino” se não houver planejamento. Nesse caso, mostrar “Escolher treino”. Não misturar métricas mensais e semanais sem identificar o período.

O resumo básico é calculado pelo sistema, sem depender de chamada à IA. Não fazer chamadas de IA a cada abertura da home.

## 6. Módulo financeiro

### 6.1 Funcionalidades

- Criar, editar e excluir receitas e despesas.
- Informar valor, data, categoria e descrição.
- Categorias iniciais editáveis: alimentação, transporte, moradia, saúde, lazer, compras, educação, salário e outros.
- Filtrar por mês, tipo e categoria; buscar pela descrição.
- Mostrar totais do mês, lista cronológica e distribuição das despesas por categoria.
- Configurar limite mensal por categoria e meta mensal de economia.
- Registrar manualmente ou interpretar uma mensagem com IA.

### 6.2 Fluxo de lançamento por IA

Exemplo: `Gastei 42 reais no Outback ontem`.

1. Enviar mensagem, data atual e fuso ao backend.
2. A IA extrai intenção, valor, data, descrição e categoria sugerida.
3. O backend valida a resposta estruturada.
4. Mostrar prévia editável com todos os campos.
5. Salvar somente após o usuário tocar em **Confirmar lançamento**.
6. Atualizar lista, gráficos e home sem duplicar o lançamento.

Exemplo: `Recebi 3500 de salário hoje` deve propor uma receita.

Se faltar valor ou houver ambiguidade relevante, perguntar antes de propor o registro. Categoria incerta pode ser “Outros”, claramente editável. Não inventar valores, estabelecimentos ou datas. Na primeira versão, processar um lançamento por confirmação; mensagens com vários lançamentos devem pedir separação.

### 6.3 Regras de cálculo

- Armazenar dinheiro em centavos inteiros e positivos; o campo de tipo diferencia receita e despesa.
- Resultado do mês = receitas do mês − despesas do mês.
- Chamar esse indicador de **resultado do mês**, pois não representa saldo bancário real.
- Meta de economia é acompanhada pelo resultado registrado, sem movimentar dinheiro.
- Despesas de uma categoria são comparadas ao seu orçamento no mesmo mês.
- Valores negativos de resultado devem ser exibidos; não ocultar déficit.
- A barra da meta pode ser limitada visualmente entre 0% e 100%, preservando o valor real em texto.
- Exclusões pedem confirmação e atualizam todos os totais.
- Cartões, transferências, parcelas e conciliação bancária ficam fora da primeira versão.

## 7. Módulo de treino

### 7.1 Fichas

Criar fichas como “Treino A — Peito e tríceps”, adicionar exercícios, ordenar a execução e definir séries, faixa de repetições, descanso sugerido e observações.

Permitir exercícios personalizados. Cada exercício deve ter identificação estável para comparar seu histórico entre fichas.

### 7.2 Execução

- Escolher ficha e iniciar sessão.
- Mostrar o último desempenho do mesmo exercício.
- Registrar carga em kg, repetições e conclusão de cada série.
- Permitir adicionar ou remover séries e registrar observações.
- Disponibilizar temporizador simples de descanso.
- Persistir o progresso para recuperar a sessão após recarregar ou bloquear a tela.
- Finalizar ou cancelar a sessão explicitamente.

Alterar uma ficha não deve reescrever um treino já realizado. A sessão precisa preservar uma cópia dos nomes e parâmetros relevantes da ficha no momento de sua criação.

### 7.3 Acompanhamento e metas

- Histórico por data e por exercício.
- Meta de sessões concluídas por semana, por exemplo, 4.
- Comparação de carga e repetições com a sessão anterior.
- Recorde simples de maior carga registrada no exercício, com repetições e data.
- Volume por exercício = soma de carga × repetições das séries concluídas com carga externa.

Não apresentar uma porcentagem genérica de “evolução” como se medisse força. Se comparar volume, informar exatamente que se trata de volume, usando sessões comparáveis. Exercícios de peso corporal podem ter carga externa igual a zero e não devem ser avaliados apenas por esse cálculo.

A primeira versão registra e compara treinos definidos pelo usuário. Prescrição automática de treino fica para uma etapa posterior.

## 8. Módulo de estudos e leitura

Na aba Estudos, usar duas seções internas: **Estudo** e **Leitura**.

### 8.1 Estudos

- Criar matérias, como SQL, Português, Redes e Segurança.
- Opcionalmente agrupar matérias por objetivo, como “Banco do Brasil”.
- Iniciar cronômetro vinculado a uma matéria.
- Pausar, retomar, finalizar ou descartar uma sessão.
- Registrar uma sessão manualmente, com data, duração e observação.
- Editar e excluir registros incorretos.
- Consultar duração por dia, semana, mês e matéria.
- Configurar meta semanal geral e, opcionalmente, meta semanal por matéria.

O cronômetro deve usar timestamps e tempo acumulado, e não depender de um contador JavaScript ativo em segundo plano. Recuperar o estado ao retornar ao app. Evitar duas sessões de estudo simultâneas do mesmo usuário, inclusive entre abas/dispositivos. Finalizações repetidas não podem duplicar a duração registrada.

### 8.2 Leitura

- Cadastrar título, autor opcional e total de páginas.
- Definir estado: quero ler, lendo, concluído ou pausado.
- Permitir informar a página inicial ao cadastrar um livro já em andamento.
- Registrar sessões com data, página inicial e página final.
- Mostrar progresso do livro e páginas efetivamente lidas no período.
- Configurar meta semanal de páginas.

Convenção: páginas inicial e final representam a posição no livro antes e depois da sessão. Páginas lidas = posição final − posição inicial. Ler da posição 30 até a 50 registra 20 páginas.

Não contar páginas anteriores ao cadastro como leitura desta semana. Posições devem estar entre zero e o total do livro. A primeira versão assume leitura linear; releitura deve ser tratada como nova jornada, posteriormente. Edições e exclusões precisam recalcular o progresso sem somar páginas duplicadas.

### 8.3 Gamificação posterior

Implementar somente depois que registros e metas estiverem estáveis:

- XP por matéria, derivado da duração das sessões válidas.
- Regra inicial sugerida: 1 XP por minuto completo estudado.
- Níveis com fórmula simples, determinística e documentada.
- Recalcular XP após editar ou excluir sessões.
- Sequência de dias baseada no fuso do usuário.

XP representa dedicação registrada, não domínio comprovado. Uma futura recomendação de concursos não deve tratar tempo estudado como evidência suficiente de competência.

## 9. Metas e períodos

Metas iniciais:

| Meta | Unidade | Período |
| --- | --- | --- |
| Economia | Centavos de resultado financeiro | Mensal |
| Limite por categoria | Centavos de despesa | Mensal |
| Treino | Sessões concluídas | Semanal |
| Estudo geral ou por matéria | Minutos | Semanal |
| Leitura | Páginas | Semanal |

A semana começa na segunda-feira no fuso do usuário. Dias e meses são definidos nesse mesmo fuso. Guardar instantes em UTC e datas de negócio como datas, sem deslocá-las acidentalmente na conversão.

Guardar metas por período concreto. Alterar a meta atual não deve reescrever metas passadas. Oferecer reaproveitamento da meta anterior para o próximo período.

Mostrar “Definir meta” quando não houver meta. Metas devem ter valor maior que zero; nunca dividir por zero. Não criar índice geral de produtividade misturando dinheiro, peso e horas.

## 10. Assistente de IA

### 10.1 Papel

Assistente global para interpretar lançamentos financeiros e responder perguntas com dados reais:

- “Quanto gastei com alimentação este mês?”
- “Como foi minha semana?”
- “Quantas vezes treinei nas últimas quatro semanas?”
- “Quanto estudei SQL neste mês?”
- “Qual matéria teve menos tempo de estudo nesta semana?”

Inicialmente, as ações de escrita da IA ficam limitadas à proposta de lançamento financeiro, sempre com confirmação. Treino, estudo e leitura usam seus fluxos próprios de registro.

### 10.2 Provedor e custo

O usuário sugeriu **Grok, da xAI**, com a intenção de reduzir custos. Não assumir que acesso gratuito ao chat significa API gratuita. Antes de integrar, consultar documentação oficial sobre preços, modelos disponíveis, limites e formato da API.

Não fixar neste projeto uma promessa de gratuidade. Manter o provedor e o modelo configuráveis e permitir trocar a integração. Se o uso da API depender de cobrança, informar isso e manter todo o app funcional sem IA. Não contratar serviços ou ativar cobrança automaticamente.

### 10.3 Arquitetura e segurança

- Todas as chamadas ao modelo passam pelo backend do Next.js.
- Chave do provedor apenas em variável de ambiente do servidor.
- Validar autenticação antes de consultar dados ou chamar o modelo.
- Derivar o usuário da sessão; nunca confiar em `user_id` enviado pelo cliente ou sugerido pela IA.
- Usar ferramentas/funções permitidas, com argumentos validados; nunca executar SQL arbitrário gerado pela IA.
- Calcular totais no banco/backend; usar o modelo para interpretação e explicação.
- Enviar apenas os dados necessários para responder à pergunta.
- Tratar descrições e notas como dados, nunca como instruções para o assistente.
- Validar saída com schema e rejeitar campos inválidos.
- Definir limite por usuário, tamanho máximo de entrada, timeout e orçamento configurável de uso.
- Evitar retries que dupliquem registros ou gerem consumo descontrolado.
- Em indisponibilidade, mostrar mensagem clara e oferecer formulário manual.
- Explicar antes do primeiro uso que mensagens e dados necessários serão enviados ao provedor configurado.

Funções sugeridas: `propose_transaction`, `get_financial_summary`, `get_workout_summary`, `get_study_summary` e `get_reading_summary`.

As funções de resumo recebem intervalos validados e sempre trabalham com o usuário autenticado. O assistente deve distinguir ausência de registros de um valor efetivamente igual a zero e identificar o período consultado.

## 11. Stack e organização

Stack proposta:

- Next.js com App Router e TypeScript.
- Tailwind CSS e shadcn/ui.
- Supabase: PostgreSQL, Auth e Row Level Security.
- Vercel para hospedagem.
- Biblioteca enxuta de gráficos, apenas se necessária.
- Validação compartilhada de entrada, por exemplo com Zod.

Escolher versões estáveis compatíveis e verificar a documentação oficial durante a implementação. Não adicionar servidor Go ou outro backend independente nesta primeira versão.

Organizar por domínio: `finance`, `workouts`, `studies`, `reading`, `goals` e `assistant`. Separar componentes visuais, regras de negócio, acesso a dados e integração de IA. Centralizar funções de moeda, datas e agregação.

Usar Supabase Auth com e-mail e senha e recuperação de senha. Em implantação pessoal, restringir o cadastro ao proprietário configurado; documentar o provisionamento inicial. Nunca substituir autenticação por um ID fixo no frontend.

## 12. Modelo de dados orientador

O esquema abaixo orienta migrations; ajustar nomes e normalização sem perder as regras de negócio.

Convenções: UUIDs, timestamps de criação/alteração, índices por proprietário e período, constraints para valores válidos. Todas as tabelas privadas devem ter proprietário e RLS. Relações entre tabelas devem garantir que pai e filho pertençam ao mesmo usuário, inclusive em operações diretas pelo cliente.

| Tabela | Campos principais |
| --- | --- |
| `profiles` | `id` referenciando `auth.users`, `display_name`, `timezone`, `currency` |
| `categories` | `id`, `user_id`, `name`, `type`, `color`, `archived_at` |
| `transactions` | `id`, `user_id`, `type`, `amount_cents`, `category_id`, `description`, `occurred_on`, `source`, `idempotency_key` |
| `budgets` | `id`, `user_id`, `category_id`, `month`, `limit_cents` |
| `financial_goals` | `id`, `user_id`, `month`, `target_savings_cents` |
| `exercises` | `id`, `user_id`, `name`, `muscle_group`, `load_type`, `archived_at` |
| `workouts` | `id`, `user_id`, `name`, `notes`, `archived_at` |
| `workout_exercises` | `id`, `user_id`, `workout_id`, `exercise_id`, `position`, `planned_sets`, `rep_min`, `rep_max`, `rest_seconds` |
| `workout_sessions` | `id`, `user_id`, `workout_id`, `workout_name_snapshot`, `status`, `started_at`, `finished_at`, `notes` |
| `session_exercises` | `id`, `user_id`, `session_id`, `exercise_id`, `name_snapshot`, `position`, `planned_parameters` |
| `exercise_sets` | `id`, `user_id`, `session_exercise_id`, `set_number`, `weight_kg`, `reps`, `completed` |
| `fitness_goals` | `id`, `user_id`, `week_start`, `target_sessions` |
| `study_subjects` | `id`, `user_id`, `name`, `objective_name`, `color`, `archived_at` |
| `study_sessions` | `id`, `user_id`, `subject_id`, `status`, `source`, `started_at`, `last_resumed_at`, `finished_at`, `accumulated_seconds`, `duration_seconds`, `occurred_on`, `notes` |
| `study_goals` | `id`, `user_id`, `subject_id` opcional, `week_start`, `target_minutes` |
| `books` | `id`, `user_id`, `title`, `author`, `total_pages`, `initial_page`, `status` |
| `reading_sessions` | `id`, `user_id`, `book_id`, `occurred_on`, `start_page`, `end_page`, `notes` |
| `reading_goals` | `id`, `user_id`, `week_start`, `target_pages` |

Regras adicionais:

- Unicidade de orçamento por usuário, categoria e mês; de meta por usuário, tipo e período.
- Para metas de estudo, garantir unicidade também quando `subject_id` for nulo.
- Chave de idempotência única por usuário para lançamentos sujeitos a repetição de requisição.
- Apenas sessões finalizadas entram nos totais de treino e estudo.
- Peso pode ter casas decimais; repetições são inteiras positivas nas séries concluídas.
- Arquivar categorias, exercícios, matérias e fichas já utilizados para preservar históricos.
- Documentar comportamento de exclusão; evitar cascatas que apaguem históricos inadvertidamente.
- Não persistir totais derivados sem uma razão concreta; inicialmente, calculá-los por consultas.
- Histórico persistente de chat é opcional e pode ficar fora da primeira versão.

## 13. PWA e comportamento no iPhone

- Manifesto com nome, nome curto, cores, ícones e modo standalone.
- Ícone apropriado para tela inicial e configuração de viewport/áreas seguras.
- HTTPS no ambiente publicado.
- Orientação curta para adicionar à tela inicial pelo Safari.
- Navegação sem depender de hover e formulários adequados ao teclado móvel.
- Restaurar sessão autenticada e recuperar sessões de treino/estudo em andamento.
- Cache apenas de recursos estáticos e tela offline na primeira versão.
- Não colocar respostas autenticadas, dados financeiros ou rotas de IA em cache público.
- Limpar caches/dados locais associados ao usuário ao sair da conta.
- Se estiver offline, informar que registros exigem conexão; não indicar sucesso sem persistência.

Não prometer execução contínua em segundo plano, widgets nativos ou equivalência completa com um app da App Store. Validar a experiência em Safari/iOS e o comportamento após bloquear e desbloquear a tela. Push e sincronização offline ficam para depois.

## 14. Sequência de implementação

### Etapa 1 — Fundação

Criar projeto, autenticação, perfil, estrutura de navegação, tema, conexão Supabase, migrations iniciais e políticas RLS. Entregar login funcional e abas com estados vazios úteis.

### Etapa 2 — Finanças

Implementar registros manuais, categorias, filtros, totais, orçamentos e meta de economia. Validar cálculos e isolamento entre usuários antes de integrar IA.

### Etapa 3 — Treino

Implementar fichas, execução persistente, séries, conclusão, histórico, comparação e meta semanal.

### Etapa 4 — Estudos e leitura

Implementar matérias, cronômetro recuperável, sessões manuais, livros, sessões de leitura, progresso e metas.

### Etapa 5 — Home integrada

Conectar os dados reais dos módulos, metas e atalhos. Garantir atualização após alterações em qualquer aba.

### Etapa 6 — IA

Verificar disponibilidade e custo do provedor. Implementar adaptador, proposta de lançamento com confirmação e consultas de resumos. Adicionar controles de uso e fallback manual.

### Etapa 7 — PWA e publicação

Configurar instalação, ícones, tela offline, revisar UX no iPhone e preparar deploy Vercel. Documentar variáveis, migrations e configuração dos redirecionamentos de autenticação. Não realizar contratações ou cobranças sem autorização.

## 15. Critérios de aceite e verificação

- [ ] Login, logout e recuperação de senha funcionam.
- [ ] Um usuário não consegue ler ou modificar dados de outro, incluindo via API direta e relações pai/filho.
- [ ] Barra inferior acessa as quatro áreas sem cobrir o conteúdo.
- [ ] Lançamentos persistem após recarregar; editar/excluir recalcula os totais.
- [ ] Receita de R$ 3.500 e despesa de R$ 42 resultam em R$ 3.458 no mesmo mês.
- [ ] A IA não salva antes da confirmação; confirmação repetida não duplica o lançamento.
- [ ] Treino em andamento é recuperado; somente concluídos contam na meta.
- [ ] Editar uma ficha não altera treinos anteriores.
- [ ] Cronômetro suporta pausa, recarga e retorno do segundo plano sem duplicar tempo.
- [ ] Leitura da posição 30 à 50 registra 20 páginas; página inicial de cadastro não vira sessão.
- [ ] Datas próximas à meia-noite e viradas de semana/mês respeitam o fuso configurado.
- [ ] Home e módulos exibem os mesmos totais para o mesmo período.
- [ ] Nenhuma chave secreta aparece no bundle, no repositório ou em logs.
- [ ] Falha ou ausência de IA mantém os formulários manuais utilizáveis.
- [ ] O app pode ser aberto pela tela inicial do iPhone, com navegação e áreas seguras corretas.
- [ ] Estados vazios, erros e offline não exibem dados fictícios como pessoais.

Priorizar testes automatizados das regras de dinheiro, períodos, duração, páginas, idempotência e RLS. Fazer uma verificação ponta a ponta dos fluxos principais. Registrar o que foi efetivamente testado e qualquer validação em dispositivo real ainda pendente.

## 16. Entregáveis esperados da IA de código

1. Código funcional organizado por domínio.
2. Migrations SQL, constraints, índices e políticas RLS versionados.
3. `.env.example` sem segredos, com variáveis necessárias e indicação de quais são exclusivas do servidor.
4. README com instalação, Supabase, autenticação, execução local, integração de IA e deploy na Vercel.
5. PWA com manifesto, ícones e comportamento offline definido.
6. Verificações das regras críticas e relatório breve de limitações.

**Definição de pronto:** consigo abrir o app no iPhone, autenticar, registrar gastos, realizar um treino, registrar estudo e leitura, consultar metas e recuperar meus dados depois. A IA facilita essas tarefas quando configurada, sem ser uma dependência para o uso básico.
