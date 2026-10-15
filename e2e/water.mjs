/**
 * Água no modo DEMO, ponta a ponta, num celular (375 px): o card da Início (nasce numa faixa recolhida; aberto tem o
 * botão +, três porções, desfazer, meta), as quantidades editáveis, a meta diária em litros, a tela /agua (registros, remoção com desfazer,
 * registro avulso de hoje e de ontem, semana) e a virada da meia-noite no fuso de São Paulo. O modo real (servidor +
 * banco) é coberto por e2e/live.mjs.
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:water                       ou  BASE=http://localhost:3101 node e2e/water.mjs
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
const STORAGE_KEY = "tars-demo-v1";
const PREFS_KEY = "tars-water-prefs-v1";

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};
const norm = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

/** Datas do app: São Paulo, não o fuso da máquina que roda o teste. */
const sp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (ms) => sp.format(ms);
const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekdayIndex = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};
const TODAY = dayKey(Date.now());
const YESTERDAY = addDays(TODAY, -1);
const WEEK_START = addDays(TODAY, -weekdayIndex(TODAY));
/** Instante de "dia + hora" em São Paulo (UTC-3, sem horário de verão). */
const at = (day, hh, mm) => Date.parse(`${day}T${hh}:${mm}:00-03:00`);

const launch = () => chromium.launch();
const mobile = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo" };

/** Ferramentas de uma página já aberta. */
function tools(page, problems) {
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) problems.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));

  const settle = async () => {
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 20000 });
    await page.waitForSelector(".launch-screen", { state: "detached", timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 });
    await page.waitForTimeout(250);
  };
  const t = {
    page,
    settle,
    open: async (route) => {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await settle();
    },
    reload: async () => {
      await page.reload({ waitUntil: "networkidle" });
      await settle();
    },
    state: () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").state ?? {}, STORAGE_KEY),
    water: async () => (await t.state()).waterIntakes ?? [],
    /** Só os registros de HOJE (o demo traz 35 dias de histórico de água). */
    todayWater: async () => (await t.state()).waterIntakes?.filter((x) => dayKey(x.at) === TODAY) ?? [],
    prefs: () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.state ?? null, PREFS_KEY),
    main: async () => norm(await page.locator("main").first().innerText()),
    card: () => page.locator('section[aria-label="Água de hoje"]'),
    toast: (text) => page.locator("[data-sonner-toast]", { hasText: text }).first(),
    sheet: () => page.locator('[data-slot="drawer-content"]'),
    sheetButton: (name) => page.locator('[data-slot="drawer-content"]').getByRole("button", { name, exact: true }),
    noHorizontalScroll: () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    closeSheet: async () => {
      await page.keyboard.press("Escape");
      await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(300);
    },
    waitWater: (n) => page.waitForFunction(([key, count]) => (JSON.parse(localStorage.getItem(key) ?? "{}").state?.waterIntakes ?? []).length === count, [STORAGE_KEY, n], { timeout: 5000 }),
  };
  t.strip = () => t.card().getByRole("button", { name: /Água · hoje/, expanded: false });
  t.collapse = () => t.card().getByRole("button", { name: "Recolher água de hoje" });
  /** O card nasce recolhido a cada visita à Início: abre se ainda estiver recolhido. */
  t.expand = async () => {
    if (await t.strip().count()) await t.strip().click();
    await t.collapse().waitFor({ timeout: 5000 });
  };
  t.drop = () => t.card().getByRole("button", { name: /Adicionar .* de água/ });
  t.radio = (name) => t.card().getByRole("radio", { name });
  return t;
}

