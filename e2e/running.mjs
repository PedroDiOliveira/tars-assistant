/**
 * Corrida no modo DEMO, ponta a ponta, num celular (375 px): abas de Exercícios com rotas reais, cadastro rápido,
 * distância opcional, edição, exclusão, histórico, meta em km, Home e convivência com um treino de musculação em
 * andamento. O modo real (servidor + banco) é coberto por e2e/live.mjs.
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:running                     ou  BASE=http://localhost:3101 node e2e/running.mjs
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

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};
const norm = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

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
const TOMORROW = addDays(TODAY, 1);
const WEEK_START = addDays(TODAY, -weekdayIndex(TODAY));
const LAST_WEEK_FRIDAY = addDays(WEEK_START, -3);
const NEXT_WEEK_START = addDays(WEEK_START, 7);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) problems.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));

  /** Abre a rota e espera o app de verdade: abertura animada terminada, dados carregados, esqueleto fora. */
  const settle = async () => {
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 20000 });
    await page.waitForSelector(".launch-screen", { state: "detached", timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 20000 });
    await page.waitForTimeout(250);
  };
  const open = async (route) => {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await settle();
  };
  const reload = async () => {
    await page.reload({ waitUntil: "networkidle" });
    await settle();
  };
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").state ?? {}, STORAGE_KEY);
  const runs = async () => (await state()).runningSessions ?? [];
  const main = async () => norm(await page.locator("main").first().innerText());
  const toast = (text) => page.locator("[data-sonner-toast]", { hasText: text }).first();
  const sheet = () => page.locator('[data-slot="drawer-content"]');
  const sheetButton = (name) => sheet().getByRole("button", { name, exact: true });
  const pageButton = (name) => page.locator("main").getByRole("button", { name }).first();
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  };
  const openRunSheet = async () => {
    await pageButton("Registrar corrida").click();
    await sheet().waitFor();
    await page.waitForTimeout(500); // animação de abertura
  };
  /** Preenche e salva pelo formulário. `distance` é o texto digitado; `minutes` abre os detalhes. */
  const registerRun = async ({ distance, minutes, seconds, hours, notes, day }) => {
    await openRunSheet();
    if (distance !== undefined) await page.fill("#run-distance", distance);
    if (minutes !== undefined || seconds !== undefined || hours !== undefined || notes !== undefined) {
      await sheet().getByRole("button", { name: /Duração e observação/ }).click();
      if (hours !== undefined) await sheet().getByLabel("Horas", { exact: true }).fill(hours);
      if (minutes !== undefined) await sheet().getByLabel("Minutos", { exact: true }).fill(minutes);
      if (seconds !== undefined) await sheet().getByLabel("Segundos", { exact: true }).fill(seconds);
      if (notes !== undefined) await sheet().getByPlaceholder(/Parque/).fill(notes);
    }
    if (day === "yesterday") await sheet().getByRole("button", { name: "Ontem", exact: true }).click();
    if (day && day !== "yesterday") await sheet().getByLabel("Escolher outra data").fill(day);
    await sheetButton("Registrar corrida").click();
  };

  // ---------- 0a. dados de uma versão ANTIGA do demo (sem corridas) abrem sem reset e sem perder nada ----------
  await open("/inicio");
  const homeBefore = norm(await page.locator("main").first().innerText()).match(/Resultado de \S+ -?R\$ ?[\d.]+,\d{2}/)?.[0];
  const oldShape = await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    const counts = { transactions: raw.state.transactions.length, sessions: raw.state.sessions.length, studySessions: raw.state.studySessions.length };
    delete raw.state.runningSessions;
    raw.state.goals = raw.state.goals.filter((g) => g.kind !== "running_meters");
    raw.version = 2; // o formato anterior à corrida
    localStorage.setItem(key, JSON.stringify(raw));
    return counts;
  }, STORAGE_KEY);
  await open("/inicio");
  const homeAfter = norm(await page.locator("main").first().innerText()).match(/Resultado de \S+ -?R\$ ?[\d.]+,\d{2}/)?.[0];
  check("Demo antigo (sem corridas) abre sem reset: o resultado do mês é o mesmo", Boolean(homeBefore) && homeBefore === homeAfter, `${homeBefore} | ${homeAfter}`);
  await open("/treino/corrida");
  check("Demo antigo: a Corrida abre com a coleção vazia (sem erro, sem dados inventados)", /Nenhuma corrida registrada/.test(await main()));
  await registerRun({ distance: "1" });
  await page.waitForTimeout(600);
  const migrated = await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    return { version: raw.version, counts: { transactions: raw.state.transactions.length, sessions: raw.state.sessions.length, studySessions: raw.state.studySessions.length }, runs: raw.state.runningSessions.length };
  }, STORAGE_KEY);
  check("Demo antigo: nenhum registro anterior se perdeu, o formato foi para a versão atual (v4) e a corrida nova foi gravada", migrated.version === 4 && JSON.stringify(migrated.counts) === JSON.stringify(oldShape) && migrated.runs === 1, JSON.stringify({ oldShape, migrated }));

  // ---------- 0. estado limpo e previsível: o demo semeia corridas; aqui começamos sem elas e sem meta de corrida ----------
  await open("/treino/corrida");
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.state.runningSessions = [];
    raw.state.goals = raw.state.goals.filter((g) => g.kind !== "running_meters");
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await open("/treino/corrida");

  // ---------- 1. navegação: Exercícios > Musculação | Corrida, com rotas reais ----------
  const navLabels = await page.locator('nav[aria-label="Navegação principal"] a').evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  check("A navegação inferior continua com 4 destinos (Corrida não é um quinto)", navLabels.length === 4, JSON.stringify(navLabels));
  check("O destino de /treino se chama 'Exercícios'", navLabels.join("|") === "Início|Finanças|Exercícios|Estudos", navLabels.join("|"));
  check("O título da área é 'Exercícios'", (await page.getByRole("heading", { level: 1 }).first().innerText()) === "Exercícios");
  const tabs = await page.locator('nav[aria-label="Seções de Exercícios"] a').evaluateAll((els) => els.map((e) => ({ text: e.textContent?.trim(), href: e.getAttribute("href"), current: e.getAttribute("aria-current") })));
  check("As abas são links reais: Musculação (/treino) e Corrida (/treino/corrida)", JSON.stringify(tabs.map((t) => [t.text, t.href])) === JSON.stringify([["Musculação", "/treino"], ["Corrida", "/treino/corrida"]]), JSON.stringify(tabs));
  check("Na rota de corrida, a aba Corrida é a página atual", tabs[1].current === "page" && tabs[0].current === null);
  await page.locator('nav[aria-label="Navegação principal"] a[aria-current="page"]').first().waitFor();
  check("A aba 'Exercícios' da barra inferior fica ativa em /treino/corrida", (await page.locator('nav[aria-label="Navegação principal"] a[aria-current="page"]').first().innerText()).includes("Exercícios"));

  await page.getByRole("link", { name: "Musculação", exact: true }).click();
  await page.waitForURL("**/treino");
  check("Trocar para Musculação abre /treino", (await page.getByText("Começar treino").count()) >= 1);
  await page.goBack();
  await page.waitForURL("**/treino/corrida");
  await settle();
  check("Voltar do navegador devolve à aba Corrida", (await page.getByRole("button", { name: "Registrar corrida" }).count()) >= 1);
  await page.goForward();
  await page.waitForURL("**/treino");
  await reload();
  check("Recarregar /treino continua na Musculação", (await page.getByText("Começar treino").count()) >= 1);
  await open("/treino/corrida");
  await reload();
  check("Recarregar /treino/corrida continua na Corrida", (await page.getByRole("button", { name: "Registrar corrida" }).count()) >= 1);

  // ---------- 2. o botão de registrar fica no topo ----------
  const topButton = await page.locator("main").getByRole("button", { name: "Registrar corrida" }).first().boundingBox();
  check("'Registrar corrida' está visível na primeira tela (perto do topo)", topButton && topButton.y + topButton.height < 400, JSON.stringify(topButton));
  const emptyText = await main();
  check("Sem corridas: estado vazio e totais honestos", /Nenhuma corrida registrada/.test(emptyText) && /\b0\s*corridas/.test(emptyText), emptyText.slice(0, 260));
  check("Sem rolagem horizontal na tela de Corrida", await noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "run-empty.png") });

  // ---------- 3. só a data: "corri hoje" ----------
  await openRunSheet();
  check("O campo de distância diz que é opcional e pode ser preenchido depois", /opcional/.test(norm(await sheet().innerText())) && /preencher depois/.test(norm(await sheet().innerText())));
  const inputMode = await page.getAttribute("#run-distance", "inputmode");
  check("O campo de distância usa o teclado decimal e mostra a unidade km", inputMode === "decimal" && /\bkm\b/.test(norm(await sheet().innerText())), String(inputMode));
  check("A data já vem como hoje", (await sheetButton("Hoje").getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: path.join(OUT, "run-sheet.png") });
  await sheetButton("Registrar corrida").click();
  await toast("Corrida registrada").waitFor({ timeout: 4000 }).then(
    () => check("Aviso de sucesso só depois de salvar", true),
    () => check("Aviso de sucesso só depois de salvar", false),
  );
  await page.waitForTimeout(500);
  let stored = await runs();
  check("Só a data cria UMA corrida, sem distância nem duração inventadas", stored.length === 1 && stored[0].occurredOn === TODAY && !("distanceMeters" in stored[0]) && !("durationSeconds" in stored[0]), JSON.stringify(stored));
  let text = await main();
  check("A semana mostra a corrida e o dia, e diz que a distância não foi preenchida", /1 corrida · 1 dia com corrida/.test(text) && /Distância não preenchida/.test(text), text.slice(0, 220));
  check("Nunca apresenta '0 km' como total quando só há corridas sem distância", !/\b0 km\b/.test(text), text.slice(0, 220));
  check("A lista indica claramente que a distância não foi informada", /Hoje.*Distância não informada/.test(text));
  const todayDot = await page.locator('ul[aria-label$="com corrida nesta semana"] li').nth(weekdayIndex(TODAY)).locator("span").first().evaluate((el) => el.className);
  check("O indicador do dia de hoje fica marcado, mesmo sem distância", /bg-m\b/.test(todayDot), todayDot);
  check("O texto acessível das bolinhas fala de corrida, não de treino", (await page.locator('ul[aria-label="1 dia com corrida nesta semana"]').count()) === 1);

  // ---------- 4. 5,2 km e 5.2 km: o mesmo resultado ----------
  await registerRun({ distance: "5,2", minutes: "30" });
  await toast("Corrida de 5,2 km registrada").waitFor({ timeout: 4000 }).then(
    () => check("Salvar 5,2 km confirma '5,2 km' depois de persistir", true),
    () => check("Salvar 5,2 km confirma '5,2 km' depois de persistir", false),
  );
  await page.waitForTimeout(400);
  await registerRun({ distance: "5.2", minutes: "30" });
  await page.waitForTimeout(700);
  stored = (await runs()).filter((r) => r.distanceMeters !== undefined);
  check("5,2 e 5.2 viram 5200 metros (duração em segundos inteiros)", stored.length === 2 && stored.every((r) => r.distanceMeters === 5200 && r.durationSeconds === 1800), JSON.stringify(stored));
  await reload();
  check("Recarregar a página mantém as corridas registradas", (await runs()).length === 3 && /3 corridas/.test(await main()), await main().then((t) => t.slice(0, 160)));
  text = await main();
  check("A tela exibe 5,2 km com o ritmo calculado (30 min em 5,2 km = 5:46 min/km)", /5,2 km/.test(text) && /5:46 min\/km/.test(text), text.slice(0, 400));
  check("Duas corridas informadas e uma sem distância: 10,4 km informados · 1 corrida sem distância", /10,4 km informados · 1 corrida sem distância/.test(text) && /3 corridas · 1 dia com corrida/.test(text), text.slice(0, 300));

  // ---------- 5. entradas inválidas nunca viram outro número ----------
  const invalid = [["0", /maior que zero/], ["-3", /Distância inválida/], ["abc", /Distância inválida/], ["5,2345", /no máximo 3 casas/], ["1.000,5", /Distância inválida/], ["501", /máxima/]];
  await openRunSheet();
  for (const [value, message] of invalid) {
    await page.fill("#run-distance", value);
    const alert = norm(await sheet().getByRole("alert").first().innerText().catch(() => ""));
    check(`Distância "${value}" é recusada com explicação e o campo guarda o que foi digitado`, message.test(alert) && (await page.inputValue("#run-distance")) === value && (await sheetButton("Registrar corrida").isDisabled()), alert);
  }
  await page.fill("#run-distance", "");
  check("Distância vazia é válida (desconhecida)", !(await sheetButton("Registrar corrida").isDisabled()));
  await sheet().getByLabel("Escolher outra data").fill(TOMORROW);
  check("Data futura é recusada na tela, com a regra explicada", /data futura/.test(norm(await sheet().innerText())) && (await sheetButton("Registrar corrida").isDisabled()));
  await closeSheet();
  check("Nenhuma corrida foi criada pelas tentativas inválidas", (await runs()).length === 3);

  // ---------- 6. ontem, duas no mesmo dia, toque duplo ----------
  await registerRun({ distance: "3", day: "yesterday" });
  await page.waitForTimeout(500);
  await registerRun({ distance: "5", notes: "Noite" , day: "yesterday" });
  await page.waitForTimeout(500);
  stored = (await runs()).filter((r) => r.occurredOn === YESTERDAY);
  check("'Ontem' grava a data de ontem (fuso de São Paulo) e permite duas corridas no mesmo dia", stored.length === 2 && stored.some((r) => r.distanceMeters === 3000) && stored.some((r) => r.distanceMeters === 5000 && r.notes === "Noite"), JSON.stringify(stored));

  const beforeDouble = (await runs()).length;
  await openRunSheet();
  await page.fill("#run-distance", "2");
  await sheetButton("Registrar corrida").dblclick().catch(() => undefined);
  await page.waitForTimeout(900);
  check("Toque duplo em Registrar grava uma única corrida", (await runs()).length === beforeDouble + 1, `${beforeDouble} -> ${(await runs()).length}`);

  // ---------- 7. a musculação não é afetada ----------
  await open("/treino");
  const workoutWeek = (await main()).match(/(\d+)(?: de (\d+))?\s*treinos?/)?.[0];
  const seededWorkouts = (await state()).sessions.filter((s) => s.occurredOn >= WEEK_START).length;
  check("Corridas não contam na meta de musculação: o total de treinos da semana é o dos treinos feitos", new RegExp(`^${seededWorkouts}\\b`).test(workoutWeek ?? ""), `${workoutWeek} / esperado ${seededWorkouts}`);

  // ---------- 8. treino em andamento + corrida ----------
  await page.getByRole("button", { name: /^Iniciar / }).first().click();
  await page.waitForURL("**/treino/sessao");
  await page.waitForSelector("text=séries concluídas");
  await page.getByRole("button", { name: /^Concluir série 1 de/ }).first().click();
  await page.waitForTimeout(500);
  const draftBefore = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key)).state.draft), STORAGE_KEY);
  await open("/treino");
  await page.getByRole("link", { name: "Corrida", exact: true }).click();
  await page.waitForURL("**/treino/corrida");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"));
  check("Na aba Corrida, o treino de musculação em andamento continua alcançável", (await page.getByRole("link", { name: /Treino de musculação em andamento/ }).count()) === 1);
  await registerRun({ distance: "4,5" });
  await page.waitForTimeout(700);
  const draftAfter = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key)).state.draft), STORAGE_KEY);
  check("Registrar uma corrida durante o treino não altera nem apaga o rascunho de musculação", draftBefore === draftAfter && draftAfter !== "null");
  await page.getByRole("link", { name: "Musculação", exact: true }).click();
  await page.waitForURL("**/treino");
  check("Ao voltar para Musculação, o treino em andamento está lá", (await page.getByText("Treino em andamento").count()) >= 1);
  await page.getByRole("button", { name: "Descartar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Descartar treino" }).click();
  await page.waitForTimeout(400);

  // ---------- 9. editar: adicionar, corrigir e remover a distância ----------
  await open("/treino/corrida");
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.state.runningSessions = raw.state.runningSessions.filter((r) => r.notes !== "Noite");
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await open("/treino/corrida");
  const withoutDistance = (await runs()).find((r) => r.distanceMeters === undefined);
  const row = page.locator("main").getByRole("button", { name: /Hoje.*Distância não informada/ }).first();
  await row.click();
  await sheet().waitFor();
  await page.waitForTimeout(500);
  check("Abrir uma corrida mostra 'Editar corrida' e o botão de excluir", (await sheet().getByText("Editar corrida").count()) >= 1 && (await sheetButton("Excluir corrida").count()) === 1);
  const weekBeforeEdit = await main();
  await page.fill("#run-distance", "8,25");
  await sheetButton("Salvar alterações").click();
  await toast("Corrida atualizada").waitFor({ timeout: 4000 }).then(() => check("Editar confirma depois de persistir", true), () => check("Editar confirma depois de persistir", false));
  await page.waitForTimeout(500);
  let edited = (await runs()).find((r) => r.id === withoutDistance.id);
  check("Adicionar uma distância que faltava grava 8250 metros", edited?.distanceMeters === 8250, JSON.stringify(edited));
  check("O resumo da semana foi recalculado (mudou) depois da edição", (await main()) !== weekBeforeEdit && /8,25 km/.test(await main()));

  await page.locator("main").getByRole("button", { name: /8,25 km/ }).first().click();
  await sheet().waitFor();
  await page.waitForTimeout(500);
  check("Editar traz a distância atual no campo, no formato do app", (await page.inputValue("#run-distance")) === "8,25");
  await page.fill("#run-distance", "");
  await sheetButton("Salvar alterações").click();
  await page.waitForTimeout(700);
  edited = (await runs()).find((r) => r.id === withoutDistance.id);
  check("Remover a distância mantém a corrida e deixa a informação ausente", edited && !("distanceMeters" in edited) && edited.occurredOn === TODAY, JSON.stringify(edited));
  check("A lista volta a dizer 'Distância não informada' (e a corrida continua contando)", /Hoje.*Distância não informada/.test(await main()));

  // ---------- 10. mover a data para outra semana ----------
  const thisWeekBefore = (await runs()).filter((r) => r.occurredOn >= WEEK_START).length;
  await page.locator("main").getByRole("button", { name: /Distância não informada/ }).first().click();
  await sheet().waitFor();
  await page.waitForTimeout(500);
  await sheet().getByLabel("Escolher outra data").fill(LAST_WEEK_FRIDAY);
  await sheetButton("Salvar alterações").click();
  await page.waitForTimeout(700);
  const thisWeekAfter = (await runs()).filter((r) => r.occurredOn >= WEEK_START).length;
  check("Mover a data para a semana passada tira a corrida da semana atual e a põe na outra", thisWeekAfter === thisWeekBefore - 1 && (await runs()).some((r) => r.occurredOn === LAST_WEEK_FRIDAY), `${thisWeekBefore} -> ${thisWeekAfter}`);

  // ---------- 11. excluir com confirmação ----------
  const countBeforeDelete = (await runs()).length;
  await page.locator("main").getByRole("button", { name: /8,25 km|5,2 km|2 km/ }).first().click();
  await sheet().waitFor();
  await page.waitForTimeout(500);
  await sheetButton("Excluir corrida").click();
  await page.getByRole("alertdialog").waitFor();
  check("Excluir pede confirmação e explica o recálculo", /recalculados/.test(norm(await page.getByRole("alertdialog").innerText())));
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await toast("Corrida excluída").waitFor({ timeout: 4000 }).then(() => check("Excluir confirma depois de persistir", true), () => check("Excluir confirma depois de persistir", false));
  await page.waitForTimeout(500);
  check("A corrida foi removida", (await runs()).length === countBeforeDelete - 1);

  // ---------- 12. meta semanal em km ----------
  await open("/treino/corrida");
  await page.locator("main").getByRole("button", { name: /Esta semana/ }).first().click();
  await page.waitForSelector("#goal-value");
  check("A meta de corrida pede km, com teclado decimal", (await page.getAttribute("#goal-value", "inputmode")) === "decimal" && /km/.test(norm(await sheet().innerText())));
  await page.fill("#goal-value", "12,5");
  check("A meta digitada fica como '12,5' (a vírgula não é apagada)", (await page.inputValue("#goal-value")) === "12,5");
  await page.getByRole("button", { name: "Salvar meta" }).click();
  await toast("Meta atualizada").waitFor({ timeout: 4000 }).then(() => check("Salvar a meta confirma depois de persistir", true), () => check("Salvar a meta confirma depois de persistir", false));
  await page.waitForTimeout(500);
  let goals = (await state()).goals.filter((g) => g.kind === "running_meters");
  check("Uma meta de 12,5 km grava 12500 metros (não 125)", goals.length === 1 && goals[0].target === 12500 && goals[0].validFrom === WEEK_START, JSON.stringify(goals));
  text = await main();
  check("A tela mostra o progresso 'x de 12,5 km' e quanto falta", /de 12,5\s*km/.test(text) && /(Faltam|Meta da semana batida)/.test(text), text.slice(0, 200));
  const homeWeek = async () => {
    await open("/inicio");
    return norm(await page.locator("main").first().innerText());
  };
  check("A Home mostra a linha de Corrida com a mesma meta", /Corrida.*de 12,5\s*km/.test(await homeWeek()));

  // alterar a meta para a próxima semana preserva a vigência desta
  await open("/treino/corrida");
  await page.locator("main").getByRole("button", { name: /Esta semana/ }).first().click();
  await page.waitForSelector("#goal-value");
  await page.fill("#goal-value", "20");
  await page.getByRole("radio", { name: "Próxima semana" }).click();
  await page.getByRole("button", { name: "Salvar meta" }).click();
  await page.waitForTimeout(600);
  goals = (await state()).goals.filter((g) => g.kind === "running_meters").sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  check("Mudar a meta cria uma vigência nova e preserva a desta semana", goals.length === 2 && goals[0].target === 12500 && goals[0].validFrom === WEEK_START && goals[1].target === 20000 && goals[1].validFrom === NEXT_WEEK_START, JSON.stringify(goals));
  check("A semana atual continua com a meta de 12,5 km", /de 12,5\s*km/.test(await main()));
  for (const bad of ["0", "1.000,5", "abc", "12,5555"]) {
    await page.locator("main").getByRole("button", { name: /Esta semana/ }).first().click();
    await page.waitForSelector("#goal-value");
    await page.fill("#goal-value", bad);
    check(`Meta "${bad}" não pode ser salva`, await page.getByRole("button", { name: "Salvar meta" }).isDisabled());
    await closeSheet();
  }
  // remover
  await page.locator("main").getByRole("button", { name: /Esta semana/ }).first().click();
  await page.waitForSelector("#goal-value");
  await page.getByRole("button", { name: "Remover meta" }).click();
  await page.waitForTimeout(600);
  goals = (await state()).goals.filter((g) => g.kind === "running_meters" && g.validFrom === WEEK_START);
  check("Remover a meta grava 0 a partir desta semana (convenção das outras metas)", goals.length === 1 && goals[0].target === 0, JSON.stringify(goals));
  check("Sem meta, as corridas continuam registradas e a tela convida a definir uma", /Toque para definir uma meta/.test(await main()));

  // ---------- 13. histórico ----------
  // 24 corridas antigas (vários meses) para exercitar a paginação do histórico
  await page.evaluate(([key, start]) => {
    const raw = JSON.parse(localStorage.getItem(key));
    const d = (n) => {
      const [y, m, day] = start.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day - n)).toISOString().slice(0, 10);
    };
    for (let i = 0; i < 24; i += 1) raw.state.runningSessions.push({ id: `antiga-${i}`, occurredOn: d(10 + i * 9), ...(i % 4 === 0 ? {} : { distanceMeters: 5000 + i * 100 }) });
    localStorage.setItem(key, JSON.stringify(raw));
  }, [STORAGE_KEY, WEEK_START]);
  await open("/treino/corrida");
  const visibleRuns = "main button[aria-haspopup='dialog']:visible";
  const recent = await page.locator(`main section[aria-labelledby='last-runs-title'] button[aria-haspopup='dialog']:visible`).count();
  check("A tela principal mostra só as últimas 5 corridas", recent === 5, String(recent));
  await page.getByRole("link", { name: /Ver histórico/ }).click();
  await page.waitForURL("**/treino/corrida/historico");
  await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"));
  const total = (await runs()).length;
  const firstPage = await page.locator(visibleRuns).count();
  check("O histórico começa com uma página (15) e oferece 'Mostrar mais'", total > 15 ? firstPage === 15 && (await page.getByRole("button", { name: "Mostrar mais" }).count()) === 1 : firstPage === total, `${firstPage} de ${total}`);
  if (total > 15) {
    await page.getByRole("button", { name: "Mostrar mais" }).click();
    check("'Mostrar mais' revela os registros antigos (e some quando acabam)", (await page.locator(visibleRuns).count()) === Math.min(30, total) && (total <= 30 ? (await page.getByRole("button", { name: "Mostrar mais" }).count()) === 0 : true), `${await page.locator(visibleRuns).count()} de ${total}`);
  }
  const dates = await page.locator(`${visibleRuns} p.font-medium`).allInnerTexts();
  check("O histórico agrupa por mês e ordena da mais recente para a mais antiga", (await page.locator("main h2").count()) >= 1 && /^Hoje$/.test(dates[0] ?? ""), dates.slice(0, 3).join(" | "));
  check("Sem rolagem horizontal no histórico", await noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "run-history.png") });
  await page.locator(visibleRuns).first().click();
  await sheet().waitFor();
  check("Abrir um registro do histórico permite editar", (await sheet().getByText("Editar corrida").count()) >= 1);
  await closeSheet();
  await page.getByRole("link", { name: "Voltar para Corrida" }).click();
  await page.waitForURL("**/treino/corrida");

  // ---------- 14. Home ----------
  await open("/inicio");
  const home = await page.locator("main").first().innerText();
  const order = ["Musculação", "Corrida", "Estudo", "Leitura"].map((label) => home.indexOf(label, home.indexOf("Esta semana")));
  check("A Home separa Musculação, Corrida, Estudo e Leitura, nessa ordem", order.every((v) => v > 0) && order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order));
  const quick = await page.locator("main .grid-cols-4 > *").count();
  check("Os atalhos continuam sendo quatro", quick === 4, String(quick));
  await page.locator("main a[href='/treino/corrida']").first().click();
  await page.waitForURL("**/treino/corrida");
  check("A linha de Corrida da Home leva direto à aba Corrida", true);

  // ---------- 15. temas e telas pequenas ----------
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((s) => { localStorage.setItem("theme", s); }, scheme);
    await reload();
    await page.screenshot({ path: path.join(OUT, `run-${scheme}.png`) });
    check(`Tela de Corrida no tema ${scheme === "dark" ? "escuro" : "claro"}: sem rolagem horizontal`, await noHorizontalScroll());
  }
  await page.emulateMedia({ colorScheme: "light" });

  console.log("\nProblemas de console:");
  console.log(problems.length ? problems.join("\n") : "nenhum");
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("ERRO NO ROTEIRO:", e.message.slice(0, 800));
  process.exit(2);
});
