# Avaliação de LGPD: Tars aberto ao público (com o plano de treino com IA)

Feita em 2026-10-28, a pedido do Pedro, olhando o código atual e o plano de treino (fases 0–3). **Não é parecer jurídico.** É
um levantamento técnico do que a lei e as resoluções da ANPD exigem para este app, com as fontes no fim. Os pontos marcados com
⚖️ precisam de confirmação de um advogado antes do lançamento.

## Resumo

1. **Hoje a LGPD não se aplica.** Com o app usado só pelo Pedro, com os dados dele e sem fim econômico, vale a exclusão do
   art. 4º, I. Passa a valer por inteiro no dia em que outra pessoa usar o app pago.
2. **O ponto mais sensível é dado de saúde.** Dor, lesão e restrição física (previstas para o formulário da fase 1) são **dado
   pessoal sensível** (art. 5º, II). Só podem ser tratados com **consentimento específico e destacado** (art. 11, I), separado do
   aceite dos termos, revogável, e o app precisa funcionar sem eles. Por isso a fase 0 **não** coletou dor por exercício.
3. **Tudo que vai para a IA sai do Brasil.** A Groq guarda os dados nos EUA. A Vercel, sem região configurada, também roda
   nos EUA. O Supabase depende da região escolhida no projeto. Transferência internacional exige uma das hipóteses do art. 33.
   Desde 23/08/2025, cláusulas contratuais só valem se forem as **cláusulas-padrão da ANPD** (Resolução CD/ANPD nº 19/2024), e
   não achei nenhuma adesão delas nos contratos de Supabase, Vercel ou Groq. ⚖️
4. **Falta uma peça obrigatória no app: excluir a conta.** O direito de eliminação (art. 18, VI) não tem caminho hoje. O resto
   dos direitos tem: acesso e portabilidade pelo backup (exportação v4) e correção pelas próprias telas.
5. **A arquitetura já ajuda muito.** RLS em todas as tabelas, navegador sem acesso direto ao banco, cookie `httpOnly`, CSP
   estrita, logs sem conteúdo do usuário (`server/log.ts`), IA que só propõe e nunca grava. O que falta é sobretudo documento,
   consentimento e configuração de fornecedor, não refazer o app.

## 1. Quem é quem

| Papel | Quem | Observação |
|---|---|---|
| Controlador | O Pedro (pessoa física) ou a empresa que vender o app | Decide finalidades e meios. Pessoa física que trata dados com fim econômico é agente de tratamento |
| Operadores | Supabase (banco e login), Vercel (servidor do app), Groq (IA) | Tratam dados em nome do controlador. Precisam de contrato (os DPAs deles) |
| Titular | Cada usuário | Os direitos do art. 18 valem para cada um |

**Pequeno porte (Resolução CD/ANPD nº 2/2022):** pessoa natural, ME, EPP e startup podem usar o regime simplificado. O principal
efeito: **não precisam indicar encarregado (DPO)**, mas precisam de um **canal de atendimento** ao titular e à ANPD. O regime
**não vale** para tratamento de **alto risco**, que exige ao mesmo tempo um critério geral (larga escala, ou afetar
significativamente interesses e direitos fundamentais) **e** um critério específico (entre eles: dados sensíveis, decisões
unicamente automatizadas, tecnologias emergentes). O app terá dados de saúde e IA (critérios específicos). Em pequena escala, o
critério geral provavelmente não se cumpre, mas a ANPD pode exigir as obrigações dispensadas conforme o caso. ⚖️

## 2. Inventário dos dados

