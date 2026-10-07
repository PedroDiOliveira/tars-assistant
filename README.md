# Tars

App pessoal, mobile-first, para acompanhar **metas da rotina** (finanças, treino, estudos e leitura) com registros rápidos e progresso fácil de ler.

> **Estado atual: protótipo visual com dados de demonstração.** Não há login, banco nem IA reais ainda. Tudo o que você vê é calculado em cima de dados fictícios guardados só no navegador (`localStorage`), identificados na interface pelo selo **Demonstração**. O objetivo desta fase é validar visual e usabilidade antes de construir o backend.

A especificação original está em [docs/especificacao-app-pessoal.md](docs/especificacao-app-pessoal.md). O que foi mudado em relação a ela, e por quê, está em [docs/decisoes.md](docs/decisoes.md).

## Rodando

Requer Node 20+ (testado com 22) e npm.

```bash
npm install
npm run dev     # http://localhost:3000 e também pelo IP da rede
```

**Para testar no iPhone** (mesma rede Wi-Fi): abra `http://<IP-do-computador>:3000` no Safari, depois *Compartilhar → Adicionar à Tela de Início*. Em HTTP o app funciona normalmente; só não há HTTPS (necessário apenas na publicação).

> O servidor de desenvolvimento do Next só libera `localhost` por padrão; aberto pelo IP da rede, ele bloqueia os próprios arquivos e a tela fica presa no esqueleto de carregamento. Por isso o [next.config.ts](next.config.ts) detecta os IPs da máquina e os libera em `allowedDevOrigins`. **Se você trocar de rede, reinicie o `npm run dev`** para o novo IP ser detectado.

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm test` | Testes das regras de negócio (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript |

## O que já existe

- **Início**: metas do mês/semana (anel + "n de m"), ações rápidas, "Atenção desta semana" (regras de ritmo, sem IA) e sequências semanais.
- **Finanças**: resultado do mês, meta de economia, despesas por categoria x limite, lançamentos com filtros e busca, lançamento rápido (teclado numérico, atalhos), lançamento por texto (simulado) com confirmação.
- **Treino**: semana com bolinhas, fichas, sessão em andamento (séries pré-preenchidas com a última vez, descanso, rascunho que sobrevive a recarregar), histórico, recorde e evolução por exercício.
- **Estudos**: cronômetro por timestamps (pausa/retomada/recarga), meta semanal geral e por matéria, registro manual. **Leitura**: livro atual, páginas da semana, sessões (posição inicial → final), estados do livro.
- **Assistente** (simulado), **Configurações** (tema, metas com vigência, atalhos, resetar demo) e **Login** (só layout).
- Modo claro/escuro seguindo o sistema, áreas seguras do iPhone, alvos de toque de 44 px, sem rolagem horizontal em 375 px.

## Como o código está organizado

```
src/
  domain/    Regras puras e testadas: dinheiro em centavos, períodos (semana na segunda),
             metas por vigência, resumos, sequências, atenção, interpretador de lançamento.
  data/      ÚNICO ponto de acesso a dados das telas (hooks). Hoje lê o store mock;
             na fase real só ele muda para o Supabase.
    mock/    seed gerado em relação a "hoje" + store (zustand + localStorage).
  components/ Telas por módulo (finance, workouts, studies, reading, home, ...) e peças
             compartilhadas (anel/barra de progresso, sheets, estados vazios).
  app/       Rotas: (tabs) com barra inferior; (sub) telas internas; login.
  lib/       Constantes (nome, fuso, moeda), datas, formatação.
```

Regra de ouro: **telas nunca importam `data/mock/*`**, só `@/data`. E nenhuma tela faz conta de negócio inline: totais, metas e períodos saem de `src/domain`, o que garante que a Início e cada módulo mostrem os mesmos números.

Para mudar o nome do app, o fuso ou a moeda: [src/lib/constants.ts](src/lib/constants.ts). Para mudar a identidade visual: os tokens de cor no topo de [src/app/globals.css](src/app/globals.css) (cor primária + uma cor por módulo).

## Premissas desta fase

- Um único usuário; fuso `America/Sao_Paulo`, moeda BRL e semana começando na segunda são constantes.
- Datas de negócio são `YYYY-MM-DD` (sem deslocar por fuso); instantes são epoch ms.
- Dinheiro é sempre inteiro em centavos.
- Uma sessão de estudo pertence ao dia em que começou, mesmo se virar a meia-noite.
- Sessões de cronômetro com menos de 1 minuto são descartadas.
- Não há edição de fichas de treino nem de categorias neste protótipo (as telas de execução e histórico usam as fichas do seed).

## Próximas fases

1. Fundação real: Supabase Auth (cadastro desativado após criar a conta do dono), schema com RLS, trocar `src/data`.
2. Finanças, treino, estudos/leitura reais; Início integrada.
3. IA (verificar preço/limites do provedor antes), sempre com confirmação.
4. PWA/publicação na Vercel e validação no iPhone real.

## Limitações conhecidas

- Validação em iPhone real (Safari, tela de início, bloqueio/desbloqueio) ainda pendente.
- Sem service worker nem tela offline (decisão registrada em `docs/decisoes.md`).
- Exportação de dados aparece desabilitada ("em breve").
