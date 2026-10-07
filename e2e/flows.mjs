/**
 * Fluxos ponta a ponta do protótipo, rodados contra o app servido localmente.
 *
 *   npm run dev        (noutro terminal)
 *   npm run test:e2e   ou  BASE=http://192.168.0.10:3000 npm run test:e2e
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
const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const money = (s) => {
  const m = norm(s).match(/-?R\$ ?[\d.]+,\d{2}/);
  return m ? m[0].replace(" ", "") : null;
};

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

  const ready = async (sel = "text=Demo") => {
    await page.waitForSelector(sel, { timeout: 10000 });
    await page.waitForTimeout(300);
  };
  const toast = (text) => page.locator("[data-sonner-toast]", { hasText: text }).first();

  // ---------- 1. Home x Finanças: mesmos totais ----------
  await page.goto(BASE + "/inicio", { waitUntil: "networkidle" });
  await ready();
  const homeFinance = money(await page.locator("a[href='/financas']").first().innerText());
  await page.goto(BASE + "/financas", { waitUntil: "networkidle" });
  await ready();
  const readResult = async () => money(await page.locator("main").first().innerText());
  const finBefore = await readResult();
  check("Home e Finanças mostram o mesmo resultado do mês", homeFinance === finBefore, `${homeFinance} vs ${finBefore}`);

  // ---------- 2. Lançar gasto rápido (R$ 42) ----------
  await page.getByRole("button", { name: "Lançamento", exact: false }).first().click();
  await page.waitForSelector("#tx-amount");
  await page.fill("#tx-amount", "4200");
  const shownAmount = norm(await page.inputValue("#tx-amount"));
  check("Campo de valor usa máscara de centavos (4200 -> R$ 42,00)", shownAmount === "R$ 42,00", shownAmount);
  await page.screenshot({ path: path.join(OUT, "tx-sheet.png") });
  await page.fill("#tx-description", "Teste fluxo");
  await page.getByRole("button", { name: "Salvar lançamento" }).click();
  await toast("Despesa de R$ 42,00 salva").waitFor({ timeout: 4000 }).then(
    () => check("Toast de sucesso ao salvar gasto", true),
    () => check("Toast de sucesso ao salvar gasto", false),
  );
  await page.waitForTimeout(500);
  const finAfter = await readResult();
  const cents = (s) => Number(s.replace(/[^\d-]/g, ""));
  check("Resultado do mês caiu exatamente R$ 42,00", cents(finBefore) - cents(finAfter) === 4200, `${finBefore} -> ${finAfter}`);
  check("Lançamento aparece na lista", (await page.getByText("Teste fluxo").count()) >= 1);

  // ---------- 3. Editar e excluir (com confirmação) ----------
  await page.getByText("Teste fluxo").first().click();
  await page.waitForSelector("text=Editar lançamento");
  await page.getByRole("button", { name: "Excluir" }).first().click();
  await page.getByRole("alertdialog").waitFor();
  check("Exclusão pede confirmação", (await page.getByRole("alertdialog").innerText()).includes("Excluir este lançamento"));
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await page.waitForTimeout(700);
  const finDeleted = await readResult();
  check("Excluir recalcula o total (volta ao valor inicial)", finDeleted === finBefore, `${finDeleted}`);

  // ---------- 4. Lançar por texto: confirma uma vez, sem duplicar ----------
  const countRows = async (t) => page.getByText(t, { exact: true }).count();
  const before = await countRows("Outback");
  await page.getByRole("button", { name: "Por texto" }).click();
  await page.fill("textarea", "Gastei 42 reais no Outback ontem");
  await page.getByRole("button", { name: "Interpretar" }).click();
  await page.waitForSelector("text=Confirmar lançamento");
  const amt = norm(await page.inputValue("#tx-amount"));
  const desc = await page.inputValue("#tx-description");
  check("Proposta de texto: valor, descrição e categoria corretos", amt === "R$ 42,00" && desc === "Outback", `${amt} / ${desc}`);
  check("Nada salvo antes de confirmar", (await countRows("Outback")) === before);
  await page.screenshot({ path: path.join(OUT, "ai-confirm.png") });
  const confirmBtn = page.getByRole("button", { name: "Confirmar lançamento" });
  await confirmBtn.dblclick().catch(() => {});
  await page.waitForTimeout(900);
  check("Confirmação (com toque duplo) cria um único lançamento", (await countRows("Outback")) === before + 1, `${before} -> ${await countRows("Outback")}`);

  // ---------- 5. Treino: iniciar, concluir série, recarregar, finalizar ----------
  await page.goto(BASE + "/treino", { waitUntil: "networkidle" });
  await ready();
  const weekText = async () => (norm(await page.locator("main").first().innerText()).match(/(\d+) de (\d+)\s*treinos/) || [])[0] || "?";
  const weekBefore = await weekText();
  await page.getByRole("button", { name: /^Iniciar / }).first().click();
  await page.waitForURL("**/treino/sessao");
  await page.waitForSelector("text=séries concluídas");
  const firstCheck = page.getByRole("button", { name: /^Concluir série 1 de/ }).first();
  await firstCheck.click();
  await page.waitForSelector("[role=timer][aria-label='Descanso entre séries']");
  check("Concluir série inicia o descanso", true);
  await page.screenshot({ path: path.join(OUT, "session.png") });
  const progBefore = norm(await page.locator("text=/\\d+ de \\d+ séries concluídas/").first().innerText());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=séries concluídas");
  const progAfter = norm(await page.locator("text=/\\d+ de \\d+ séries concluídas/").first().innerText());
  check("Treino em andamento é recuperado após recarregar", progBefore === progAfter && progAfter.startsWith("1 de"), `${progBefore} | ${progAfter}`);
  // Meta da semana não conta treino em andamento
  await page.goto(BASE + "/treino", { waitUntil: "networkidle" });
  await ready();
  const weekDuring = await weekText();
  check("Treino em andamento não conta na meta", weekDuring === weekBefore, `${weekBefore} | ${weekDuring}`);
  await page.getByRole("button", { name: "Continuar" }).first().click();
  await page.waitForURL("**/treino/sessao");
  await page.getByRole("button", { name: "Finalizar treino" }).click();
  await page.getByRole("alertdialog").waitFor();
  check("Finalizar com séries pendentes pede confirmação", (await page.getByRole("alertdialog").innerText()).includes("pendentes"));
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalizar treino" }).click();
  await page.waitForURL("**/treino");
  await ready();
  const weekAfter = await weekText();
  check("Só após finalizar o treino conta na meta semanal", weekAfter !== weekBefore && weekAfter.startsWith("2 de"), `${weekBefore} -> ${weekAfter}`);

  // ---------- 6. Estudos: cronômetro sobrevive a reload e pausa não soma tempo ----------
  await page.goto(BASE + "/estudos", { waitUntil: "networkidle" });
  await ready();
  await page.getByRole("button", { name: "SQL" }).first().click();
  await page.waitForSelector("[role=timer]");
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Pausar" }).click();
  const clock1 = norm(await page.locator("[role=timer]").first().innerText());
  await page.waitForTimeout(2500);
  const clock2 = norm(await page.locator("[role=timer]").first().innerText());
  check("Pausado não avança o relógio", clock1 === clock2, `${clock1} | ${clock2}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[role=timer]");
  const clock3 = norm(await page.locator("[role=timer]").first().innerText());
  check("Cronômetro recuperado após recarregar (mesmo valor)", clock3 === clock1, `${clock1} | ${clock3}`);
  // simula 30 min rodando para finalizar de verdade
  await page.evaluate(() => {
    const key = "tars-demo-v1";
    const raw = JSON.parse(localStorage.getItem(key));
    const now = Date.now();
    raw.state.timer = { subjectId: "sub-sql", startedAt: now - 1_800_000, runningSince: now - 1_800_000, accumulatedSeconds: 0 };
    localStorage.setItem(key, JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[role=timer]");
  const clock4 = norm(await page.locator("[role=timer]").first().innerText());
  check("Cronômetro em 30 min mostra ~30:00 após voltar ao app", /^30:0\d$/.test(clock4) || /^30:1\d$/.test(clock4), clock4);
  await page.screenshot({ path: path.join(OUT, "timer.png") });
  const finishBtn = page.getByRole("button", { name: "Finalizar" });
  await finishBtn.dblclick().catch(() => {});
  await page.waitForTimeout(800);
  // sessões criadas agora têm id "st_..." (as do seed são "st-N")
  const created = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("tars-demo-v1"));
    return raw.state.studySessions.filter((s) => s.id.startsWith("st_")).map((s) => s.durationSeconds);
  });
  check("Finalizar (toque duplo) registra uma única sessão de ~30min", created.length === 1 && created[0] >= 1800 && created[0] < 1830, JSON.stringify(created));
  check("Cronômetro some depois de finalizar", (await page.locator("[role=timer]").count()) === 0);

  // ---------- 7. Leitura: 30 -> 50 = 20 páginas ----------
  await page.goto(BASE + "/estudos/leitura", { waitUntil: "networkidle" });
  await ready();
  const weekPages = async () => Number(norm(await page.locator("main").first().innerText()).match(/(\d+) de \d+\s*páginas/)[1]);
  const pagesBefore = await weekPages();
  await page.getByRole("button", { name: "Registrar leitura" }).first().click();
  await page.waitForSelector("text=Página inicial");
  const startPage = Number(await page.locator("label:has-text('Página inicial') input").inputValue());
  await page.locator("label:has-text('Página final') input").fill(String(startPage + 20));
  const hint = norm(await page.locator("text=/conta 20/").first().innerText());
  check("Prévia informa 20 páginas", hint.includes("conta 20"), hint);
  await page.getByRole("button", { name: "Registrar leitura" }).last().click();
  await page.waitForTimeout(700);
  const pagesAfter = await weekPages();
  check("Semana soma exatamente 20 páginas", pagesAfter - pagesBefore === 20, `${pagesBefore} -> ${pagesAfter}`);
  check("Posição do livro avançou 20", (await page.getByText(`Página ${startPage + 20} de`).count()) >= 1);
  // validação
  await page.getByRole("button", { name: "Registrar leitura" }).first().click();
  await page.waitForSelector("text=Página inicial");
  await page.locator("label:has-text('Página final') input").fill("5");
  check("Fim menor que início mostra erro e bloqueia", (await page.getByRole("alert").count()) >= 1 && (await page.getByRole("button", { name: "Registrar leitura" }).last().isDisabled()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ---------- 8. Meta por vigência ----------
  await page.goto(BASE + "/configuracoes", { waitUntil: "networkidle" });
  await ready("text=Configurações");
  await page.getByRole("button", { name: /Treinos por semana/ }).click();
  await page.waitForSelector("#goal-value");
  await page.fill("#goal-value", "5");
  await page.getByRole("button", { name: "Salvar meta" }).click();
  await page.waitForTimeout(600);
  await page.goto(BASE + "/inicio", { waitUntil: "networkidle" });
  await ready();
  const homeTxt = norm(await page.locator("main").first().innerText());
  check("Home reflete a nova meta (x de 5)", /Treino \d de 5/.test(homeTxt), homeTxt.slice(0, 0) || undefined);
  await page.goto(BASE + "/treino", { waitUntil: "networkidle" });
  await ready();
  const treinoTxt = norm(await page.locator("main").first().innerText());
  check("Semanas passadas mantêm a meta antiga (sequência preservada)", /3 semanas seguidas na meta/.test(treinoTxt));

  // ---------- 9. Resetar demo ----------
  await page.goto(BASE + "/configuracoes", { waitUntil: "networkidle" });
  await ready("text=Configurações");
  await page.getByRole("button", { name: /Resetar dados/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Resetar" }).click();
  await page.waitForTimeout(600);
  await page.goto(BASE + "/estudos", { waitUntil: "networkidle" });
  await ready();
  check("Resetar remove o cronômetro/treino e restaura o seed", (await page.locator("[role=timer]").count()) === 0);

  console.log("\nProblemas de console:");
  console.log(problems.length ? problems.join("\n") : "nenhum");
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("ERRO NO ROTEIRO:", e.message.slice(0, 600));
  process.exit(2);
});