| Dado | Onde | Sensível? | Observação |
|---|---|---|---|
| E-mail, senha (hash), nome de exibição | Supabase Auth, `profiles` | Não | Identificação da conta |
| Lançamentos, categorias, orçamentos, metas | Supabase | Não (pela lei) | Alto impacto se vazar: tratar com o mesmo cuidado |
| Treinos (cargas, repetições, séries), corridas, água | Supabase | **Zona cinzenta** ⚖️ | Desempenho físico. A lei não define "dado referente à saúde" com precisão. A leitura conservadora trata como saúde o que revela condição física |
| "Como foi?" (esforço 1–4), fase 0 | Supabase | Provavelmente não ⚖️ | Percepção de esforço do treino, não diagnóstico. Fica opcional |
| Dor, lesão, restrição e resultado da triagem (fase 1, feito) | Supabase e prompt da IA | **Sim** | Art. 11: consentimento específico e destacado, antes das perguntas. A triagem guarda só o resultado |
| Idade, sexo, peso, medidas (não planejados) | — | Peso e medidas tendem a ser saúde | **Não coletar** enquanto não houver necessidade real (minimização, art. 6º, III) |
| Estudos, leitura, respiração | Supabase / aparelho | Não | A respiração não vai ao servidor |
| Mensagens do assistente e resumos enviados à IA | Groq (EUA) | Depende do que a pessoa escreve | Hoje vão resumos de finanças, treino, corrida, estudo e leitura |
| Rascunho do treino, preferências | Só no aparelho | Não | Apagados ao sair da conta |

## 3. Bases legais por finalidade

| Finalidade | Base | Artigo |
|---|---|---|
| Conta, login, guardar e mostrar os registros da pessoa | Execução de contrato | art. 7º, V |
| Cobrança e documentos fiscais (quando houver) | Obrigação legal / contrato | art. 7º, II e V |
| Segurança, prevenção a fraude e abuso, logs técnicos | Legítimo interesse (com teste de balanceamento) | art. 7º, IX e art. 10 |
| Assistente de IA e plano de treino com **dados comuns** | Execução de contrato (é a função contratada) | art. 7º, V |
| Plano de treino com **dor, lesão ou restrição** | **Consentimento específico e destacado** | art. 11, I |
| Envio dos dados sensíveis ao exterior (Groq) | **Consentimento específico**, informando o caráter internacional ⚖️ | art. 33, VIII |

Para dado sensível, "execução de contrato" **não** está entre as bases do art. 11. Por isso o consentimento é o caminho para a
parte de saúde.

## 4. Pontos críticos e o que fazer

### 4.1 Dados de saúde no plano de treino

- **Tela de consentimento própria, antes das perguntas de dor e restrição.** Texto curto e destacado: o que será coletado, para quê
  (montar e ajustar o treino), que vai para a IA nos EUA e que dá para seguir sem responder. Não pode ficar escondido nos termos.
- **Opcional de verdade.** Sem consentimento, o plano é gerado sem essas informações, com um aviso para procurar um
  profissional se houver dor.
- **Revogável** (art. 8º, §5º) em Configurações. Revogar apaga as respostas de saúde e desliga o uso delas nas próximas revisões.
- **Por categoria, não texto livre.** Lista fixa (ombro, lombar, joelho…). O campo "algo mais?" previsto na fase 1 avisa para não
  escrever informação médica. Também ajuda na minimização do que vai à IA.
- **Registro do consentimento:** quando, qual versão do texto e o que foi aceito (tabela própria). A prova do consentimento é
  do controlador (art. 8º, §2º).
- **Uso compartilhado de dado de saúde entre controladores com vantagem econômica é vedado** (art. 11, §4º). A Groq como operadora
  não é "outro controlador", desde que o contrato a impeça de usar os dados para fins próprios. ⚖️

### 4.2 Transferência internacional

- **Groq:** os dados ficam em buckets do Google Cloud **nos EUA** (documentação da Groq). Não há opção de região no Brasil, então
  a parte de IA sai do país de qualquer jeito.
- **Vercel:** o `vercel.json` não define região, então as funções tendem a rodar no padrão, nos EUA. Dá para fixar São Paulo
  (`"regions": ["gru1"]`), conforme o plano da Vercel.
- **Supabase:** a região está no painel (Settings → General). **Se não for São Paulo (`sa-east-1`)**, a melhor hora de mudar é
  antes do lançamento: criar o projeto de produção em São Paulo e migrar os dados do Pedro custa pouco hoje.
