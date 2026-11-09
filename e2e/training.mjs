/**
 * Treino, fase 0, no modo DEMO, num celular (375 px): o resumo do mês, a sugestão de subir a carga (progressão dupla),
 * o "como foi?" ao finalizar e o cadastro de exercício pela biblioteca (vincular, desfazer, vincular de novo).
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:training                    ou  BASE=http://localhost:3101 node e2e/training.mjs
 *
 * O seed do demo garante que a última vez no supino (Treino A) bateu o topo da faixa em todas as séries.
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
const shot = (name) => path.join(OUT, `training-${name}.png`);
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
// O indicador do Next em desenvolvimento (que cresce com avisos, como o de atualização) fica por cima da barra de
// "Finalizar treino". Ele não é do app: some nos testes. Erros de verdade continuam sendo pegos pelo console.
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
const weightOf = (exercise, set) => page.getByLabel(`Carga da série ${set} de ${exercise}, em quilos`).inputValue();

try {
  // ---------- 1. resumo do mês ----------
  await open("/treino");
  const entry = page.getByRole("link", { name: /Resumo do mês/ });
  check("Musculação: a entrada do resumo do mês aparece (há treinos)", (await entry.count()) === 1);
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  const earlyInMonth = Number(today.slice(8, 10)) <= 7;
  const entryText = norm(await entry.innerText());
  check(
    "A entrada fala do mês certo (até o dia 7, o que fechou; depois, o corrente 'até agora')",
    earlyInMonth ? /fechou/.test(entryText) : /até agora/.test(entryText),
    entryText,
  );
  await entry.click();
  await page.waitForURL("**/treino/resumo");
  await page.waitForSelector("text=Séries por grupo muscular");
  const reportText = norm(await page.locator("main").first().innerText());
  check("Resumo: números do mês (treinos, séries, tempo, volume)", ["Treinos", "Séries", "Tempo treinando", "Volume"].every((t) => reportText.includes(t)), reportText.slice(0, 160));
  check("Resumo: compara com o mês anterior", /(vs|igual a) [a-zç]+/.test(reportText));
  const groups = page.getByRole("list", { name: "Séries por grupo muscular" }).getByRole("listitem");
  const groupRows = (await groups.allInnerTexts()).map(norm);
  check("Resumo: séries por grupo muscular, cada linha com o número escrito", groupRows.length >= 3 && groupRows.every((r) => /\d+$/.test(r)), groupRows.join(" | "));
  const widths = await page.getByRole("list", { name: "Séries por grupo muscular" }).evaluate((ul) =>
    [...ul.querySelectorAll("li")].map((li) => li.querySelector("[aria-hidden] > div")?.getBoundingClientRect().width ?? 0),
  );
  check("Resumo: a maior barra é a primeira e as barras não crescem com a ordem", widths[0] > 0 && widths.every((w, i) => i === 0 || w <= widths[i - 1] + 0.5), widths.map((w) => w.toFixed(0)).join(","));
  check("Resumo: semanas com feito × meta e o status escrito", /Semana de/.test(reportText) && /(na meta|abaixo da meta|em andamento)/.test(reportText));
  check("Resumo: 'como foram os treinos' com quantos foram avaliados", /treinos? avaliados?/.test(reportText) && /Na medida/.test(reportText));
  check("Resumo: sem rolagem lateral em 375 px", await noHorizontalScroll());
  await page.screenshot({ path: shot("report"), fullPage: true });
  const moreRecords = page.getByRole("button", { name: /^Ver todos os \d+ recordes$/ });
  if ((await moreRecords.count()) === 1) {
    const total = Number((await moreRecords.getAttribute("aria-label")).match(/\d+/)[0]);
    const recordLinks = () => page.locator("section", { has: page.getByRole("heading", { name: "Recordes" }) }).getByRole("link");
    const preview = await recordLinks().count();
    await moreRecords.click();
    check("Resumo: listas longas mostram 5 e abrem o resto em 'Ver todos'", preview === 5 && (await recordLinks().count()) === total, `${preview} -> ${await recordLinks().count()} de ${total}`);
  }

  const label = () => page.locator("p[aria-live=polite]").first().innerText().then(norm);
  const before = await label();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  const prev = await label();
  check("Resumo: dá para voltar um mês", prev !== before && (await page.getByRole("button", { name: "Próximo mês" }).isEnabled()), `${before} -> ${prev}`);
  if (!earlyInMonth) {
    await page.getByRole("button", { name: "Próximo mês" }).click();
    check("Resumo: no mês corrente não dá para avançar", (await page.getByRole("button", { name: "Próximo mês" }).isDisabled()) && /até agora/.test(await label()));
  }
  await page.setViewportSize({ width: 320, height: 640 });
  check("Resumo: sem rolagem lateral em 320 px", await noHorizontalScroll());
  await page.setViewportSize({ width: 375, height: 812 });

  // ---------- 2. sugestão de subir a carga ----------
  await open("/treino");
  await page.getByRole("button", { name: /^Iniciar Treino A/ }).click();
  await page.waitForURL("**/treino/sessao");
  await page.waitForSelector("text=séries concluídas");
  const chips = page.getByRole("button", { name: /^Subir / });
  check("Sessão: só o supino (que bateu o topo da faixa em todas as séries) sugere subir a carga", (await chips.count()) === 1 && /^Subir Supino reto para/.test((await chips.first().getAttribute("aria-label")) ?? ""));
  const aria = (await chips.first().getAttribute("aria-label")) ?? "";
  const toKg = aria.match(/para ([\d,]+) kg/)?.[1];
  const fromKg = await weightOf("Supino reto", 1);
  const chipText = norm(await chips.first().innerText());
  check("Sessão: a sugestão diz o porquê (repetições e carga da última vez)", /Hora de subir/.test(chipText) && chipText.includes(`com ${fromKg} kg`), chipText);
  await page.screenshot({ path: shot("suggestion"), clip: { x: 0, y: 0, width: 375, height: 520 } });
  await chips.first().click();
  const applied = await Promise.all([1, 2, 3, 4].map((n) => weightOf("Supino reto", n)));
  check("Aplicar põe a carga sugerida em todas as séries por fazer", toKg !== undefined && applied.every((w) => w === toKg), `${fromKg} -> ${applied.join(",")} (sugestão ${toKg})`);
  check("Depois de aplicar: 'Carga ajustada' com opção de voltar", (await page.getByText(`Carga ajustada para ${toKg} kg`).count()) === 1);
  await page.getByRole("button", { name: `Voltar Supino reto para ${fromKg} kg` }).click();
  check("Voltar devolve a carga de antes", (await weightOf("Supino reto", 2)) === fromKg);
  await page.getByRole("button", { name: /^Subir Supino reto para/ }).click();

  // ---------- 3. "como foi?" ao finalizar ----------
  await page.getByRole("button", { name: /^Concluir série 1 de Supino reto/ }).click();
  await page.getByRole("button", { name: "Finalizar treino" }).click();
  const sheet = page.getByRole("dialog", { name: "Como foi o treino?" });
  await sheet.waitFor();
  const sheetText = norm(await sheet.innerText());
  check("Finalizar abre 'Como foi o treino?' com as 4 opções e o aviso das séries pendentes", ["Leve", "Na medida", "Pesado", "Exaustivo"].every((t) => sheetText.includes(t)) && sheetText.includes("não serão salvas"), sheetText.slice(0, 160));
  check("Dá para finalizar sem avaliar", (await sheet.getByRole("button", { name: "Finalizar sem avaliar" }).count()) === 1);
  await page.screenshot({ path: shot("finish-sheet") });
  await sheet.getByRole("button", { name: /^Exaustivo/ }).click();
  await page.waitForURL("**/treino");
  await open("/treino/historico");
  const first = page.locator("main button[aria-expanded]").first();
  check("Histórico: o treino aparece com 'Exaustivo'", /Exaustivo/.test(await first.innerText()));
  await first.click();
  check("Histórico: a série foi salva com a carga sugerida", (await page.locator("main").first().innerText()).includes(`@ ${toKg} kg`));

  await open("/treino");
  await page.getByRole("button", { name: /^Iniciar Treino A/ }).click();
  await page.waitForURL("**/treino/sessao");
  await page.waitForSelector("text=séries concluídas");
  check("Com séries faltando da última vez, não sugere subir de novo", (await page.getByRole("button", { name: /^Subir Supino reto/ }).count()) === 0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Descartar treino" }).click();
  await page.waitForURL("**/treino");

  // ---------- 4. cadastro pela biblioteca ----------
  await open("/configuracoes/catalogos");
  await page.getByRole("button", { name: "Exercício", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Novo exercício" });
  await form.waitFor();
  await form.getByLabel("Nome").fill("serrote");
  const fromLibrary = form.getByRole("list", { name: "Da biblioteca" });
  check("Digitar sugere da biblioteca (pelo apelido 'serrote')", /Remada unilateral com halter/.test(await fromLibrary.innerText()));
  await page.screenshot({ path: shot("library-suggest") });
  await fromLibrary.getByRole("button", { name: /Remada unilateral com halter/ }).click();
  check(
    "Usar a sugestão preenche nome e grupo e mostra o vínculo",
    (await form.getByLabel("Nome").inputValue()) === "Remada unilateral com halter" &&
      (await form.getByLabel("Grupo muscular").inputValue()) === "Costas" &&
      /Da biblioteca: Remada unilateral com halter · Halteres/.test(norm(await form.innerText())),
  );
  await form.getByRole("button", { name: "Criar exercício" }).click();
  await form.waitFor({ state: "hidden" });
  const row = page.getByRole("button", { name: "Editar exercício Remada unilateral com halter" });
  check("O exercício novo aparece na lista", (await row.count()) === 1);

  await row.click();
  const edit = page.getByRole("dialog", { name: "Editar exercício" });
  await edit.waitFor();
  check("Editar mostra o vínculo salvo", /Da biblioteca: Remada unilateral com halter/.test(norm(await edit.innerText())));
  await edit.getByRole("button", { name: "Desfazer vínculo com a biblioteca" }).click();
  const linkList = edit.getByRole("list", { name: "Vincular à biblioteca" });
  check("Sem vínculo, sugere vincular (o nome que bate exatamente vem primeiro)", /^Remada unilateral com halter/.test(norm(await linkList.getByRole("listitem").first().innerText())));
  await edit.getByRole("button", { name: "Salvar alterações" }).click();
  await edit.waitFor({ state: "hidden" });
  await row.click();
  await edit.waitFor();
  check("Desfazer o vínculo é salvo", !/Da biblioteca:/.test(norm(await edit.innerText())) && (await linkList.count()) === 1);
  await linkList.getByRole("button", { name: /Remada unilateral com halter/ }).click();
  check("Vincular um exercício já cadastrado não muda o nome dele", (await edit.getByLabel("Nome").inputValue()) === "Remada unilateral com halter" && /Da biblioteca:/.test(norm(await edit.innerText())));
  await edit.getByRole("button", { name: "Salvar alterações" }).click();
  await edit.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Exercício", exact: true }).click();
  await form.waitFor();
  await form.getByLabel("Nome").fill("Meu circuito funcional");
  check("Nome sem correspondência não mostra sugestões", (await form.getByRole("list", { name: "Da biblioteca" }).count()) === 0);
  await form.getByLabel("Grupo muscular").fill("Funcional");
  await form.getByRole("button", { name: "Criar exercício" }).click();
  await form.waitFor({ state: "hidden" });
  check("Exercício próprio (sem vínculo) continua sendo criado normalmente", (await page.getByRole("button", { name: "Editar exercício Meu circuito funcional" }).count()) === 1);

  check("Nenhum erro nem aviso no console", problems.length === 0, problems.slice(0, 5).join(" | "));
} catch (error) {
  console.error(error);
  results.push({ name: "execução", ok: false });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
