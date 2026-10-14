/**
 * Edição do nome de exibição no modo DEMO, ponta a ponta, num celular (375 px): abrir o editor, validação no campo,
 * normalização, persistência, saudação, avatar (inclusive com emoji) e nome longo sem estourar o layout. O modo real
 * (servidor + banco + RLS) é coberto por e2e/live.mjs e por supabase/tests/profile-name.test.ts.
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:profile                     ou  BASE=http://localhost:3101 node e2e/profile.mjs
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
// `\s` já cobre o espaço não separável (NBSP) e o fino (U+202F) que o Intl usa nos números.
const norm = (s) => s.replace(/\s+/g, " ").trim();

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
  const storedName = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").state?.displayName, STORAGE_KEY);
  const main = async () => norm(await page.locator("main").first().innerText());
  const toast = (text) => page.locator("[data-sonner-toast]", { hasText: text }).first();
  const dialog = () => page.getByRole("dialog");
  const field = () => dialog().getByLabel("Nome", { exact: true });
  const saveButton = () => dialog().getByRole("button", { name: /Salvar nome|Salvando/ });
  // O avatar com a inicial mora no cabeçalho das telas de abas (Início); Configurações é uma sub-rota com outro cabeçalho.
  const avatar = () => page.locator("a[aria-label='Configurações e perfil']");
  const headerInitial = async () => {
    await open("/inicio");
    const initial = (await avatar().innerText()).trim();
    await open("/configuracoes");
    return initial;
  };
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const openEditor = async () => {
    await page.getByRole("button", { name: "Editar nome" }).click();
    await field().waitFor();
    await page.waitForTimeout(500); // animação de abertura
  };
  const closeEditor = async () => {
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  };
  const rename = async (text) => {
    await openEditor();
    await field().fill(text);
    await saveButton().click();
  };

  /* ---------- 1. estado inicial ---------- */
  await open("/configuracoes");
  check("O cartão de perfil mostra o nome atual", (await main()).includes("Pedro"));
  check("O avatar do cabeçalho mostra a inicial", (await headerInitial()) === "P");
  check("O lápis tem nome acessível ('Editar nome')", (await page.getByRole("button", { name: "Editar nome" }).count()) === 1);

  /* ---------- 2. o editor ---------- */
  await openEditor();
  check("O editor abre com o nome atual", (await field().inputValue()) === "Pedro");
  check("Sem mudança, salvar fica desabilitado", await saveButton().isDisabled());
  await page.screenshot({ path: path.join(OUT, "profile-editor.png") });

  await field().fill("Pe" + String.fromCodePoint(0x200b) + "dro");
  check("Caractere invisível: aviso no campo e botão travado", (await dialog().getByRole("alert").innerText()).includes("invisíveis") && (await saveButton().isDisabled()));
  check("O campo é marcado como inválido para leitores de tela", (await field().getAttribute("aria-invalid")) === "true");
  await field().fill("   ");
  check("Só espaços: pede um nome", (await dialog().getByRole("alert").innerText()).includes("Informe um nome.") && (await saveButton().isDisabled()));
  await field().fill("...");
  check("Sem letra nem número: recusado", (await dialog().getByRole("alert").innerText()).includes("letra ou um número"));
  await field().fill("x".repeat(80));
  check("O campo não aceita mais que 60 caracteres", (await field().inputValue()).length === 60);
  await field().fill("Ana");
  check("Voltando a um nome válido o aviso some e o botão libera", (await dialog().getByRole("alert").innerText()).trim() === "" && !(await saveButton().isDisabled()));

  /* ---------- 3. fechar sem salvar não muda nada ---------- */
  await closeEditor();
  check("Fechar sem salvar mantém o nome", (await main()).includes("Pedro") && (await storedName()) === "Pedro");
  await openEditor();
  check("Ao reabrir, o rascunho descartado não volta (mostra o nome salvo)", (await field().inputValue()) === "Pedro");
  await closeEditor();

  /* ---------- 4. salvar: normaliza, avisa, persiste ---------- */
  await rename("  Ana   Clara ");
  await toast("Nome atualizado").waitFor();
  // O sheet sai do DOM só depois da animação de fechamento.
  await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 }).catch(() => undefined);
  check("Salvar fecha o editor e avisa", (await dialog().count()) === 0);
  check("O nome aparece normalizado (sem espaços sobrando)", (await main()).includes("Ana Clara") && (await storedName()) === "Ana Clara");
  await reload();
  check("Depois de recarregar o nome continua", (await main()).includes("Ana Clara"));
  await open("/inicio");
  check("A saudação da Home usa o novo nome", norm(await page.locator("h1").first().innerText()).includes("Ana Clara"));
  check("O avatar do cabeçalho vira a nova inicial", (await avatar().innerText()).trim() === "A");

  /* ---------- 5. emoji e letra acentuada: a inicial nunca é metade de um caractere ---------- */
  await open("/configuracoes");
  await rename("🚀 Ana");
  await toast("Nome atualizado").waitFor();
  check("Com emoji no começo o avatar mostra o emoji inteiro", (await headerInitial()) === "🚀");
  await rename("émerson");
  await toast("Nome atualizado").waitFor();
  check("Letra acentuada vira inicial maiúscula acentuada", (await headerInitial()) === "É");

  /* ---------- 6. nome no tamanho máximo não estoura o layout ---------- */
  const longName = "W".repeat(60);
  await rename(longName);
  await toast("Nome atualizado").waitFor();
  await page.waitForSelector('[data-slot="drawer-content"]', { state: "detached", timeout: 5000 }).catch(() => undefined);
  check("Nome de 60 letras sem espaço: Configurações sem rolagem horizontal", await noHorizontalScroll());
  await page.screenshot({ path: path.join(OUT, "profile-long-name.png") });
  await open("/inicio");
  check("Nome de 60 letras sem espaço: Home sem rolagem horizontal", await noHorizontalScroll());

  /* ---------- 7. tema escuro ---------- */
  await page.emulateMedia({ colorScheme: "dark" });
  await open("/configuracoes");
  await openEditor();
  await field().fill("");
  await page.screenshot({ path: path.join(OUT, "profile-editor-dark.png") });
  check("Editor no tema escuro: sem rolagem horizontal", await noHorizontalScroll());
  await closeEditor();
  await page.emulateMedia({ colorScheme: "light" });

  /* ---------- 8. resetar a demonstração devolve o nome de demonstração ---------- */
  await open("/configuracoes");
  await page.getByRole("button", { name: /Resetar dados/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Resetar" }).click();
  await page.waitForTimeout(600);
  check("Resetar a demonstração restaura o nome de demonstração", (await storedName()) === "Pedro");

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