- **Mecanismo jurídico:** o art. 33 aceita, entre outros, cláusulas contratuais (II), consentimento específico com informação
  prévia sobre o caráter internacional (VIII) e transferência necessária à execução do contrato (IX, com o art. 7º, V).
  Desde 23/08/2025, cláusulas contratuais só valem com as **cláusulas-padrão da ANPD** ou com cláusulas aprovadas por ela
  (Resolução CD/ANPD nº 19/2024). Os DPAs de Supabase e Vercel citam as cláusulas-padrão **europeias**, não as da ANPD. A
  Resolução 19 mantém os outros mecanismos do art. 33. ⚖️ Caminho provável: execução de contrato (art. 33, IX) para os dados
  comuns e consentimento (art. 33, VIII) para os sensíveis, mais pedir aos fornecedores a adesão às cláusulas da ANPD.

### 4.3 IA (Groq)

- **Ligar o Zero Data Retention** no console da Groq (Data Controls). Sem ele, entradas e saídas podem ficar em log por até
  **30 dias** para investigar abuso e confiabilidade. Com ele, nada é guardado.
- **Treinamento:** a página "Your Data" da Groq não fala sobre treinar modelos com os dados. Segundo terceiros, o contrato de
  serviços proíbe isso sem autorização do cliente. ⚖️ Conferir no contrato e dizer na política de privacidade.
- **Minimização no prompt** (já é o desenho do plano): só resumos calculados pelo servidor e categorias, **sem nome, e-mail nem
  ids de usuário**.
- **Decisões automatizadas (art. 20):** o titular pode pedir revisão de decisões tomadas só por máquina. O plano de treino já
  foi desenhado como **proposta**: a pessoa vê o motivo de cada mudança, aceita, edita ou mantém o plano atual. Falta dizer na
  política como pedir revisão (o canal de atendimento).

### 4.4 Direitos do titular (art. 18)

| Direito | Situação |
|---|---|
| Confirmação e acesso | ✅ As telas mostram tudo; o backup (`/api/export`, v4) entrega um arquivo completo |
| Portabilidade | ✅ Parcial: o JSON do backup. Formalizar na política |
| Correção | ✅ Edição pelas telas |
| **Eliminação** | ❌ **Não existe exclusão de conta.** Implementar antes do lançamento: apagar a conta no Supabase Auth leva os dados junto (as FKs têm `on delete cascade`), mais um prazo para os backups do Supabase |
| Informação sobre compartilhamento | Na política: Supabase, Vercel e Groq, e para quê |
| Revogação do consentimento | Fazer junto com a tela de consentimento (4.1) |

### 4.5 Canal, registros e incidentes

- **Canal do titular:** um e-mail divulgado na política. Para pequeno porte, substitui o encarregado, salvo alto risco.
- **Registro das operações (art. 37):** a versão simplificada vale para pequeno porte. Este documento, mais a tabela do item 2,
  já é a base.
- **Relatório de impacto (RIPD, art. 38):** a ANPD pode exigir. Com saúde e IA, vale ter um pronto. Este documento é o rascunho.
- **Incidente de segurança (Resolução CD/ANPD nº 15/2024):** comunicar à ANPD e aos titulares afetados em **3 dias úteis**
  contados de quando se sabe que dados pessoais foram atingidos (em dobro para pequeno porte, segundo fonte secundária ⚖️), e
  manter registro interno de todo incidente por 5 anos. Basta um roteiro curto de resposta.

### 4.6 Crianças e adolescentes

O art. 14 exige o "melhor interesse" e, para crianças, consentimento de um responsável. **Recomendo app só para maiores de 18**
(nos termos e numa confirmação no cadastro), o que também evita dado de saúde de menor.

### 4.7 Retenção

Definir e publicar: os dados vivem enquanto a conta existir; ao excluir a conta, tudo é apagado na hora do banco e sai dos
backups no ciclo de retenção do Supabase; os logs técnicos (sem conteúdo do usuário) ficam o prazo da Vercel; na Groq, nada com o
Zero Data Retention ligado.

## 5. O que isso muda no plano de treino

