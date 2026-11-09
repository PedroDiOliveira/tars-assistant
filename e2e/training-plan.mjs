/**
 * Plano de treino (fase 1) no modo DEMO, num celular (375 px): as perguntas (uma por tela), a geração pelo modelo
 * pronto, a revisão com troca de exercício, a proposta que sobrevive a recarregar, o aceite (fichas novas, antigas
 * arquivadas) e os caminhos da parte de saúde (pular, e a triagem que recomenda liberação médica).
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:plan                        ou  BASE=http://localhost:3101 node e2e/training-plan.mjs
 *
 * Cada verificação imprime PASS/FAIL e o processo sai com código 1 se alguma falhar.
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};
const shot = (name) => path.join(OUT, `plan-${name}.png`);
const norm = (s) => s.replace(/\s+/g, " ").trim();

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
});
// O indicador do Next em desenvolvimento fica por cima dos botões do rodapé. Ele não é do app: some nos testes.
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.head.append(style);
  });
});
const page = await context.newPage();
const problems = [];
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) problems.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));

async function open(route) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 30000 });
  await page.waitForSelector(".launch-screen", { state: "detached", timeout: 30000 });
  await page.waitForTimeout(200);
}
const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const button = (name) => page.getByRole("button", { name, exact: typeof name === "string" });
const question = () => page.locator("#plan-question").innerText();
const pageText = async () => norm(await page.locator("main").first().innerText());
/** Um treino por vez na tela: junta o texto de todas as abas (e os nomes dos treinos, que ficam no rótulo da aba). */
const allDaysText = async () => {
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  if (count === 0) return pageText();
  let text = "";
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    text += ` ${await tabs.nth(i).getAttribute("aria-label")} ${await pageText()}`;
  }
  await tabs.first().click();
  return norm(text);
};
const menu = async (name) => {
  await page.getByRole("button", { name: "Mais opções do plano" }).click();
  const sheet = page.getByRole("dialog", { name: "Mais opções" });
  await sheet.waitFor();
  return sheet.getByRole(name === "Refazer as perguntas" ? "link" : "button", { name, exact: true });
};
/** Nomes dos exercícios do treino aberto, na ordem (o rótulo da alça diz o nome e a posição). */
const order = async () =>
  (await page.getByRole("button", { name: /^Mudar a posição de / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).map((l) =>
    l.replace(/^Mudar a posição de /, "").replace(/ \(\d+ de \d+\)$/, ""),
  );

/** Responde "Não" (ou o que vier em `answers`) às perguntas de prontidão. */
async function answerScreening(answers = []) {
  const groups = page.getByRole("group");
  const count = await groups.count();
  for (let i = 0; i < count; i++) await groups.nth(i).getByRole("button", { name: answers[i] ? "Sim" : "Não", exact: true }).click();
}

const KNEE_CAUTION = ["Agachamento livre", "Agachamento frontal", "Agachamento hack", "Agachamento no Smith", "Agachamento búlgaro", "Afundo"];

try {
  // ---------- 1. entrada ----------
  await open("/treino");
  const card = page.getByRole("link", { name: /Montar meu plano/ });
  check("Musculação: o card 'Montar meu plano' aparece para quem ainda não respondeu", (await card.count()) === 1);
  await card.click();
  await page.waitForURL("**/treino/plano");
  await page.waitForSelector("text=Um plano de treino feito para você");
  check("Apresentação explica o que vai acontecer e oferece começar", (await page.getByRole("link", { name: "Começar" }).count()) === 1);
  await page.getByRole("link", { name: "Começar" }).click();
  await page.waitForURL("**/treino/plano/perguntas");

  // ---------- 2. perguntas ----------
  await page.waitForSelector("text=Qual é o seu objetivo principal?");
  check("Uma pergunta por tela, com a posição (1 de 10)", (await page.getByText("Pergunta 1 de 10").count()) === 1);
  await page.getByRole("button", { name: /Ganhar massa/ }).click();
  check("Tocar numa opção já passa para a próxima pergunta", (await question()) === "Há quanto tempo você treina?");
  await page.getByRole("button", { name: /Já treino/ }).click();
  check("A pergunta dos dias avisa que os treinos podem se revezar", (await pageText()).includes("3 treinos que se revezam"));
  await button("4 dias").click();
  await button("60 min").click();
  await page.getByRole("button", { name: /^Academia/ }).click();
  check("Antes da saúde, o consentimento (dado de saúde) com a opção de pular", (await button("Concordo, quero responder").count()) === 1 && (await button("Pular esta parte").count()) === 1);
  await page.screenshot({ path: shot("consent"), fullPage: true });
  await button("Concordo, quero responder").click();
  await button("Joelho").click();
  check("Limitação marcada fica indicada (aria-pressed)", (await button("Joelho").getAttribute("aria-pressed")) === "true");
  await button("Continuar").click();
  check("Triagem: 'Continuar' só libera com todas respondidas", await button("Continuar").isDisabled());
  await answerScreening();
  await button("Continuar").click();
  await button("Costas").click();
  await button("Continuar").click();
  await page.getByRole("textbox", { name: "Algo mais" }).fill("Treino de manhã");
  check("Voltar à pergunta anterior mantém as respostas", await (async () => {
    await button("Voltar à pergunta anterior").click();
    const pressed = await button("Costas").getAttribute("aria-pressed");
    await button("Continuar").click();
    return pressed === "true";
  })());
  check("No horizontal scroll nas perguntas", await noHorizontalScroll());
  await button("Gerar meu plano").click();

  // ---------- 3. geração e revisão ----------
  await page.waitForURL("**/treino/plano");
  const status = await page.getByRole("status").filter({ hasText: "Montando seu plano" }).count();
  check("Enquanto monta, a tela mostra as etapas", status === 1);
  await page.waitForSelector("text=Recado do Tars", { timeout: 15000 });
  const review = await allDaysText();
  check("Um treino por vez: abas A, B, C e D", (await page.getByRole("tab").allInnerTexts()).join("") === "ABCD");
  check("O cabeçalho diz como os treinos se encaixam na semana, sem jargão", review.includes("4 treinos, um para cada dia (A, B, C, D)"));
  check("4 dias viram superior e inferior, em 4 fichas", review.includes("Superior e inferior") && ["Superior A", "Inferior A", "Superior B", "Inferior B"].every((n) => review.includes(n)), review.slice(0, 200));
  check("Sem IA no demo: o plano diz que é do modelo pronto", review.includes("Plano do modelo pronto"));
  check("O porquê cita a limitação marcada", review.includes("joelho"));
  check("Nenhum exercício que costuma forçar o joelho entrou", KNEE_CAUTION.every((name) => !review.includes(name)), KNEE_CAUTION.filter((n) => review.includes(n)).join(", "));
  check("Cada treino diz quanto tempo leva", /cerca de \d+ min/.test(review));
  check("O que a pessoa já faz aparece marcado", review.includes("você já faz"));
  const science = page.getByRole("region", { name: "Por que este treino funciona" });
  check("'Por que este treino funciona' vem recolhida (uma linha só, dizendo em quantos estudos se baseia)", !(await science.getByText("Volume da semana").isVisible()) && (await science.innerText()).includes("baseado em 5 estudos"));
  await science.getByText("Por que este treino funciona").click();
  const scienceText = norm(await science.innerText());
  check("Um toque abre na hora, em frases simples ligadas às respostas", scienceText.includes("Volume da semana") && scienceText.includes("Nos seus 4 dias"), scienceText.slice(0, 160));
  check("Referências ainda recolhidas dentro dela", !(await science.getByText(/doi:10\./).first().isVisible()));
  await science.getByText("Ver as referências").click();
  check("Abrindo, as referências completas aparecem com DOI", (await science.getByRole("link", { name: /^doi:10\./ }).count()) === 5);
  await science.screenshot({ path: shot("science") });
  await science.getByText("Ver as referências").click();
  await science.getByText("Por que este treino funciona").click();
  check("Sem rolagem horizontal na revisão", await noHorizontalScroll());
  await page.screenshot({ path: shot("review"), fullPage: true });

  // ---------- 4. trocar exercício ----------
  const swap = page.getByRole("button", { name: /^Trocar / }).first();
  const before = (await swap.getAttribute("aria-label")).replace("Trocar ", "");
  await swap.click();
  const sheet = page.getByRole("dialog", { name: "Trocar exercício" });
  await sheet.waitFor();
  const option = sheet.getByRole("button").filter({ hasNotText: "Fechar" }).first();
  const chosen = norm(await option.innerText()).split(" Barra")[0].split(" Halteres")[0].split(" Máquina")[0].split(" Polia")[0].split(" Smith")[0];
  await option.click();
  await sheet.waitFor({ state: "hidden" });
  const afterSwap = await pageText();
  check("Trocar: o exercício escolhido entra no lugar", afterSwap.includes(chosen) && (await page.getByRole("button", { name: `Trocar ${before}`, exact: true }).count()) === 0, `${before} -> ${chosen}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Recado do Tars", { timeout: 15000 });
  check("A proposta (com a troca) sobrevive a recarregar a página", (await pageText()).includes(chosen));

  // ---------- 4b. mudar a ordem e a prescrição ----------
  await page.getByRole("button", { name: /^Mudar a posição de / }).first().waitFor();
  const start = await order();
  const handle = page.getByRole("button", { name: /^Mudar a posição de / }).first();
  const target = page.getByRole("button", { name: /^Mudar a posição de / }).nth(2);
  // Lista no meio da tela: perto da borda, a rolagem automática do arrasto leva o item além do alvo.
  await page.getByRole("button", { name: /^Mudar a posição de / }).nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 6, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await order();
  check("Arrastar pela alça leva o 1º exercício para a 3ª posição", dragged[2] === start[0] && dragged[0] === start[1], `${start.join(" | ")} -> ${dragged.join(" | ")}`);
  check("Arrastar avisa com Desfazer", (await page.getByRole("button", { name: "Desfazer" }).count()) === 1);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await page.waitForTimeout(300);
  check("Desfazer volta a ordem anterior", JSON.stringify(await order()) === JSON.stringify(start));

  await page.keyboard.press("Escape").catch(() => undefined);
  const firstHandle = page.getByRole("button", { name: /^Mudar a posição de / }).first();
  await firstHandle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  const keyed = await order();
  check("Pelo teclado (espaço, seta, espaço) também muda a ordem", keyed[1] === start[0] && keyed[0] === start[1], keyed.join(" | "));

  await page.getByRole("button", { name: new RegExp(`^${keyed[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first().click();
  const detail = page.getByRole("dialog", { name: keyed[0] });
  await detail.waitFor();
  check("Tocar no exercício abre os detalhes com a posição", (await detail.getByText("Posição no treino: 1 de").count()) === 1);
  await detail.getByRole("button", { name: "Descer" }).click();
  check("Descer pela folha (alternativa a arrastar) muda a posição", (await detail.getByText("Posição no treino: 2 de").count()) === 1);
  const setsGroup = detail.getByRole("radiogroup", { name: "Séries" });
  const setOptions = setsGroup.getByRole("radio");
  const picked = setOptions.last();
  const pickedLabel = await picked.innerText();
  await picked.click();
  check("Séries: a escolhida fica marcada", (await picked.getAttribute("aria-checked")) === "true");
  await page.keyboard.press("Escape");
  await detail.waitFor({ state: "hidden" });
  // Enquanto a folha termina de fechar, o fundo ainda está fora da árvore de acessibilidade.
  await page.getByRole("button", { name: /^Mudar a posição de / }).first().waitFor();
  const afterSheet = await order();
  check("A ordem da folha vale na lista", afterSheet[1] === keyed[0], afterSheet.join(" | "));
  check("As séries novas aparecem na linha", (await pageText()).includes(`${pickedLabel} ×`));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Recado do Tars", { timeout: 15000 });
  await page.getByRole("button", { name: /^Mudar a posição de / }).first().waitFor();
  check("Ordem e séries sobrevivem a recarregar", JSON.stringify(await order()) === JSON.stringify(afterSheet));
  const expectedFirstFicha = await order();

  // ---------- 4c. ajustar o plano (chips pelas regras; o texto livre precisa de IA) ----------
  const minutesA = async () => Number((await pageText()).match(/cerca de (\d+) min/)?.[1]);
  const beforeShort = await minutesA();
  await button("Ajustar o plano").click();
  const adjust = page.getByRole("dialog", { name: "O que você quer mudar?" });
  await adjust.waitFor();
  check("Ajustar: opções por toque e um campo para escrever", (await adjust.getByRole("button", { name: "Treino mais curto" }).count()) === 1 && (await adjust.getByRole("textbox", { name: "Outra coisa" }).count()) === 1);
  await adjust.getByRole("textbox", { name: "Outra coisa" }).fill("quero mais costas");
  await adjust.getByRole("button", { name: "Pedir ao Tars" }).click();
  check("No demo, pedir à IA explica que não há IA e manda usar as opções", (await adjust.getByRole("alert").innerText()).includes("não há IA"));
  await adjust.getByRole("button", { name: "Treino mais curto" }).click();
  const previewSheet = page.getByRole("dialog", { name: "Confira antes de aplicar" });
  await previewSheet.waitFor();
  const cards = previewSheet.getByRole("button", { pressed: true });
  const cardCount = await cards.count();
  check("Mais curto: prévia de antes → depois, uma mudança por treino, todas marcadas", cardCount === 4 && (await previewSheet.innerText()).includes("séries"), String(cardCount));
  check("A prévia diz em que se baseia, com referências recolhidas", (await previewSheet.getByText(/^Baseado em: volume da semana/).count()) === 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("adjust") });
  await cards.first().click();
  check("Desmarcar um cartão tira a mudança da conta", (await previewSheet.getByRole("button", { name: "Aplicar 3 mudanças" }).count()) === 1);
  await previewSheet.getByRole("button", { name: "Aplicar 3 mudanças" }).click();
  await previewSheet.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /^Mudar a posição de / }).first().waitFor();
  check("Aplicado: avisa com Desfazer", (await page.getByText("3 mudanças aplicadas.").count()) === 1);
  await page.getByRole("tab").nth(1).click();
  const afterShortB = await minutesA();
  await page.getByRole("tab").first().click();
  check("O treino A (desmarcado) não mudou", (await minutesA()) === beforeShort);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("tab").nth(1).click();
  check("Desfazer volta todas as mudanças do ajuste de uma vez", (await minutesA()) > afterShortB, `${afterShortB}`);
  await page.getByRole("tab").first().click();

  await button("Ajustar o plano").click();
  await adjust.getByRole("button", { name: "Não curti um exercício" }).click();
  await page.getByRole("dialog", { name: "Qual exercício você não curtiu?" }).getByRole("button").filter({ hasText: expectedFirstFicha[0] }).click();
  check("Não curti um exercício: leva direto às opções de troca dele", await page.getByRole("dialog", { name: "Trocar exercício" }).isVisible());
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Trocar exercício" }).waitFor({ state: "hidden" });
  await button("Ajustar o plano").click();
  await adjust.getByRole("button", { name: /Mudar a divisão/ }).click();
  check("Mudar a divisão: abre as divisões do cabeçalho", await page.getByRole("dialog", { name: "Como dividir seus treinos" }).isVisible());
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Como dividir seus treinos" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /^Mudar a posição de / }).first().waitFor();
  check("Depois dos ajustes desfeitos, a ordem é a mesma", JSON.stringify(await order()) === JSON.stringify(expectedFirstFicha));

  // ---------- 4d. volume da semana e foco que sobe o volume DE VERDADE ----------
  const volume = page.getByRole("region", { name: "Volume da semana" });
  check("Volume da semana vem recolhido (só no objetivo massa)", (await volume.locator("details").count()) === 1 && !(await volume.getByText("A faixa sombreada").isVisible()));
  await volume.locator("details summary").click();
  check("Aberto, mostra os 8 músculos com séries efetivas", (await volume.getByRole("listitem").count()) === 8, String(await volume.getByRole("listitem").count()));
  const seriesOf = async (label) => {
    const text = await volume.getByRole("listitem").filter({ hasText: label }).first().innerText();
    return Number(text.match(/([\d,]+) séries/)[1].replace(",", "."));
  };
  const chestBefore = await seriesOf("Peito");
  await volume.locator("details summary").click();
  await button("Ajustar o plano").click();
  await adjust.getByRole("button", { name: "Mais foco em um grupo" }).click();
  await page.getByRole("dialog", { name: "Mais foco em qual grupo?" }).getByRole("button", { name: "Peito", exact: true }).click();
  const focusPreview = page.getByRole("dialog", { name: "Confira antes de aplicar" });
  await focusPreview.waitFor();
  const focusCards = await focusPreview.getByRole("button", { pressed: true }).count();
  check("Foco em peito: a prévia mostra mudanças de volume reais (não só trocar de lugar)", focusCards >= 2, String(focusCards));
  await page.screenshot({ path: shot("focus-preview") });
  await focusPreview.getByRole("button", { name: /^Aplicar \d+ mudanças?$/ }).click();
  await focusPreview.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /^Mudar a posição de / }).first().waitFor();
  await volume.locator("details summary").click();
  const chestAfter = await seriesOf("Peito");
  check("O peito sobe de verdade no quadro de volume", chestAfter >= chestBefore + 3, `${chestBefore} -> ${chestAfter}`);
  check("O peito reforçado aparece marcado no quadro (acima do normal)", /foco|acima do normal/.test(await volume.getByRole("listitem").filter({ hasText: "Peito" }).first().innerText()));
  await page.screenshot({ path: shot("volume") });
  await page.getByRole("button", { name: "Desfazer" }).click();
  await page.waitForTimeout(300);
  check("Desfazer volta o volume de antes", (await seriesOf("Peito")) === chestBefore);
  await volume.locator("details summary").click();

  // ---------- 5. aceitar ----------
  await button("Usar este plano").click();
  const apply = page.getByRole("dialog", { name: "Usar este plano" });
  await apply.waitFor();
  const applyText = norm(await apply.innerText());
  check("Aceitar: oferece arquivar as fichas atuais (ligado por padrão) e diz que o histórico não muda", applyText.includes("Treino A — Peito e tríceps") && applyText.includes("histórico") && (await apply.getByRole("switch").getAttribute("aria-checked")) === "true");
  await apply.getByRole("button", { name: "Usar este plano" }).click();
  await page.waitForURL("**/treino");
  await page.waitForSelector("text=Plano salvo");
  // Só a lista de fichas: o histórico continua mostrando os treinos antigos pelo nome de quando foram feitos.
  const fichas = norm(await page.locator("section").filter({ has: page.getByRole("heading", { name: "Começar treino" }) }).innerText());
  check("Rodízio: a primeira ficha do plano vem marcada como Próximo", fichas.includes("Superior A Próximo"), fichas.slice(0, 160));
  check("As fichas novas aparecem em Começar treino e as antigas foram arquivadas", ["Superior A", "Inferior B"].every((n) => fichas.includes(n)) && !fichas.includes("Treino A — Peito e tríceps"), fichas.slice(0, 160));
  const planCard = page.getByRole("link", { name: /Plano de treino/ });
  check("O card passa a mostrar o plano atual", /Superior e inferior · desde \d\d\/\d\d/.test(norm(await planCard.innerText())));

  await page.getByRole("button", { name: "Iniciar Superior A" }).click();
  await page.waitForURL("**/treino/sessao");
  await page.waitForSelector("text=Superior A");
  check("A ficha nova abre um treino normalmente", (await page.getByText(/Supino|Desenvolvimento|Remada|Puxada/).count()) > 0);
  const sessionText = await pageText();
  const positions = expectedFirstFicha.map((name) => sessionText.indexOf(name));
  check("A ficha segue a ordem escolhida no rascunho", positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])), expectedFirstFicha.join(" | "));
  await open("/treino");
  await page.getByRole("button", { name: "Descartar treino em andamento" }).click().catch(() => undefined);

  await open("/treino/plano");
  const current = await pageText();
  check("Plano atual: origem, desde quando e o porquê", /Plano atual · desde \d\d\/\d\d · modelo pronto/.test(current) && current.includes("Recado do Tars"));
  check("O exercício trocado aparece como escolha sua", current.includes("Escolhido por você."));

  // ---------- 5b. ajustar o plano EM USO: grava nas fichas e no histórico ----------
  const setsTotal = (text) => [...text.matchAll(/(\d+) × \d+–\d+/g)].reduce((t, m) => t + Number(m[1]), 0);
  const beforeAdjust = setsTotal(current);
  await button("Ajustar o plano").click();
  const adjustCurrent = page.getByRole("dialog", { name: "O que você quer mudar?" });
  await adjustCurrent.waitFor();
  check("No plano em uso, não oferece mudar a divisão (isso é um plano novo)", (await adjustCurrent.getByRole("button", { name: /Mudar a divisão/ }).count()) === 0);
  await adjustCurrent.getByRole("button", { name: "Treino mais curto" }).click();
  const confirmCurrent = page.getByRole("dialog", { name: "Confira antes de aplicar" });
  await confirmCurrent.waitFor();
  const toApply = await confirmCurrent.getByRole("button", { pressed: true }).count();
  await confirmCurrent.getByRole("button", { name: /^Aplicar \d+ mudanças?$/ }).click();
  await page.waitForSelector("text=O que mudou", { timeout: 10000 });
  const adjusted = await pageText();
  check("Aplicar grava nas fichas: menos séries no total", setsTotal(adjusted) === beforeAdjust - toApply, `${beforeAdjust} -> ${setsTotal(adjusted)} (${toApply})`);
  check("'O que mudou' mostra a data, o gatilho e antes → depois com o motivo", /O que mudou \d\d\/\d\d · Treino mais curto/.test(adjusted) && adjusted.includes("séries") && adjusted.includes("Base: volume da semana"), adjusted.slice(adjusted.indexOf("O que mudou"), adjusted.indexOf("O que mudou") + 200));

  await button("Ajustar o plano").click();
  await adjustCurrent.getByRole("button", { name: "Não curti um exercício" }).click();
  const pickCurrent = page.getByRole("dialog", { name: "Qual exercício você não curtiu?" });
  await pickCurrent.waitFor();
  check("Não curti: lista os exercícios de todos os treinos do plano", (await pickCurrent.getByText("Inferior B").count()) === 1);
  await pickCurrent.getByRole("button").filter({ hasNotText: /Voltar|Fechar/ }).first().click();
  const swapCurrent = page.getByRole("dialog", { name: "Trocar exercício" });
  await swapCurrent.waitFor();
  const newName = norm(await swapCurrent.getByRole("button").filter({ hasNotText: "Fechar" }).first().locator("span span").first().innerText());
  await swapCurrent.getByRole("button").filter({ hasNotText: "Fechar" }).first().click();
  await page.waitForSelector("text=Troca sua", { timeout: 10000 });
  const afterSwapCurrent = await pageText();
  check("Trocar no plano em uso: a ficha passa a ter o exercício novo e o histórico registra a troca", afterSwapCurrent.includes(newName) && afterSwapCurrent.includes("Troca sua"), newName);
  await open("/treino");
  const fichasAfter = norm(await page.locator("section").filter({ has: page.getByRole("heading", { name: "Começar treino" }) }).innerText());
  check("As fichas em Começar treino continuam as mesmas (só o conteúdo mudou)", ["Superior A", "Inferior A", "Superior B", "Inferior B"].every((n) => fichasAfter.includes(n)));
  await open("/treino/plano");
  await page.waitForSelector("text=Plano atual");

  // ---------- 6. refazer pulando a saúde ----------
  await page.getByRole("link", { name: "Refazer as perguntas" }).click();
  await page.waitForURL("**/treino/plano/perguntas");
  check("Refazer: as respostas anteriores vêm marcadas", (await page.getByRole("button", { name: /Ganhar massa/ }).getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: /Ganhar força/ }).click();
  await page.getByRole("button", { name: /Já treino/ }).click();
  await button("3 dias").click();
  await button("45 min").click();
  await page.getByRole("button", { name: /Casa, com halteres/ }).click();
  await button("Pular esta parte").click();
  check("Pular a saúde vai direto às prioridades (8 perguntas no total)", (await question()) === "Quer dar mais atenção a algum grupo?" && (await page.getByText("Pergunta 7 de 8").count()) === 1);
  check("A prioridade salva antes vem marcada", (await button("Costas").getAttribute("aria-pressed")) === "true");
  await button("Costas").click();
  await button("Sem prioridade, continuar").click();
  await button("Gerar meu plano").click();
  await page.waitForURL("**/treino/plano");
  await page.waitForSelector("text=Recado do Tars", { timeout: 15000 });
  const home = await allDaysText();
  check("Em força não há quadro de volume por músculo (o que pesa é a carga dos principais)", (await page.getByRole("region", { name: "Volume da semana" }).locator("details").count()) === 0);
  check("3 dias em casa: corpo inteiro A, B e C, sem citar limitações", ["Corpo inteiro A", "Corpo inteiro B", "Corpo inteiro C"].every((n) => home.includes(n)) && !home.includes("Deixei de fora"));
  check("Em casa, nada de máquina nem polia", !/(Leg press|Puxada frontal|Cadeira extensora|Tríceps pulley|Crossover)/.test(home));

  // ---------- 6b. dias e divisão pelos chips do rascunho, sem refazer as perguntas ----------
  await page.getByRole("button", { name: /^Dias por semana: 3 dias/ }).click();
  await page.getByRole("dialog", { name: "Dias por semana" }).getByRole("button", { name: "5 dias", exact: true }).click();
  await page.waitForSelector("text=se revezam nos seus 5 dias", { timeout: 15000 });
  const five = await allDaysText();
  check(
    "5 dias pelo chip: 3 treinos que se revezam (A, B, C), e não 5 treinos diferentes",
    (await page.getByRole("tab").allInnerTexts()).join("") === "ABC" && ["Empurrar", "Puxar", "Pernas"].every((n) => five.includes(n)) && five.includes("(A, B, C, A, B…)"),
    five.slice(0, 220),
  );
  check("O porquê explica o rodízio", five.includes("os 3 treinos se revezam"));
  check("Mudar os dias pelo chip não deixa o rascunho desatualizado", !five.includes("Suas respostas mudaram"));

  await page.getByRole("button", { name: /^Divisão: 3 treinos/ }).click();
  const splits = page.getByRole("dialog", { name: "Como dividir seus treinos" });
  await splits.waitFor();
  const firstCards = norm(await splits.innerText());
  check("Divisões: começa pela recomendada (marcada) e mais 2, não o catálogo inteiro", firstCards.includes("Recomendado") && (await splits.getByRole("button", { pressed: true }).count()) === 1 && (await splits.getByRole("button", { name: /Ver todas as divisões/ }).count()) === 1);
  check("Cada divisão diz quantas vezes cada músculo treina", /cada músculo (cerca de )?[\d,]+ vez/.test(firstCards));
  await splits.getByRole("button", { name: /Ver todas as divisões/ }).click();
  const byGroup = splits.getByRole("button").filter({ hasText: "Peito e tríceps" }).filter({ hasText: "Posterior e glúteos" });
  check("Um grupo por treino (ABCDE) aparece com o aviso da frequência", (await byGroup.innerText()).includes("só 1 vez por semana"));
  await byGroup.click();
  await page.waitForSelector("text=5 treinos, um para cada dia", { timeout: 15000 });
  check("Escolher ABCDE monta 5 treinos, um por dia", (await page.getByRole("tab").allInnerTexts()).join("") === "ABCDE");
  await page.screenshot({ path: shot("split"), fullPage: true });
  await (await menu("Descartar este plano")).click();
  await page.waitForSelector("text=Plano atual");
  check("Descartar a proposta volta ao plano atual (nada muda nas fichas)", (await pageText()).includes("Superior e inferior"));

  // ---------- 7. triagem que recomenda liberação ----------
  await page.getByRole("link", { name: "Refazer as perguntas" }).click();
  await page.waitForURL("**/treino/plano/perguntas");
  for (const pick of [/Ganhar massa/, /Comecei agora/]) await page.getByRole("button", { name: pick }).click();
  await button("2 dias").click();
  await button("30 min").click();
  await page.getByRole("button", { name: /^Academia/ }).click();
  await button("Concordo, quero responder").click();
  await button("Nenhuma, continuar").click();
  await answerScreening([true]);
  await button("Continuar").click();
  check("Algum 'sim' na triagem: recomenda liberação médica antes", (await question()) === "Converse com um médico antes");
  await button("Já tenho liberação médica").click();
  check("Com liberação confirmada, segue para as prioridades", (await question()) === "Quer dar mais atenção a algum grupo?");
  await page.screenshot({ path: shot("priorities"), fullPage: true });

  check("Nenhum erro nem aviso no console", problems.length === 0, problems.slice(0, 5).join(" | "));
} catch (error) {
  console.error(error);
  await page.screenshot({ path: shot("error"), fullPage: true }).catch(() => undefined);
  results.push({ name: "execução", ok: false });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