(async () => {
  const browser = await launch();
  const context = await browser.newContext(mobile);
  const page = await context.newPage();
  const problems = [];
  const t = tools(page, problems);

  // ---------- 1. a Início: o card vem antes de "Esta semana" e nasce com os padrões ----------
  await t.open("/inicio");
  const home = await t.main();
  const iCard = home.indexOf("Água · hoje");
  const iWeek = home.indexOf("Esta semana");
  check("Início: o card de água vem ANTES de 'Esta semana'", iCard > -1 && iWeek > -1 && iCard < iWeek, `${iCard} < ${iWeek}`);
  const stripBox = await t.strip().boundingBox();
  const stripText = norm(await t.card().innerText());
  check("Faixa: o card nasce RECOLHIDO, com o total, a meta e a barra de progresso (0 L de 2,5 L, 0%)", (await t.strip().count()) === 1 && /Água · hoje/.test(stripText) && /0 L de 2,5 L/.test(stripText) && (await t.card().getByRole("progressbar", { name: "Progresso da meta diária de água" }).count()) === 1, stripText);
  check("Faixa: sem botão +, sem porções, sem 'Faltam' (só o essencial)", (await t.drop().count()) === 0 && (await t.card().getByRole("radiogroup").count()) === 0 && !/Faltam/.test(stripText), stripText);
  check("Faixa: baixa (até 64 px) e com alvo de toque de pelo menos 44 de altura", stripBox !== null && stripBox.height >= 44 && stripBox.height <= 64, JSON.stringify(stripBox));
  await page.screenshot({ path: path.join(OUT, "water-home-collapsed-light.png") });
  await t.strip().click();
  await t.collapse().waitFor();
  const openBox = await t.card().boundingBox();
  check("Tocar na faixa abre o card inteiro: botão +, três porções e o que falta", (await t.drop().count()) === 1 && (await t.card().getByRole("radio").count()) === 3 && /Faltam 2,5 L/.test(norm(await t.card().innerText())));
  check("Aberto, o card fica bem mais alto que a faixa", openBox !== null && stripBox !== null && openBox.height > stripBox.height + 100, `${stripBox?.height} -> ${openBox?.height}`);
  check("Ao abrir, o foco vai para o botão de recolher (o toque na faixa a tirou da tela)", await t.collapse().evaluate((el) => el === document.activeElement));
  await t.collapse().click();
  await t.strip().waitFor();
  check("Recolher volta para a faixa, sem perder o total, e leva o foco de volta para ela", (await t.drop().count()) === 0 && (await t.strip().evaluate((el) => el === document.activeElement)));
  await t.expand();
  const cardText0 = norm(await t.card().innerText());
  check("Card: hoje começa em 0 L, com a meta de 2,5 L e o que falta", /0 L/.test(cardText0) && /de 2,5 L/.test(cardText0) && /Faltam 2,5 L/.test(cardText0), cardText0);
  check("Card: mostra os dias na meta da semana (x de 7)", /\d de 7 dias na meta/.test(cardText0), cardText0);
  check("Card: o botão + diz QUANTO vai somar (garrafa de 500 ml por padrão)", (await t.drop().getAttribute("aria-label")) === "Adicionar 500 ml de água");
  check("Card: copo 100 ml, garrafa 500 ml e garrafa grande 1 L, com a do meio selecionada", (await t.radio("Copo, 100 ml").getAttribute("aria-checked")) === "false" && (await t.radio("Garrafa, 500 ml").getAttribute("aria-checked")) === "true" && (await t.radio("Garrafa grande, 1 L").getAttribute("aria-checked")) === "false");
  check("Card: o grupo de porções tem nome acessível", (await t.card().getByRole("radiogroup", { name: "Quantidade por toque" }).count()) === 1);
  check("Card: a barra de progresso da meta existe e está em 0%", (await t.card().getByRole("progressbar", { name: "Progresso da meta diária de água" }).getAttribute("aria-valuenow")) === "0");
  check("Card: o cabeçalho é um link para /agua e os botões NÃO estão dentro dele", (await t.card().locator('a[href="/agua"]').count()) === 1 && (await t.card().locator('a[href="/agua"] button').count()) === 0);
  check("Início: nenhuma rolagem horizontal", await t.noHorizontalScroll());
  const targets = await t.card().locator("button, a").evaluateAll((els) => els.map((el) => ({ name: el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 30), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })));
  check("Card: todo alvo de toque tem pelo menos 44 x 44", targets.every((x) => x.w >= 44 && x.h >= 44), JSON.stringify(targets.filter((x) => x.w < 44 || x.h < 44)));

  // ---------- 2. toques ----------
  const base = (await t.water()).length; // o demo traz o histórico de 35 dias
  check("Demo: hoje começa sem nenhum registro de água (o contador pode ser experimentado)", (await t.todayWater()).length === 0);
  const before = Date.now();
  await t.drop().click();
  await t.waitWater(base + 1);
  let w = await t.todayWater();
  check("Um toque no + cria UM registro de 500 ml, agora", w.length === 1 && w[0].ml === 500 && w[0].at >= before - 1000 && w[0].at <= Date.now() + 1000, JSON.stringify(w));
  check("O total aparece na hora (500 ml) e o Desfazer mostra quanto desfaz", /500 ml de 2,5 L/.test(norm(await t.card().innerText())) && (await t.card().getByRole("button", { name: "Desfazer +500 ml" }).count()) === 1);
  check("O leitor de tela é avisado do toque e do total do dia", /Adicionado 500 ml\. Hoje: 500 ml de 2,5 L\./.test(await t.card().locator('[role="status"]').innerText()));

  await t.radio("Copo, 100 ml").click();
  check("Escolher a porção NÃO soma nada", (await t.water()).length === base + 1);
  check("O + passa a somar 100 ml", (await t.drop().getAttribute("aria-label")) === "Adicionar 100 ml de água");
  await t.drop().click();
  await t.radio("Garrafa grande, 1 L").click();
  await t.drop().click();
  await t.waitWater(base + 3);
  w = await t.todayWater();
  check("Copo (100 ml) e garrafa grande (1 L) somam o que dizem", w.map((x) => x.ml).sort((a, b) => a - b).join(",") === "100,500,1000", JSON.stringify(w.map((x) => x.ml)));
  check("Total do dia: 1,6 L (e 'Faltam 900 ml')", /1,6 L/.test(norm(await t.card().innerText())) && /Faltam 900 ml/.test(norm(await t.card().innerText())), norm(await t.card().innerText()));

  // três toques seguidos, sem esperar: nenhum se perde e nenhum vira dois
  await t.drop().click();
  await t.drop().click();
  await t.drop().click();
  await t.waitWater(base + 6);
  w = await t.todayWater();
  check("Três toques em rajada viram três registros, com ids diferentes", w.length === 6 && new Set(w.map((x) => x.id)).size === 6, JSON.stringify(w.map((x) => x.ml)));
  const afterBurst = norm(await t.card().innerText());
  check("Passar da meta é sucesso: 'Meta batida · 2,1 L acima' (4,6 L), nunca vermelho", /4,6 L/.test(afterBurst) && /Meta batida · 2,1 L acima/.test(afterBurst), afterBurst);
  check("A barra de progresso trava em 100%", (await t.card().getByRole("progressbar").getAttribute("aria-valuenow")) === "100");

  // desfazer
  const lastTap = w.reduce((a, b) => (b.at >= a.at ? b : a));
  await t.card().getByRole("button", { name: "Desfazer +1 L" }).click();
  await t.waitWater(base + 5);
  w = await t.todayWater();
  check("Desfazer remove SÓ o último toque (1 L) e o total volta a 3,6 L", w.length === 5 && !w.some((x) => x.id === lastTap.id) && /3,6 L/.test(norm(await t.card().innerText())), norm(await t.card().innerText()));
  check("Depois de desfazer o botão some", (await t.card().getByRole("button", { name: /^Desfazer/ }).count()) === 0);
  await t.drop().click();
  await t.waitWater(base + 6);
  check("O Desfazer aparece depois de um toque", (await t.card().getByRole("button", { name: /^Desfazer/ }).count()) === 1);
  await page.waitForTimeout(6600);
  check("O Desfazer some sozinho depois de alguns segundos (o registro fica)", (await t.card().getByRole("button", { name: /^Desfazer/ }).count()) === 0 && (await t.water()).length === base + 6);
  check("Início: nenhuma rolagem horizontal depois dos toques", await t.noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "water-home-light.png") });

  // ---------- 3. a escolha persiste ----------
  check("A porção escolhida fica guardada no aparelho", (await t.prefs())?.selected === 2, JSON.stringify(await t.prefs()));
  await t.reload();
  check("Depois de recarregar o card volta recolhido (o estado aberto não é guardado)", (await t.strip().count()) === 1 && (await t.drop().count()) === 0);
  await t.expand();
  check("Depois de recarregar a garrafa grande continua selecionada", (await t.radio("Garrafa grande, 1 L").getAttribute("aria-checked")) === "true");
  check("Os registros sobrevivem ao recarregar", (await t.water()).length === base + 6);

  // ---------- 4. quantidades editáveis ----------
  await t.card().getByRole("button", { name: "Editar quantidades" }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  check("Quantidades: a folha abre com os valores atuais", (await page.inputValue("#water-portion-0")) === "100" && (await page.inputValue("#water-portion-1")) === "500" && (await page.inputValue("#water-portion-2")) === "1000");
  await page.fill("#water-portion-0", "700");
  check("Quantidades fora de ordem: erro claro e Salvar bloqueado", /ordem crescente/.test(await t.sheet().innerText()) && (await t.sheetButton("Salvar quantidades").isDisabled()));
  await page.fill("#water-portion-0", "2a");
  check("Quantidade com letra: erro no campo e Salvar bloqueado", /apenas números inteiros/.test(await t.sheet().innerText()) && (await t.sheetButton("Salvar quantidades").isDisabled()));
  await page.fill("#water-portion-0", "");
  check("Quantidade vazia: Salvar bloqueado", await t.sheetButton("Salvar quantidades").isDisabled());
  await page.fill("#water-portion-0", "6000");
  check("Acima de 5 L: erro e Salvar bloqueado", /até 5 L/.test(await t.sheet().innerText()) && (await t.sheetButton("Salvar quantidades").isDisabled()));
  await page.fill("#water-portion-0", "200");
  await page.fill("#water-portion-1", "600");
  await page.fill("#water-portion-2", "1500");
  await t.sheetButton("Salvar quantidades").click();
  await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 });
  await page.waitForTimeout(300);
  check("Quantidades salvas: o seletor mostra copo 200 ml, garrafa 600 ml e garrafa grande 1,5 L", (await t.radio("Copo, 200 ml").count()) === 1 && (await t.radio("Garrafa, 600 ml").count()) === 1 && (await t.radio("Garrafa grande, 1,5 L").count()) === 1);
  check("O + passa a somar 1,5 L (a garrafa grande continua escolhida)", (await t.drop().getAttribute("aria-label")) === "Adicionar 1,5 L de água");
  check("As três ficam guardadas no aparelho, em ordem", JSON.stringify((await t.prefs())?.portions) === "[200,600,1500]", JSON.stringify(await t.prefs()));
  await t.reload();
  await t.expand();
  check("Depois de recarregar as quantidades editadas continuam", (await t.radio("Garrafa grande, 1,5 L").count()) === 1);
  await t.card().getByRole("button", { name: "Editar quantidades" }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  await t.sheetButton("Restaurar o padrão").click();
  await t.sheetButton("Salvar quantidades").click();
  await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 });
  await page.waitForTimeout(300);
  check("Restaurar o padrão volta a 100 ml, 500 ml e 1 L", (await t.radio("Copo, 100 ml").count()) === 1 && (await t.radio("Garrafa grande, 1 L").count()) === 1);
  await t.radio("Garrafa, 500 ml").click();

  // ---------- 5. meta diária, em litros ----------
  await t.open("/configuracoes");
  const row = page.locator("main").getByRole("button", { name: /Água por dia/ });
  check("Configurações: a meta de água por dia aparece com 2,5 L", /2,5 L/.test(norm(await row.innerText())), norm(await row.innerText()));
  await row.click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  check("Meta: o campo mostra 2,5 (litros) e a unidade L", (await page.inputValue("#goal-value")) === "2,5" && /Meta \(litros por dia\)/.test(await t.sheet().innerText()));
  check("Meta: explica que vale por dia e cita a referência sem prometer saúde", /por dia e vale a partir da segunda-feira/.test(await t.sheet().innerText()) && /Siga a orientação do seu médico/.test(await t.sheet().innerText()));
  await page.fill("#goal-value", "25");
  check("Meta de 25 L é recusada (teto de 10 L) e Salvar bloqueia", /até 10 L/.test(await t.sheet().innerText()) && (await t.sheetButton("Salvar meta").isDisabled()));
  await page.fill("#goal-value", "2,5001");
  check("Mais de 3 casas decimais é recusado, nunca arredondado", /3 casas decimais/.test(await t.sheet().innerText()) && (await t.sheetButton("Salvar meta").isDisabled()));
  await page.fill("#goal-value", "abc");
  check("Texto no lugar de número é recusado", (await t.sheetButton("Salvar meta").isDisabled()));
  await page.fill("#goal-value", "3");
  await t.sheetButton("Salvar meta").click();
  await page.waitForTimeout(500);
  let goals = (await t.state()).goals.filter((g) => g.kind === "water_ml").sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
  check("Meta de 3 L grava 3000 ml POR DIA com vigência na segunda-feira desta semana, e a antiga fica para as semanas passadas", goals.length === 2 && goals[1].target === 3000 && goals[1].validFrom === WEEK_START && goals[0].target === 2500, JSON.stringify(goals));
  await t.open("/inicio");
  check("Início: o card passa a mostrar a meta de 3 L", /de 3 L/.test(norm(await t.card().innerText())), norm(await t.card().innerText()));

  await t.open("/configuracoes");
  await page.locator("main").getByRole("button", { name: /Água por dia/ }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  await t.sheetButton("Remover meta").click();
  await page.waitForTimeout(500);
  goals = (await t.state()).goals.filter((g) => g.kind === "water_ml" && g.validFrom === WEEK_START);
  check("Remover a meta grava 0 a partir desta semana (convenção das outras metas)", goals.length === 1 && goals[0].target === 0, JSON.stringify(goals));
  await t.open("/inicio");
  const noGoalStrip = norm(await t.card().innerText());
  check("Sem meta: a faixa mostra só o total (sem 'de ...', sem barra)", /Água · hoje/.test(noGoalStrip) && !/ de \d/.test(noGoalStrip) && (await t.card().getByRole("progressbar").count()) === 0, noGoalStrip);
  await t.expand();
  const noGoal = norm(await t.card().innerText());
  check("Sem meta: o contador funciona e o card convida a definir uma (sem 'Faltam' nem barra)", /Toque para definir uma meta de água/.test(noGoal) && !/Faltam/.test(noGoal) && (await t.card().getByRole("progressbar").count()) === 0, noGoal);
  await t.card().getByRole("button", { name: "Toque para definir uma meta de água" }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  await page.fill("#goal-value", "2,5");
  await t.sheetButton("Salvar meta").click();
  await page.waitForTimeout(500);
  check("Definir a meta pelo card: volta a 2,5 L", /de 2,5 L/.test(norm(await t.card().innerText())), norm(await t.card().innerText()));

  // ---------- 6. a tela /agua ----------
  await t.card().locator('a[href="/agua"]').click();
  await page.waitForURL("**/agua");
  await t.settle();
  check("O cabeçalho do card leva à tela de água", new URL(page.url()).pathname === "/agua");
  const stored = await t.water();
  const todayStored = stored.filter((x) => dayKey(x.at) === TODAY);
  check("Registros de hoje: um item por toque, com o horário", (await page.locator('main ul li').filter({ hasText: /\d{2}:\d{2}/ }).count()) === todayStored.length, `${todayStored.length}`);
  check("A semana tem o gráfico com nome acessível e os números do que foi bebido", (await page.locator('[role="img"][aria-label^="Água por dia nesta semana"]').count()) === 1);
  const screen = await t.main();
  check("A semana mostra dias na meta, média e melhor dia", /Dias na meta/.test(screen) && /Média por dia/.test(screen) && /Melhor dia/.test(screen), screen.slice(-200));
  check("O copo da tela mostra o nível da meta em texto acessível", (await page.locator('main [role="img"][aria-label^="Copo com"]').count()) === 1);
  check("/agua: nenhuma rolagem horizontal", await t.noHorizontalScroll());

  const firstDelete = page.locator("main").getByRole("button", { name: /^Remover / }).first();
  const removedLabel = await firstDelete.getAttribute("aria-label");
  const countBefore = (await t.water()).length;
  await firstDelete.click();
  await t.waitWater(countBefore - 1);
  check("Remover um registro tira só ele e avisa, com Desfazer", (await t.toast("Registro removido").count()) === 1 && (await t.toast("Registro removido").getByRole("button", { name: "Desfazer" }).count()) === 1, removedLabel ?? "");
  const afterRemove = await t.water();
  const missing = stored.find((x) => !afterRemove.some((y) => y.id === x.id));
  await t.toast("Registro removido").getByRole("button", { name: "Desfazer" }).click();
  await t.waitWater(countBefore);
  const restored = await t.water();
  check("Desfazer a remoção traz o registro de volta com a MESMA quantidade e o MESMO instante", Boolean(missing) && restored.some((x) => x.ml === missing.ml && x.at === missing.at), JSON.stringify(missing));

  // sequência, mês, folha do dia e ritmo (a partir do histórico de 35 dias do demo)
  check("Sequência: mostra a atual e a melhor da história", /dias? seguidos? na meta/.test(await t.main()) || /Sem sequência em andamento/.test(await t.main()));
  check("Mês: tem título, navegação e o mês atual não avança além de hoje", (await page.getByRole("heading", { name: "Mês", exact: true }).count()) === 1 && (await page.getByRole("button", { name: "Próximo mês" }).isDisabled()) && !(await page.getByRole("button", { name: "Mês anterior" }).isDisabled()));
  const dayRe = (key) => new RegExp(`^${Number(key.slice(8))} de `);
  const monthCell = (key) => page.locator("main").getByRole("button", { name: dayRe(key) });
  const cellLabel = (await monthCell(YESTERDAY).first().getAttribute("aria-label")) ?? "";
  check("Mês: cada dia tem nome acessível com a quantidade e se bateu a meta", /\d+ de \S+: .* L/.test(cellLabel) || /ml/.test(cellLabel), cellLabel);
  check("Mês: o dia de hoje destacado e os dias futuros não são botões", (await page.locator("main").getByRole("img", { name: /ainda não chegou/ }).count()) >= 0);
  check("Ritmo do dia: manhã, tarde e noite com percentuais e uma frase", /Ritmo do dia/.test(await t.main()) && /Manhã/.test(await t.main()) && /Tarde/.test(await t.main()) && /Noite/.test(await t.main()) && /Últimos 30 dias/.test(await t.main()));
  const percents = [...(await t.main()).matchAll(/(Manhã|Tarde|Noite) (\d+)%/g)].map((m) => Number(m[2]));
  check("Ritmo do dia: os três percentuais somam 100% (com a folga do arredondamento)", percents.length === 3 && Math.abs(percents.reduce((a, b) => a + b, 0) - 100) <= 1, JSON.stringify(percents));

  // folha de um dia recente (ontem): lista, total, remover com desfazer
  await monthCell(YESTERDAY).first().click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  check("Folha do dia: abre com o total e a meta daquele dia", /Meta de/.test(await t.sheet().innerText()), norm(await t.sheet().innerText()).slice(0, 160));
  const yesterdayBefore = (await t.water()).filter((x) => dayKey(x.at) === YESTERDAY).length;
  await t.sheet().getByRole("button", { name: /^Remover / }).first().click();
  await page.waitForTimeout(500);
  const yesterdayAfter = (await t.water()).filter((x) => dayKey(x.at) === YESTERDAY).length;
  check("Folha do dia (ontem): remover tira só um registro e oferece Desfazer DENTRO da folha (o toast não recebe toque com o modal aberto)", yesterdayAfter === yesterdayBefore - 1 && (await t.sheet().getByRole("button", { name: "Desfazer", exact: true }).count()) === 1);
  await t.sheet().getByRole("button", { name: "Desfazer", exact: true }).click();
  await page.waitForTimeout(500);
  check("Folha do dia (ontem): Desfazer devolve o registro", (await t.water()).filter((x) => dayKey(x.at) === YESTERDAY).length === yesterdayBefore);
  await t.closeSheet();

  // um dia ANTIGO: o servidor não aceitaria recriar o registro, então remover pede confirmação e não oferece Desfazer
  const OLD = addDays(TODAY, -5);
  await monthCell(OLD).first().click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  const oldBefore = (await t.water()).filter((x) => dayKey(x.at) === OLD).length;
  await t.sheet().getByRole("button", { name: /^Remover / }).first().click();
  await page.getByRole("alertdialog").waitFor();
  check("Folha de um dia antigo: remover pede confirmação e avisa que não dá para desfazer", /não dá para desfazer/.test(await page.getByRole("alertdialog").innerText()));
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.waitForTimeout(300);
  check("Folha de um dia antigo: cancelar não remove nada", (await t.water()).filter((x) => dayKey(x.at) === OLD).length === oldBefore);
  await t.sheet().getByRole("button", { name: /^Remover / }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
  await page.waitForTimeout(500);
  check("Folha de um dia antigo: confirmar remove só um registro, sem botão Desfazer", (await t.water()).filter((x) => dayKey(x.at) === OLD).length === oldBefore - 1 && (await t.sheet().getByRole("button", { name: "Desfazer", exact: true }).count()) === 0 && /Removido:/.test(await t.sheet().innerText()));
  await t.closeSheet();

  // mês anterior
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await page.waitForTimeout(300);
  check("Mês anterior: o calendário troca de mês e o botão de avançar volta a valer", !(await page.getByRole("button", { name: "Próximo mês" }).isDisabled()));
  await page.getByRole("button", { name: "Próximo mês" }).click();

  // registro avulso: agora
  const totalNow = (await t.water()).length; // o bloco acima removeu um registro de um dia antigo
  await page.getByRole("button", { name: /Outra quantidade/ }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  check("Registro avulso: sem quantidade, Registrar fica bloqueado", await t.sheetButton("Registrar").isDisabled());
  await page.fill("#water-entry-ml", "5001");
  check("Registro avulso: acima de 5 L é recusado", /até 5 L/.test(await t.sheet().innerText()) && (await t.sheetButton("Registrar").isDisabled()));
  await page.fill("#water-entry-ml", "2,5");
  check("Registro avulso: decimal é recusado (só ml inteiros)", /apenas números inteiros/.test(await t.sheet().innerText()));
  await page.fill("#water-entry-ml", "250");
  const t0 = Date.now();
  await t.sheetButton("Registrar").click();
  await t.waitWater(totalNow + 1);
  const entered = (await t.water()).find((x) => x.ml === 250);
  check("Registro avulso de 250 ml, agora: o horário é o do relógio (com a precisão do minuto)", Boolean(entered) && Math.abs(entered.at - t0) < 90_000, JSON.stringify(entered));
  check("Registro avulso: avisa depois de salvar", (await t.toast("250 ml registrados").count()) === 1);

  // registro avulso: ontem, 23h30 (cai em ontem mesmo sendo o dia seguinte em UTC)
  await page.getByRole("button", { name: /Outra quantidade/ }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  await page.fill("#water-entry-ml", "300");
  await t.sheetButton("Ontem").click();
  await page.fill('input[type="time"]', "23:30");
  await t.sheetButton("Registrar").click();
  await t.waitWater(totalNow + 2);
  const lateYesterday = (await t.water()).find((x) => x.ml === 300);
  check("Registro avulso de ontem às 23h30 cai em ONTEM (o fuso é o de São Paulo)", Boolean(lateYesterday) && lateYesterday.at === at(YESTERDAY, "23", "30") && dayKey(lateYesterday.at) === YESTERDAY, JSON.stringify(lateYesterday));

  // registro avulso: horário no futuro
  await page.getByRole("button", { name: /Outra quantidade/ }).click();
  await t.sheet().waitFor();
  await page.waitForTimeout(500);
  await page.fill("#water-entry-ml", "200");
  const nowSp = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(Date.now());
  const [hh] = nowSp.split(":").map(Number);
  if (hh <= 21) {
    await page.fill('input[type="time"]', `${String(hh + 2).padStart(2, "0")}:00`);
    check("Registro avulso de hoje num horário futuro é recusado (Horário no futuro.)", /Horário no futuro\./.test(await t.sheet().innerText()) && (await t.sheetButton("Registrar").isDisabled()));
  } else {
    check("Registro avulso no futuro (pulado: já passa das 22h em São Paulo)", true);
  }
  await t.closeSheet();

  // esvaziar o dia: estado vazio com a ação à vista
  for (let i = 0; i < 30 && (await page.locator("main").getByRole("button", { name: /^Remover / }).count()) > 0; i += 1) {
    await page.locator("main").getByRole("button", { name: /^Remover / }).first().click();
    await page.waitForTimeout(150);
  }
  check("Sem registros hoje: estado vazio explica e aponta para o +", /Nenhum registro hoje/.test(await t.main()) && /Toque em \+/.test(await t.main()));
  await page.screenshot({ path: path.join(OUT, "water-screen-light.png"), fullPage: true });

  // ---------- 7. tema escuro ----------
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await t.open("/inicio");
  check("Tema escuro: o card de água aparece e não rola na horizontal", (await t.card().count()) === 1 && (await t.noHorizontalScroll()));
  await page.screenshot({ path: path.join(OUT, "water-home-collapsed-dark.png") });
  await t.expand();
  await t.drop().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "water-home-dark.png") });
  await t.open("/agua");
  await page.screenshot({ path: path.join(OUT, "water-screen-dark.png"), fullPage: true });
  check("Tema escuro: /agua sem rolagem horizontal", await t.noHorizontalScroll());
  await page.evaluate(() => localStorage.setItem("theme", "light"));

  // ---------- 8. dados de uma versão ANTIGA do demo (sem água) ----------
  await t.open("/inicio");
  const oldShape = await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    const counts = { transactions: raw.state.transactions.length, sessions: raw.state.sessions.length, runs: raw.state.runningSessions.length };
    delete raw.state.waterIntakes;
    raw.state.goals = raw.state.goals.filter((g) => g.kind !== "water_ml");
    raw.version = 3; // o formato anterior à água
    localStorage.setItem(key, JSON.stringify(raw));
    return counts;
  }, STORAGE_KEY);
  await t.open("/inicio");
  await t.expand();
  const oldCard = norm(await t.card().innerText());
  check("Demo antigo (sem água) abre sem reset: o card está vazio e convida a definir a meta", /0 L/.test(oldCard) && /Toque para definir uma meta de água/.test(oldCard), oldCard);
  await t.drop().click();
  await page.waitForTimeout(600);
  const migrated = await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    return { version: raw.version, counts: { transactions: raw.state.transactions.length, sessions: raw.state.sessions.length, runs: raw.state.runningSessions.length }, water: raw.state.waterIntakes.length };
  }, STORAGE_KEY);
  check("Demo antigo: nenhum registro anterior se perdeu, o formato foi para a versão atual (v4) e o toque novo foi gravado", migrated.version === 4 && JSON.stringify(migrated.counts) === JSON.stringify(oldShape) && migrated.water === 1, JSON.stringify({ oldShape, migrated }));

  // ---------- 9. sair da conta apaga as preferências do aparelho ----------
  // (no demo "sair" só volta ao login; a limpeza das preferências é coberta em src/data/water-prefs.test.ts e e2e/live.mjs)

  check("Nenhum erro nem aviso no console", problems.length === 0, problems.slice(0, 5).join(" | "));
  await context.close();

  // ---------- 9b. aviso de ritmo (dentro do app, sem push) ----------
  {
    const paceProblems = [];
    const ctx = await browser.newContext({ ...mobile });
    // 14/10/2026 18h em São Paulo (21h UTC): atrás do ritmo com 0 L de uma meta de 2,5 L
    await ctx.clock.install({ time: new Date("2026-10-14T21:00:00Z") });
    const p = await ctx.newPage();
    const m = tools(p, paceProblems);
    await m.open("/inicio");
    // Deixa só a meta de água, para o aviso não disputar as 2 vagas com os de outras áreas
    await p.evaluate((key) => {
      const raw = JSON.parse(localStorage.getItem(key));
      raw.state.goals = raw.state.goals.filter((g) => g.kind === "water_ml");
      raw.state.transactions = [];
      localStorage.setItem(key, JSON.stringify(raw));
    }, STORAGE_KEY);
    await m.open("/inicio");
    const link = p.locator("main").getByRole("link", { name: /Hoje você bebeu 0 L de 2,5 L: faltam 2,5 L\./ });
    check("Aviso de ritmo: às 18h, atrás do ritmo, a Início avisa (informativo, com link para a tela de água)", (await link.count()) === 1 && (await link.getAttribute("href")) === "/agua");
    await m.expand();
    await m.radio("Garrafa grande, 1 L").click();
    await m.drop().click();
    await m.drop().click();
    await m.drop().click();
    await p.waitForTimeout(500);
    check("Aviso de ritmo: depois de beber o suficiente para o horário o aviso some", (await p.locator("main").getByRole("link", { name: /Hoje você bebeu/ }).count()) === 0);
    check("Aviso de ritmo: nenhum erro no console", paceProblems.length === 0, paceProblems.slice(0, 3).join(" | "));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ ...mobile });
    await ctx.clock.install({ time: new Date("2026-10-14T13:00:00Z") }); // 10h em São Paulo
    const p = await ctx.newPage();
    const m = tools(p, []);
    await m.open("/inicio");
    await p.evaluate((key) => {
      const raw = JSON.parse(localStorage.getItem(key));
      raw.state.goals = raw.state.goals.filter((g) => g.kind === "water_ml");
      raw.state.transactions = [];
      localStorage.setItem(key, JSON.stringify(raw));
    }, STORAGE_KEY);
    await m.open("/inicio");
    check("Aviso de ritmo: às 10h (cedo demais para dizer) não aparece", (await p.locator("main").getByRole("link", { name: /Hoje você bebeu/ }).count()) === 0);
    await ctx.close();
  }

  // ---------- 10. a virada da meia-noite (relógio de São Paulo, não o do aparelho) ----------
  {
    const midnightProblems = [];
    const ctx = await browser.newContext({ ...mobile });
    // 14/10/2026 23:58 em São Paulo (= 15/10 02:58 UTC). O relógio anda sozinho a partir daí.
    await ctx.clock.install({ time: new Date("2026-10-15T02:58:00Z") });
    const p = await ctx.newPage();
    const m = tools(p, midnightProblems);
    await m.open("/inicio");
    check("Meia-noite: o app acha que hoje é 14/10 às 23h58 em São Paulo", /Quarta-feira, 14 de outubro/.test(await m.main()), (await m.main()).slice(0, 80));
    const midnightBase = (await m.water()).length;
    await m.expand();
    await m.drop().click();
    await m.waitWater(midnightBase + 1);
    const late = (await m.water()).find((x) => x.at > Date.parse("2026-10-14T00:00:00-03:00") + 23 * 3_600_000);
    check("Meia-noite: um toque às 23h58 pertence ao dia 14", dayKey(late.at) === "2026-10-14", `${new Date(late.at).toISOString()} -> ${dayKey(late.at)}`);
    check("Meia-noite: o card mostra os 500 ml no dia 14", /500 ml/.test(norm(await m.card().innerText())));

    await p.clock.fastForward(3 * 60_000); // 00h01 de 15/10 em São Paulo (03h01 em UTC)
    await p.waitForTimeout(400);
    check("Meia-noite: depois da virada o app mostra o dia 15 e o contador recomeça em 0 L", /Quinta-feira, 15 de outubro/.test(await m.main()) && /0 L/.test(norm(await m.card().innerText())), norm(await m.card().innerText()));
    await m.drop().click();
    await m.waitWater(midnightBase + 2);
    const fresh = (await m.water()).filter((x) => x.at > late.at).sort((a, b) => b.at - a.at)[0];
    check("Meia-noite: um toque às 00h01 pertence ao dia 15 e o do dia 14 continua no dia 14", dayKey(fresh.at) === "2026-10-15" && dayKey(late.at) === "2026-10-14", `${dayKey(late.at)} / ${dayKey(fresh.at)}`);
    check("Meia-noite: o card de hoje soma só o toque do dia 15 (500 ml, e não 1 L)", /500 ml de 2,5 L/.test(norm(await m.card().innerText())), norm(await m.card().innerText()));
    check("Meia-noite: nenhum erro no console", midnightProblems.length === 0, midnightProblems.slice(0, 3).join(" | "));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  if (problems.length) console.log("Problemas de console:\n" + problems.join("\n"));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