- **Fase 1:** a tela de consentimento de saúde vem **antes** das perguntas de dor e restrição, e elas são opcionais. Nada de
  idade, sexo ou peso, a menos que se prove necessário (a experiência sai do histórico). O texto do "algo mais?" avisa para não
  escrever informação médica. O prompt leva categorias e resumos, nunca identificadores.
- **Fase 1 (feita em 2026-10-28):**
  - **O que já está no app:**
    - tela de consentimento antes da parte de saúde, que é opcional ("Pular esta parte");
    - limitações por lista fixa de regiões;
    - triagem inspirada no PAR-Q que guarda só o resultado;
    - o instante do consentimento, com um CHECK no banco que recusa limitações sem ele;
    - o plano aceito guardado sem os dados de saúde;
    - um prompt sem nome nem e-mail;
    - o aviso no "Algo mais?" para não escrever informação médica.
  - **Ainda falta antes do público:**
    - guardar **qual versão do texto** de consentimento foi aceita, não só quando;
    - revogar também em Configurações (hoje é refazendo as perguntas e pulando a saúde, o que já apaga);
    - a revisão profissional da lista de cautela por região e da triagem ⚖️.
- **Fase 2:** as perguntas do fim do bloco seguem a mesma regra (dor nova só com consentimento ativo).
- **Fase 0 (feita):** o "como foi?" é opcional e não é diagnóstico; dor por exercício ficou de fora de propósito.

## 6. Checklist antes de abrir ao público

1. Política de privacidade e termos de uso em PT-BR (inventário, finalidades, bases, operadores, transferência internacional,
   retenção, direitos, canal, maioridade).
2. Exclusão de conta pelo app.
3. Tela de consentimento de saúde (registrado, revogável) antes de qualquer pergunta de dor ou restrição.
4. Zero Data Retention ligado na Groq.
5. Supabase de produção em `sa-east-1` e funções da Vercel em `gru1`, se o plano permitir.
6. Canal de atendimento (e-mail) e um roteiro curto de incidente.
7. Confirmação de maioridade no cadastro.
8. Conferir com advogado os itens ⚖️, em especial a base para a transferência internacional e se dados de treino contam como
   saúde.

Fora da LGPD, mas no mesmo pacote de lançamento: o enquadramento do plano de treino frente à Lei 9.696/1998 (profissão de
Educação Física; o app deve falar em "sugestão gerada automaticamente", nunca em "prescrição"), e o direito de arrependimento de
7 dias em compras pela internet (Código de Defesa do Consumidor, art. 49).

## Fontes

- Lei nº 13.709/2018 (LGPD), texto compilado: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Resolução CD/ANPD nº 19/2024 (transferência internacional), texto: https://arq.migalhas.com.br/arquivos/2026/2/DC8DD5485D6EBE_RESOLUCAOCD_ANPDNº19,DE23DEAGO.pdf
- Lefosse, prazo das cláusulas-padrão (23/08/2025): https://lefosse.com/noticias/alerta/transferencia-internacional-de-dados-prazo-para-adocao-das-clausulas-padrao-da-anpd-se-encerra-em-23-de-agosto/
- Mattos Filho, regulamento de transferência internacional: https://www.mattosfilho.com.br/unico/regulamentacao-transferencia-internacional-dados/
- Resolução CD/ANPD nº 2/2022 (pequeno porte): https://www.normasbrasil.com.br/norma/resolucao-2-2022_426801.html e resumo da Demarest: https://www.demarest.com.br/conselho-diretor-aprova-regulamento-de-aplicacao-da-lgpd-para-agentes-de-tratamento-de-pequeno-porte/
- Resolução CD/ANPD nº 15/2024 (incidentes): https://www.mattosfilho.com.br/unico/regulamento-incidente-seguranca/ e https://confidata.com.br/blog/comunicacao-incidente-seguranca-anpd
- Groq, "Your Data" (retenção, Zero Data Retention, região): https://console.groq.com/docs/your-data
- Supabase, Data Processing Addendum: https://supabase.com/legal/customer-resources/data-processing-addendum
- Vercel, Data Processing Addendum: https://vercel.com/legal/dpa
