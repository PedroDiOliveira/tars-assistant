/**
 * Assistente no modo DEMO, ponta a ponta, num celular (375 px e 320 px): texto formatado, cards estruturados
 * (Finanças com a categoria da pergunta em foco, semana em lista compacta, Corrida com distância informada x
 * desconhecida), links dos cards, conversa mantida ao navegar, temas claro e escuro e sem rolagem horizontal.
 * O modo real (servidor, banco, provedor de IA) é coberto por e2e/live.mjs.
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:assistant                   ou  BASE=http://localhost:3101 node e2e/assistant.mjs
 *
 * Os dados do demo são trocados por um conjunto pequeno e conhecido antes de perguntar, para os valores serem
 * conferidos à mão. Cada verificação imprime PASS/FAIL e o processo sai com código 1 se alguma falhar.
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
const norm = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

/** Datas do app: São Paulo, não o fuso da máquina que roda o teste. */
const sp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = sp.format(Date.now());

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
  const main = async () => norm(await page.locator("main").first().innerText());
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const chip = (text) => page.getByRole("button", { name: text, exact: true });
  const group = (name) => page.getByRole("group", { name });
  const money = (cents) => norm(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100));

  // ---------- 0. dados conhecidos: o demo semeia muita coisa; aqui só o que as perguntas vão ler ----------
  await open("/assistente");
  const seeded = await page.evaluate(
    ({ key, today }) => {
      const raw = JSON.parse(localStorage.getItem(key));
      const s = raw.state;
      const food = s.categories.find((c) => c.name === "Alimentação" && c.type === "expense");
      const transport = s.categories.find((c) => c.name === "Transporte" && c.type === "expense");
      if (!food || !transport) return { ok: false };
      const tx = (id, categoryId, amountCents) => ({ id, type: "expense", amountCents, categoryId, description: "", occurredOn: today, source: "manual" });
      s.transactions = [tx("t1", food.id, 4000), tx("t2", food.id, 2000), tx("t3", transport.id, 2500)];
      s.goals = [];
      s.sessions = [{ id: "w1", planId: null, nameSnapshot: "Treino A", startedAt: 1, finishedAt: 2, occurredOn: today, exercises: [] }];
      s.runningSessions = [
        { id: "run1", occurredOn: today, distanceMeters: 5000, durationSeconds: 1800 },
        { id: "run2", occurredOn: today },
      ];
      s.subjects = [{ id: "s-sql", name: "SQL", hue: 120 }];
      s.studySessions = [{ id: "ss1", subjectId: "s-sql", source: "manual", occurredOn: today, durationSeconds: 3600 }];
      s.books = [{ id: "b1", title: "Livro A", totalPages: 320, initialPage: 30, status: "reading" }];
      s.readingSessions = [{ id: "r1", bookId: "b1", occurredOn: today, startPage: 30, endPage: 50 }];
      localStorage.setItem(key, JSON.stringify(raw));
      return { ok: true };
    },
    { key: STORAGE_KEY, today: TODAY },
  );
  check("Dados conhecidos preparados no demo (categorias Alimentação e Transporte existem)", seeded.ok === true);
  await open("/assistente");

  // ---------- 1. estado inicial ----------
  check("A conversa começa só com a boas-vindas, sem cards", (await group(/Resumo/).count()) === 0 && /Oi! Posso responder/.test(await main()));

  // ---------- 2. Finanças: card com a categoria da pergunta em foco ----------
  await chip("Quanto gastei com alimentação este mês?").click();
  const finance = group(/Resumo de Finanças/);
  await finance.waitFor({ timeout: 10000 });
  const financeText = norm(await finance.innerText());
  check("Finanças: o card mostra as despesas do mês (R$ 85,00 = 40 + 20 + 25)", financeText.includes(money(8500)), financeText.slice(0, 160));
  check("Finanças: lista as categorias com o valor de cada uma", financeText.includes("Alimentação") && financeText.includes(money(6000)) && financeText.includes("Transporte") && financeText.includes(money(2500)));
  check("Finanças: o card diz o período consultado", /Período: .* de \d{4}/.test(financeText));
  check("Finanças: tem o link para a tela do módulo", (await finance.getByRole("link", { name: /Abrir em Finanças/ }).getAttribute("href")) === "/financas");
  const answerText = await main();
  check("O texto da resposta aparece sem marcação solta (**, ##, |)", !/\*\*|##|\|/.test(answerText) && /Você gastou/.test(answerText), answerText.slice(-200));
  const focusedFont = await finance.getByText("Alimentação", { exact: true }).evaluate((el) => getComputedStyle(el).fontWeight);
  const plainFont = await finance.getByText("Transporte", { exact: true }).evaluate((el) => getComputedStyle(el).fontWeight);
  check("Finanças: a categoria citada na pergunta está em destaque (mais pesada que as outras)", Number(focusedFont) > Number(plainFont), `${focusedFont} x ${plainFont}`);
  check("Finanças: sem rolagem horizontal (375 px)", await noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "assistant-finance.png") });

  // ---------- 3. a semana: três ou mais cards viram uma lista compacta ----------
  await chip("Como foi minha semana?").click();
  const week = group(/Resumo de Musculação, Corrida, Estudos, Leitura/);
  await week.waitFor({ timeout: 10000 });
  const weekText = norm(await week.innerText());
  check("Semana: uma lista compacta com Musculação, Corrida, Estudo e Leitura", ["Musculação", "Corrida", "Estudo", "Leitura"].every((label) => weekText.includes(label)), weekText.slice(0, 200));
  const hrefs = await week.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  check("Semana: cada linha leva à tela do módulo", JSON.stringify(hrefs) === JSON.stringify(["/treino", "/treino/corrida", "/estudos", "/estudos/leitura"]), JSON.stringify(hrefs));
  check("Semana: os valores são os dos dados (1 treino, 2 corridas, 1h de estudo, 20 páginas)", /1\s*treino/.test(weekText) && /2 corridas/.test(weekText) && /1h/.test(weekText) && /20\s*páginas/.test(weekText), weekText);
  check("Semana: o período aparece uma vez só, acima da lista", (weekText.match(/Período:/g) ?? []).length <= 1 && /Período: /.test(await main()));
  check("Semana: sem rolagem horizontal (375 px)", await noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "assistant-week.png") });

  // ---------- 4. a conversa sobrevive a um link do card ----------
  await week.getByRole("link", { name: /Corrida/ }).click();
  await page.waitForURL("**/treino/corrida");
  await page.goBack();
  await page.waitForURL("**/assistente");
  await settle();
  check("Voltar de um link do card: a conversa continua lá (perguntas, texto e cards)", (await group(/Resumo de Finanças/).count()) === 1 && (await week.count()) === 1 && /Quanto gastei com alimentação este mês\?/.test(await main()));

  // ---------- 5. Corrida: distância informada x desconhecida ----------
  await chip("Quanto corri nesta semana?").click();
  const running = group(/Resumo de Corrida/);
  await running.waitFor({ timeout: 10000 });
  const runText = norm(await running.innerText());
  check("Corrida: 5 km informados e a corrida sem distância aparece à parte", runText.includes("5 km informados · 1 corrida sem distância") && runText.includes("2 corridas · 1 dia com corrida"), runText.slice(0, 240));
  check("Corrida: nunca '0 km' como total", !/\b0 km\b/.test(runText));
  check("Corrida: tem o link para a aba Corrida", (await running.getByRole("link", { name: /Abrir em Corrida/ }).getAttribute("href")) === "/treino/corrida");
  check("Corrida: as barras por dia têm descrição para leitores de tela", /Distância por dia: Seg/.test((await running.getByRole("img").first().getAttribute("aria-label")) ?? ""));

  // ---------- 6. pergunta sem dados e pergunta fora do repertório: só texto ----------
  const groupsBefore = await group(/Resumo/).count();
  await page.getByLabel("Mensagem para o assistente").fill("qual a capital da França?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.getByText(/Ainda não sei responder isso/).waitFor({ timeout: 10000 });
  check("Pergunta fora do repertório: só texto, nenhum card novo", (await group(/Resumo/).count()) === groupsBefore);

  // ---------- 7. temas e telas pequenas ----------
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((s) => { localStorage.setItem("theme", s); }, scheme);
    await reload();
    check(`Tema ${scheme === "dark" ? "escuro" : "claro"}: a conversa recomeça só com a boas-vindas (a conversa mora na memória, não no aparelho)`, (await group(/Resumo/).count()) === 0);
    await chip("Quanto estudei SQL neste mês?").click();
    await group(/Resumo de Estudos/).waitFor({ timeout: 10000 });
    check(`Tema ${scheme === "dark" ? "escuro" : "claro"}: card de estudo filtrado pela matéria citada`, /SQL/.test(norm(await group(/Resumo de Estudos/).innerText())));
    await page.screenshot({ path: path.join(OUT, `assistant-${scheme}.png`) });
    check(`Tema ${scheme === "dark" ? "escuro" : "claro"}: sem rolagem horizontal`, await noHorizontalScroll());
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => { localStorage.setItem("theme", "light"); });

  await page.setViewportSize({ width: 320, height: 700 });
  await reload();
  await chip("Como foi minha semana?").click();
  await group(/Resumo de Musculação, Corrida, Estudos, Leitura/).waitFor({ timeout: 10000 });
  await chip("Quanto gastei com alimentação este mês?").click();
  await group(/Resumo de Finanças/).waitFor({ timeout: 10000 });
  check("Tela de 320 px: sem rolagem horizontal com a lista compacta e o card de Finanças", await noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "assistant-320.png") });

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
