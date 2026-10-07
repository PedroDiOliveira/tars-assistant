/**
 * E2E do modo LIVE: o app real (build de produção, NEXT_PUBLIC_APP_MODE=live) contra um Supabase falso
 * (e2e/fake-supabase.mjs: Auth + PostgREST sobre o PGlite com as migrações reais). Não precisa de chaves.
 *
 *   npm run test:e2e:live
 *
 * Prova a integração que os testes unitários não alcançam: cookies de sessão, proxy, Server Actions, atualização
 * otimista, reconciliação com o servidor, isolamento entre usuários e fluxo de senha. Cada verificação imprime
 * PASS/FAIL e o processo sai com código 1 se alguma falhar.
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";
import { startFakeXai } from "./fake-xai.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "e2e", "artifacts");
fs.mkdirSync(OUT, { recursive: true });

const APP_PORT = Number(process.env.LIVE_APP_PORT || 3300);
const DB_PORT = Number(process.env.LIVE_DB_PORT || 54399);
const AI_PORT = Number(process.env.LIVE_AI_PORT || 54398);
const NOAI_PORT = Number(process.env.LIVE_NOAI_PORT || 3301);
const BASE = `http://127.0.0.1:${APP_PORT}`;
const DIST = ".next-live";
const PASSWORD = "senha-forte-123";

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};
const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

/* ---------- subir tudo ---------- */

/** Um servidor velho respondendo na porta faria o teste validar o app ERRADO: nunca reaproveitamos. */
const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
for (const port of [APP_PORT, DB_PORT, AI_PORT, NOAI_PORT]) {
  if (!(await portFree(port))) {
    console.error(`A porta ${port} já está em uso. Encerre o processo que a usa (ou defina LIVE_APP_PORT / LIVE_DB_PORT) e rode de novo.`);
    process.exit(1);
  }
}

const fake = await startFakeSupabase({ port: DB_PORT });
const xai = await startFakeXai({ port: AI_PORT });
const userA = await fake.createUser("pedro@tars.example", PASSWORD);
await fake.createUser("outro@tars.example", "outra-senha-forte-1");

const appEnv = {
  ...process.env,
  NEXT_DIST_DIR: DIST,
  NEXT_PUBLIC_APP_MODE: "live",
  SUPABASE_URL: fake.url,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  CRON_SECRET: "segredo-do-cron-com-16-ou-mais",
  AI_PROVIDER: "xai",
  AI_MODEL: "fake-grok",
  AI_API_KEY: xai.apiKey,
  AI_BASE_URL: xai.url,
};

let server;
let serverNoAi;
async function shutdown(code) {
  try {
    server?.kill("SIGKILL");
    serverNoAi?.kill("SIGKILL");
  } catch {}
  await xai.close().catch(() => {});
  await fake.close().catch(() => {});
  process.exit(code);
}

try {
  console.log("Compilando o app em modo live (pasta separada, não mexe no servidor de desenvolvimento)…");
  const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, env: appEnv, encoding: "utf8" });
  if (build.status !== 0) {
    console.error(build.stdout?.slice(-2000), build.stderr?.slice(-2000));
    throw new Error("O build live falhou");
  }

  // Direto pelo Node (sem npx/sh no meio): o kill acerta o servidor de verdade, sem deixar processo órfão.
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], { cwd: ROOT, env: appEnv, stdio: "pipe" });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 60; i++) {
    const up = await fetch(`${BASE}/login`).then((r) => r.ok, () => false);
    if (up) break;
    if (i === 59) throw new Error("O servidor não subiu:\n" + serverLog.slice(-1500));
    await new Promise((r) => setTimeout(r, 500));
  }

  /* ---------- navegador ---------- */

  const browser = await chromium.launch();
  const contextOptions = { viewport: { width: 375, height: 812 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", baseURL: BASE };
  const newContext = () => browser.newContext(contextOptions);

  const problems = [];
  const watch = (page) => {
    page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));
    page.on("console", (m) => {
      // Avisos também: foi assim que se acha cabeçalho de segurança mal formado (ex.: Permissions-Policy).
      if (m.type() === "error" || m.type() === "warning") problems.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
    });
  };

  /** A abertura animada deixa o conteúdo `inert` (e fora da árvore de acessibilidade) por ~3,5 s. */
  const splashDone = async (page) => {
    // O JS hidratou de verdade? `data-app-ready` é marcado pelo AppLaunch ao montar. Sem isto um erro de carregamento
    // passaria despercebido: o BootCheck também remove a abertura (e o formulário ainda funciona sem JS).
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 15000 });
    await page.waitForSelector(".launch-screen", { state: "detached", timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector(".app-content")?.hasAttribute("inert"), null, { timeout: 5000 });
    if ((await page.getByText("O app não terminou de carregar").count()) > 0) {
      throw new Error(`O app não hidratou em ${page.url()} (BootCheck disparou)`);
    }
  };
  /** Tela carregada: abertura concluída, esqueleto de carregamento (aria-busy) já substituído pelo conteúdo. */
  const appReady = async (page) => {
    await page.waitForSelector("main", { timeout: 15000 });
    await splashDone(page);
    // O cabeçalho vem do servidor; os dados chegam depois. O esqueleto (aria-busy) some quando a tela está pronta.
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 15000 });
    await page.waitForTimeout(200);
  };
  const toast = (page, text) => page.locator("[data-sonner-toast]", { hasText: text }).first();
  const money = (s) => norm(s).match(/-?R\$ ?[\d.]+,\d{2}/)?.[0].replace(" ", "") ?? null;

  async function login(page, email, password) {
    await page.goto("/login");
    await splashDone(page);
    await page.waitForSelector("input[name=email]");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", password);
    await page.getByRole("button", { name: "Entrar" }).click();
  }

  async function addTransaction(page, { type, cents, description }) {
    await page.goto("/financas");
    await appReady(page);
    await page.getByRole("button", { name: "Lançamento", exact: false }).first().click();
    await page.waitForSelector("#tx-amount");
    if (type === "income") await page.getByRole("radio", { name: "Receita" }).click();
    await page.fill("#tx-amount", String(cents));
    await page.fill("#tx-description", description);
  }

  const dbRows = (sql, params) => fake.admin(sql, params);

  /* ===== 1. portão de autenticação ===== */
  {
    const ctx = await newContext();
    const page = await ctx.newPage();
    watch(page);

    const api = await ctx.request.get("/api/snapshot");
    check("API sem sessão responde 401", api.status() === 401, String(api.status()));
    check("API sem sessão não vaza nada no corpo", (await api.text()).length < 60, await api.text());

    await page.goto("/inicio");
    await page.waitForURL("**/login");
    await splashDone(page);
    check("Página protegida sem sessão redireciona para /login", page.url().endsWith("/login"));
    check("Login real: sem o aviso de 'Modo demonstração'", (await page.getByText("Modo demonstração").count()) === 0);
    check("Login real tem o link 'Esqueci minha senha'", (await page.getByRole("link", { name: "Esqueci minha senha" }).count()) === 1);

    const redirects = [];
    for (const p of ["/", "/inicio", "/financas", "/treino", "/estudos", "/estudos/leitura", "/configuracoes", "/assistente", "/treino/sessao"]) {
      const r = await ctx.request.get(p, { maxRedirects: 0 });
      redirects.push([p, r.status(), r.headers()["location"] ?? ""]);
    }
    const bad = redirects.filter(([, status, location]) => !([307, 308].includes(status) && location.endsWith("/login")));
    check("Todas as rotas do app exigem login (redirecionam para /login)", bad.length === 0, JSON.stringify(bad));

    const unauth = await ctx.request.post("/api/assistant", { data: {} });
    check("POST /api/assistant sem sessão não é aceito", [401, 404].includes(unauth.status()), String(unauth.status()));
    await ctx.close();
  }

  /* ===== 2. credenciais inválidas ===== */
  {
    const ctx = await newContext();
    const page = await ctx.newPage();
    watch(page);
    await login(page, "pedro@tars.example", "senha-errada-123");
    await page.waitForSelector("form [role=alert]");
    const wrongPassword = norm(await page.locator("form [role=alert]").first().innerText());
    // React 19 limpa o formulário depois da action: o e-mail digitado precisa voltar, a senha não.
    await page.waitForTimeout(300);
    const emailKept = await page.inputValue("input[name=email]");
    const passwordAfter = await page.inputValue("input[name=password]");
    await login(page, "naoexiste@tars.example", "qualquer-coisa-12");
    await page.waitForSelector("form [role=alert]");
    const unknownUser = norm(await page.locator("form [role=alert]").first().innerText());
    check("Senha errada: mensagem genérica", wrongPassword === "E-mail ou senha incorretos.", wrongPassword);
    check("Depois de errar a senha o e-mail continua preenchido (e a senha vazia)", emailKept === "pedro@tars.example" && passwordAfter === "", `email="${emailKept}" senha="${passwordAfter}"`);
    check("E-mail inexistente: MESMA mensagem (sem enumerar contas)", unknownUser === wrongPassword, unknownUser);
    check("Continua no /login depois de falhar", page.url().endsWith("/login"));
    check("Nenhum cookie de sessão foi criado", (await ctx.cookies()).filter((c) => c.name.startsWith("sb-")).length === 0);
    await ctx.close();
  }

  /* ===== 3 a 7. sessão do dono A ===== */
  const ctxA = await newContext();
  const pageA = await ctxA.newPage();
  watch(pageA);

  await login(pageA, "pedro@tars.example", PASSWORD);
  await pageA.waitForURL("**/inicio", { timeout: 15000 });
  await appReady(pageA);
  check("Login válido leva ao /inicio", pageA.url().endsWith("/inicio"));
  check("Modo real: sem o selo 'Demo' no cabeçalho", (await pageA.getByText("Demo", { exact: true }).count()) === 0);
  const sessionCookies = (await ctxA.cookies()).filter((c) => c.name.startsWith("sb-"));
  check("Sessão guardada em cookie do Supabase", sessionCookies.length >= 1, sessionCookies.map((c) => c.name).join(","));
  check("Cookie de sessão é httpOnly e SameSite=Lax (o JavaScript da página não enxerga o token)", sessionCookies.length >= 1 && sessionCookies.every((c) => c.httpOnly && c.sameSite === "Lax"), sessionCookies.map((c) => `${c.name}:${c.httpOnly ? "httpOnly" : "JS"}:${c.sameSite}`).join(","));
  check("Conta nova começa sem lançamentos (nenhum dado fictício)", (await dbRows("select count(*)::int as n from public.transactions"))[0].n === 0);
  await pageA.screenshot({ path: path.join(OUT, "live-home.png") });

  const api = await ctxA.request.get("/api/snapshot");
  const cacheControl = api.headers()["cache-control"] ?? "";
  check("/api/snapshot autenticado responde 200", api.status() === 200, String(api.status()));
  check("Resposta de dados nunca é cacheável (private, no-store)", /private/.test(cacheControl) && /no-store/.test(cacheControl), cacheControl);
  const payload = await api.json();
  check("Snapshot traz as categorias iniciais e o nome do dono", payload.data.categories.length === 10 && payload.profile.displayName === "pedro");

  /* ----- finanças: R$ 3.500 − R$ 42 = R$ 3.458 ----- */
  await addTransaction(pageA, { type: "income", cents: 350000, description: "Salário teste" });
  await pageA.getByRole("button", { name: "Salvar lançamento" }).click();
  await toast(pageA, "Receita de R$ 3.500,00 salva").waitFor({ timeout: 8000 }).then(
    () => check("Receita salva: aviso só aparece depois do servidor confirmar", true),
    () => check("Receita salva: aviso só aparece depois do servidor confirmar", false),
  );
  await pageA.waitForTimeout(400);
  await addTransaction(pageA, { type: "expense", cents: 4200, description: "Outback teste" });
  await pageA.getByRole("button", { name: "Salvar lançamento" }).click();
  await toast(pageA, "Despesa de R$ 42,00 salva").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.waitForTimeout(600);
  check("Receita de R$ 3.500 e despesa de R$ 42 resultam em R$ 3.458,00 (spec §15)", money(await pageA.locator("main").first().innerText()) === "R$3.458,00", money(await pageA.locator("main").first().innerText()));
  const stored = await dbRows("select type, amount_cents::int as cents, description, user_id from public.transactions order by amount_cents desc");
  check("O banco realmente tem os dois lançamentos, do usuário certo", stored.length === 2 && stored[0].cents === 350000 && stored[1].cents === 4200 && stored.every((r) => r.user_id === userA), JSON.stringify(stored.map((r) => r.cents)));

  await pageA.reload();
  await appReady(pageA);
  await pageA.goto("/financas");
  await appReady(pageA);
  check("Persiste depois de recarregar (R$ 3.458,00)", money(await pageA.locator("main").first().innerText()) === "R$3.458,00");
  check("Os lançamentos aparecem na lista depois de recarregar", (await pageA.getByText("Outback teste").count()) >= 1);

  /* ----- toque duplo: um lançamento só ----- */
  await addTransaction(pageA, { type: "expense", cents: 1000, description: "Toque duplo" });
  await pageA.getByRole("button", { name: "Salvar lançamento" }).dblclick().catch(() => {});
  await pageA.waitForTimeout(1200);
  const doubleTap = await dbRows("select count(*)::int as n from public.transactions where description = 'Toque duplo'");
  check("Toque duplo em Salvar grava um único lançamento no banco", doubleTap[0].n === 1, String(doubleTap[0].n));

  /* ----- servidor fora do ar AO ABRIR: erro claro e "Tentar de novo" ----- */
  fake.setRestDown(true);
  await pageA.goto("/financas");
  await splashDone(pageA);
  await pageA.getByText("Não consegui carregar seus dados").waitFor({ timeout: 25000 }).then(
    () => check("Servidor fora do ar ao abrir: a tela explica o problema (não fica em esqueleto)", true),
    () => check("Servidor fora do ar ao abrir: a tela explica o problema (não fica em esqueleto)", false),
  );
  fake.setRestDown(false);
  await pageA.getByRole("button", { name: "Tentar de novo" }).click();
  await appReady(pageA);
  check("Servidor volta: 'Tentar de novo' recarrega os dados (R$ 3.458,00 − R$ 10,00)", money(await pageA.locator("main").first().innerText()) === "R$3.448,00", money(await pageA.locator("main").first().innerText()));

  /* ----- servidor cai DEPOIS de abrir: nada de falso sucesso ----- */
  await addTransaction(pageA, { type: "expense", cents: 9900, description: "Sem rede" });
  fake.setRestDown(true);
  await pageA.getByRole("button", { name: "Salvar lançamento" }).click();
  await pageA.waitForTimeout(2500);
  const failToast = (await pageA.locator("[data-sonner-toast]").allInnerTexts()).map(norm).join(" | ");
  check("Servidor cai ao salvar: erro claro, e NUNCA 'salva'", /Nada foi salvo|Sem conexão/.test(failToast) && !/Despesa de R\$ 99,00 salva/.test(failToast), failToast);
  fake.setRestDown(false);
  await pageA.waitForTimeout(800);
  check("Nada foi gravado durante a queda", (await dbRows("select count(*)::int as n from public.transactions where description = 'Sem rede'"))[0].n === 0);
  await pageA.keyboard.press("Escape");
  await pageA.goto("/financas");
  await appReady(pageA);
  check("Depois da queda a tela reflete só o que existe no servidor", (await pageA.getByText("Sem rede").count()) === 0 && money(await pageA.locator("main").first().innerText()) === "R$3.448,00");

  /* ----- estudos: cronômetro no servidor, visível em outro aparelho ----- */
  await pageA.goto("/estudos");
  await appReady(pageA);
  await pageA.getByRole("button", { name: "Nova matéria" }).click();
  await pageA.fill("input[aria-label='Nome da nova matéria']", "SQL");
  await pageA.getByRole("button", { name: "Criar e iniciar" }).click();
  await pageA.waitForSelector("[role=timer]", { timeout: 8000 });
  await pageA.waitForTimeout(500);
  const timers = await dbRows("select user_id, subject_id from public.study_timers");
  check("Cronômetro iniciado e gravado no servidor (um por usuário)", timers.length === 1 && timers[0].user_id === userA);

  const ctxA2 = await newContext(); // "outro aparelho" do mesmo dono
  const phone = await ctxA2.newPage();
  watch(phone);
  await login(phone, "pedro@tars.example", PASSWORD);
  await phone.waitForURL("**/inicio");
  await phone.goto("/estudos");
  await appReady(phone);
  await phone.waitForSelector("[role=timer]", { timeout: 8000 });
  check("Outro aparelho enxerga o mesmo cronômetro em andamento", (await phone.locator("[role=timer]").count()) === 1);
  await ctxA2.close();

  await pageA.reload();
  await appReady(pageA);
  await pageA.waitForSelector("[role=timer]", { timeout: 8000 });
  check("Cronômetro sobrevive ao recarregar a página", (await pageA.locator("[role=timer]").count()) === 1);

  // avança o relógio do SERVIDOR em 30 min: o app tem de mostrar ~30:00 mesmo com o relógio do navegador parado
  await dbRows("select set_config('app.test_now', $1, false)", [new Date(Date.now() + 30 * 60_000).toISOString()]);
  await pageA.reload();
  await appReady(pageA);
  await pageA.waitForSelector("[role=timer]");
  const clock = norm(await pageA.locator("[role=timer]").first().innerText());
  // 30 min de avanço do servidor + os segundos reais que já passaram desde o início (< 1 min no teste)
  check("Relógio do servidor 30 min à frente: cronômetro mostra entre 30:00 e 30:59", /^30:[0-5]\d$/.test(clock), clock);
  await pageA.getByRole("button", { name: "Finalizar" }).dblclick().catch(() => {});
  await pageA.waitForTimeout(1500);
  const sessions = await dbRows("select duration_seconds, source from public.study_sessions");
  check("Finalizar (toque duplo) grava UMA sessão, com a duração do servidor (~30 min)", sessions.length === 1 && sessions[0].duration_seconds >= 1800 && sessions[0].duration_seconds < 1830 && sessions[0].source === "timer", JSON.stringify(sessions));
  check("O cronômetro foi removido do servidor", (await dbRows("select count(*)::int as n from public.study_timers"))[0].n === 0);
  await dbRows("select set_config('app.test_now', '', false)");

  /* ----- leitura: 30 -> 50 = 20 páginas ----- */
  await pageA.goto("/estudos/leitura");
  await appReady(pageA);
  await pageA.getByRole("button", { name: "Adicionar livro" }).first().click();
  await pageA.waitForSelector("text=Novo livro");
  await pageA.locator("label:has-text('Título') input").fill("Livro de teste");
  await pageA.locator("label:has-text('Total de páginas') input").fill("320");
  await pageA.locator("label:has-text('Página atual') input").fill("30");
  await pageA.getByRole("button", { name: "Adicionar livro" }).last().click();
  await pageA.waitForTimeout(900);
  await pageA.getByRole("button", { name: "Registrar leitura" }).first().click();
  await pageA.waitForSelector("text=Página inicial");
  await pageA.locator("label:has-text('Página final') input").fill("50");
  await pageA.getByRole("button", { name: "Registrar leitura" }).last().click();
  await pageA.waitForTimeout(1000);
  const reading = await dbRows("select start_page, end_page from public.reading_sessions");
  check("Leitura da posição 30 à 50 gravada no banco", reading.length === 1 && reading[0].start_page === 30 && reading[0].end_page === 50, JSON.stringify(reading));
  check("A tela mostra 20 páginas (a página inicial do cadastro não conta)", /20 de|20 págs|\b20\b/.test(norm(await pageA.locator("main").first().innerText())));

  /* ----- fichas: a conta real começa SEM fichas; criar, editar, treinar e arquivar ----- */
  await pageA.goto("/treino");
  await appReady(pageA);
  check("Conta nova: Treino mostra o estado vazio com a ação 'Criar ficha'", (await pageA.getByText("Nenhuma ficha cadastrada").count()) === 1 && (await pageA.getByRole("button", { name: "Criar ficha" }).count()) === 1);
  await pageA.getByRole("button", { name: "Criar ficha" }).click();
  await pageA.waitForSelector("text=Nome da ficha");
  await pageA.fill("input[placeholder^='Ex.: Treino A']", "Treino A — Peito");
  check("Ficha sem exercícios não pode ser criada", await pageA.getByRole("button", { name: "Criar ficha" }).last().isDisabled());
  await pageA.getByRole("button", { name: "Adicionar exercício" }).click();
  await pageA.getByRole("button", { name: /^Supino reto/ }).click();
  await pageA.getByRole("button", { name: "Adicionar exercício" }).click();
  await pageA.getByRole("button", { name: "Criar novo exercício" }).click();
  await pageA.locator("label:has-text('Nome') input").fill("Remada unilateral");
  await pageA.locator("label:has-text('Grupo muscular') input").fill("Costas");
  await pageA.getByRole("button", { name: "Criar e adicionar à ficha" }).click();
  await pageA.waitForSelector("text=Exercícios (2)");
  check("Exercício novo criado direto da ficha e já incluído nela", (await dbRows("select count(*)::int as n from public.exercises where name = 'Remada unilateral'"))[0].n === 1);

  await pageA.getByLabel("Repetições máximas").first().fill("4");
  check("Reps máximas menores que as mínimas: erro claro e botão bloqueado", (await pageA.getByText("não podem ser menores que as mínimas").count()) >= 1 && (await pageA.getByRole("button", { name: "Criar ficha" }).last().isDisabled()));
  await pageA.getByLabel("Repetições máximas").first().fill("10");
  await pageA.getByRole("button", { name: "Subir Remada unilateral" }).click();
  await pageA.getByRole("button", { name: "Criar ficha" }).last().dblclick().catch(() => {});
  await toast(pageA, "Ficha criada").waitFor({ timeout: 8000 }).then(
    () => check("Ficha criada (toque duplo: uma só)", true),
    () => check("Ficha criada (toque duplo: uma só)", false),
  );
  await pageA.waitForTimeout(600);
  const plans = await dbRows("select id, name, user_id from public.workout_plans");
  const planItems = await dbRows("select e.name, pe.position, pe.planned_sets from public.workout_plan_exercises pe join public.exercises e on e.id = pe.exercise_id order by pe.position");
  check("A ficha está no banco, do usuário certo, uma vez só", plans.length === 1 && plans[0].user_id === userA, JSON.stringify(plans.map((x) => x.name)));
  check("Os exercícios foram gravados NA ORDEM escolhida (a reordenação vale)", planItems.map((r) => r.name).join("|") === "Remada unilateral|Supino reto", JSON.stringify(planItems));
  check("A ficha aparece na lista para começar o treino", (await pageA.getByRole("button", { name: /^Iniciar Treino A/ }).count()) === 1);

  // editar: renomear; os exercícios são substituídos atomicamente
  await pageA.getByRole("button", { name: /^Editar Treino A/ }).click();
  await pageA.waitForSelector("text=Editar ficha");
  await pageA.fill("input[placeholder^='Ex.: Treino A']", "Treino A — Peito e costas");
  await pageA.getByRole("button", { name: "Salvar alterações" }).click();
  await toast(pageA, "Ficha atualizada").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.waitForTimeout(500);
  const renamed = await dbRows("select name from public.workout_plans");
  check("Editar a ficha atualiza a MESMA ficha (sem duplicar)", renamed.length === 1 && renamed[0].name === "Treino A — Peito e costas", JSON.stringify(renamed));

  // treinar: o rascunho vive no aparelho; recarregar no meio não perde nada
  await pageA.getByRole("button", { name: /^Iniciar Treino A/ }).click();
  await pageA.waitForURL("**/treino/sessao");
  await pageA.waitForSelector("text=séries concluídas");
  await pageA.getByRole("button", { name: /^Concluir série 1 de/ }).first().click();
  await pageA.waitForSelector("[role=timer][aria-label='Descanso entre séries']");
  check("Rascunho do treino fica só no aparelho até finalizar (nada no banco ainda)", (await dbRows("select count(*)::int as n from public.workout_sessions"))[0].n === 0 && (await pageA.evaluate(() => localStorage.getItem("tars-draft-v1"))) !== null);
  const progress = () => pageA.locator("text=/\\d+ de \\d+ séries concluídas/").first().innerText().then(norm);
  const before = await progress();
  await pageA.reload();
  await splashDone(pageA);
  await pageA.waitForSelector("text=séries concluídas");
  check("Treino em andamento é recuperado depois de recarregar", before === (await progress()) && before.startsWith("1 de"), before);
  await pageA.getByRole("button", { name: "Finalizar treino" }).click();
  await pageA.getByRole("alertdialog").waitFor();
  await pageA.getByRole("alertdialog").getByRole("button", { name: "Finalizar treino" }).dblclick().catch(() => {});
  await pageA.waitForURL("**/treino", { timeout: 10000 });
  await pageA.waitForTimeout(800);
  const done = await dbRows("select s.name_snapshot, count(distinct se.id)::int as exs, count(es.id)::int as sets from public.workout_sessions s left join public.session_exercises se on se.session_id = s.id left join public.exercise_sets es on es.session_exercise_id = se.id group by s.id, s.name_snapshot");
  check("Finalizar (toque duplo) grava UMA sessão, com a cópia dos nomes e só a série concluída", done.length === 1 && done[0].name_snapshot === "Treino A — Peito e costas" && done[0].sets === 1, JSON.stringify(done));
  check("Depois de finalizar o rascunho local é apagado", (await pageA.evaluate(() => JSON.parse(localStorage.getItem("tars-draft-v1") ?? "{}")?.state?.draft ?? null)) === null);

  // renomear exercício e a ficha NÃO reescreve o treino já feito
  await dbRows("update public.exercises set name = 'Remada (renomeada)' where name = 'Remada unilateral'");
  await pageA.goto("/treino/historico");
  await appReady(pageA);
  check("Treino já feito mantém os nomes de quando foi feito (cópia própria)", (await pageA.getByText("Treino A — Peito e costas").count()) >= 1);

  // arquivar a ficha: some da lista, o histórico fica, dá para restaurar em Configurações
  await pageA.goto("/treino");
  await appReady(pageA);
  await pageA.getByRole("button", { name: /^Editar Treino A/ }).click();
  await pageA.getByRole("button", { name: "Arquivar ficha" }).click();
  await pageA.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
  await toast(pageA, "Ficha arquivada").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.waitForTimeout(500);
  check("Ficha arquivada some da lista para começar treinos", (await pageA.getByRole("button", { name: /^Iniciar Treino A/ }).count()) === 0);
  const archivedRow = await dbRows("select archived_at is not null as archived from public.workout_plans");
  check("Arquivar NÃO apaga: a ficha continua no banco, marcada como arquivada", archivedRow.length === 1 && archivedRow[0].archived === true);
  check("O histórico de treinos continua com a sessão da ficha arquivada", (await dbRows("select count(*)::int as n from public.workout_sessions"))[0].n === 1);

  /* ----- catálogos: categorias, matérias e exercícios (criar, renomear, arquivar, restaurar) ----- */
  await pageA.goto("/configuracoes/catalogos");
  await appReady(pageA);
  check("A ficha arquivada aparece para restaurar", (await pageA.getByRole("button", { name: /^Restaurar ficha Treino A/ }).count()) === 1);
  await pageA.getByRole("button", { name: /^Restaurar ficha Treino A/ }).click();
  await toast(pageA, "Ficha restaurada").waitFor({ timeout: 8000 }).catch(() => {});
  check("Restaurar devolve a ficha (sem a marca de arquivada)", (await dbRows("select archived_at is null as active from public.workout_plans"))[0].active === true);

  await pageA.getByRole("button", { name: "Despesa", exact: true }).click();
  await pageA.waitForSelector("text=Nova categoria");
  await pageA.locator("label:has-text('Nome') input").fill("Pets");
  await pageA.getByRole("button", { name: "Criar categoria" }).click();
  await toast(pageA, "Categoria criada").waitFor({ timeout: 8000 }).catch(() => {});
  // `admin` ignora o RLS: conta só as do usuário A (o usuário B também tem as 10 categorias iniciais dele)
  const categoryCount = async () => (await dbRows("select count(*)::int as n from public.categories where user_id = $1", [userA]))[0].n;
  const afterCreate = await categoryCount();
  check("Categoria nova gravada (11 no total)", afterCreate === 11, String(afterCreate));

  await pageA.getByRole("button", { name: "Despesa", exact: true }).click();
  await pageA.waitForSelector("text=Nova categoria");
  await pageA.locator("label:has-text('Nome') input").fill("pets");
  await pageA.getByRole("button", { name: "Criar categoria" }).click();
  await pageA.waitForTimeout(1200);
  const dupToast = (await pageA.locator("[data-sonner-toast]").allInnerTexts()).map(norm).join(" | ");
  const afterDuplicate = await categoryCount();
  check("Nome de categoria repetido: mensagem clara, nada gravado", /Já existe uma categoria com este nome/.test(dupToast) && afterDuplicate === 11, `${afterDuplicate} | ${dupToast}`);
  await pageA.keyboard.press("Escape");
  await pageA.waitForTimeout(500);

  await pageA.getByRole("button", { name: "Editar categoria Pets" }).click();
  await pageA.locator("label:has-text('Nome') input").fill("Animais");
  await pageA.getByRole("button", { name: "Salvar alterações" }).click();
  await toast(pageA, "Categoria atualizada").waitFor({ timeout: 8000 }).catch(() => {});
  check("Renomear a categoria", (await dbRows("select count(*)::int as n from public.categories where name = 'Animais'"))[0].n === 1);

  await pageA.getByRole("button", { name: "Editar categoria Animais" }).click();
  await pageA.getByRole("button", { name: "Arquivar categoria" }).click();
  await pageA.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
  await toast(pageA, "Categoria arquivada").waitFor({ timeout: 8000 }).catch(() => {});
  check("Categoria arquivada fica no banco", (await dbRows("select archived_at is not null as a from public.categories where name = 'Animais'"))[0].a === true);
  await pageA.getByRole("button", { name: /^Ver arquivados/ }).first().click();
  check("Arquivadas aparecem atrás de 'Ver arquivados'", (await pageA.getByRole("button", { name: "Editar categoria Animais" }).count()) === 1);

  await pageA.goto("/financas");
  await appReady(pageA);
  await pageA.getByRole("button", { name: "Lançamento", exact: false }).first().click();
  await pageA.waitForSelector("#tx-amount");
  check("Categoria arquivada NÃO é oferecida num lançamento novo", (await pageA.getByRole("radio", { name: "Animais" }).count()) === 0 && (await pageA.getByRole("radio", { name: "Alimentação" }).count()) >= 1);
  await pageA.keyboard.press("Escape");

  await pageA.goto("/configuracoes/catalogos");
  await appReady(pageA);
  await pageA.getByRole("button", { name: /^Ver arquivados/ }).first().click();
  await pageA.getByRole("button", { name: "Editar categoria Animais" }).click();
  await pageA.getByRole("button", { name: "Restaurar categoria" }).click();
  await toast(pageA, "Categoria restaurada").waitFor({ timeout: 8000 }).catch(() => {});
  check("Restaurar a categoria", (await dbRows("select archived_at is null as a from public.categories where name = 'Animais'"))[0].a === true);

  await pageA.getByRole("button", { name: "Matéria", exact: true }).click();
  await pageA.waitForSelector("text=Nova matéria");
  await pageA.locator("label:has-text('Nome') input").fill("Direito");
  await pageA.getByRole("button", { name: "Criar matéria" }).click();
  await toast(pageA, "Matéria criada").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.getByRole("button", { name: "Editar matéria Direito" }).click();
  await pageA.getByRole("button", { name: "Arquivar matéria" }).click();
  await pageA.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
  await toast(pageA, "Matéria arquivada").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.goto("/estudos");
  await appReady(pageA);
  check("Matéria arquivada não aparece para iniciar o cronômetro (as ativas sim)", (await pageA.getByRole("button", { name: "Direito" }).count()) === 0 && (await pageA.getByRole("button", { name: "SQL" }).count()) >= 1);

  /* ----- livros: editar, regras de página, editar leitura, excluir com contagem ----- */
  await pageA.goto("/estudos/leitura");
  await appReady(pageA);
  await pageA.getByRole("button", { name: /Livro de teste/ }).first().click();
  await pageA.getByRole("button", { name: "Editar livro" }).click();
  await pageA.waitForSelector("text=Editar livro");
  await pageA.locator("label:has-text('Total de páginas') input").fill("40");
  await pageA.getByRole("button", { name: "Salvar alterações" }).click();
  await pageA.waitForTimeout(1200);
  const pagesToast = (await pageA.locator("[data-sonner-toast]").allInnerTexts()).map(norm).join(" | ");
  check("Reduzir o total abaixo do que já foi lido é recusado, com a mesma mensagem do banco", /O livro já tem leituras até a página 50\./.test(pagesToast), pagesToast);
  await pageA.locator("label:has-text('Total de páginas') input").fill("400");
  await pageA.locator("label:has-text('Título') input").fill("Livro revisado");
  await pageA.getByRole("button", { name: "Salvar alterações" }).click();
  await toast(pageA, "Livro atualizado").waitFor({ timeout: 8000 }).catch(() => {});
  const bookRow = await dbRows("select title, total_pages, status from public.books");
  check("Livro editado (título e total), a situação preservada", bookRow.length === 1 && bookRow[0].title === "Livro revisado" && bookRow[0].total_pages === 400 && bookRow[0].status === "reading", JSON.stringify(bookRow));

  await pageA.getByRole("button", { name: /Livro revisado/ }).first().click();
  await pageA.getByRole("button", { name: /^Editar leitura de/ }).click();
  await pageA.waitForSelector("text=Editar leitura");
  await pageA.locator("label:has-text('Página final') input").fill("90");
  await pageA.getByRole("button", { name: "Salvar alterações" }).click();
  await toast(pageA, "Leitura atualizada").waitFor({ timeout: 8000 }).catch(() => {});
  const edited = await dbRows("select start_page, end_page from public.reading_sessions");
  check("Leitura editada: 30 → 90 (60 páginas, sem duplicar)", edited.length === 1 && edited[0].start_page === 30 && edited[0].end_page === 90, JSON.stringify(edited));

  await pageA.getByRole("button", { name: /Livro revisado/ }).first().click();
  await pageA.getByRole("button", { name: "Excluir livro" }).click();
  const deleteText = norm(await pageA.getByRole("alertdialog").innerText());
  check("Excluir livro avisa quantas leituras serão apagadas", /1 leitura registrada/.test(deleteText), deleteText);
  await pageA.getByRole("alertdialog").getByRole("button", { name: "Excluir livro" }).click();
  await toast(pageA, "Livro excluído").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.waitForTimeout(500);
  check("Excluir o livro apagou as leituras dele (cascata)", (await dbRows("select (select count(*)::int from public.books) as b, (select count(*)::int from public.reading_sessions) as r"))[0].b === 0 && (await dbRows("select count(*)::int as n from public.reading_sessions"))[0].n === 0);

  /* ===== assistente (xAI falsa: API compatível com a OpenAI) ===== */
  await pageA.goto("/financas");
  await appReady(pageA);
  check("Com IA configurada, o botão 'Por texto' aparece em Finanças", (await pageA.getByRole("button", { name: "Por texto" }).count()) === 1);
  check("Com IA configurada, o cabeçalho mostra o assistente", (await pageA.locator("a[aria-label='Abrir assistente']").count()) === 1);

  await pageA.goto("/assistente");
  await appReady(pageA);
  const privacy = pageA.getByRole("region", { name: "Aviso de privacidade" });
  await privacy.waitFor({ timeout: 10000 });
  const privacyText = norm(await privacy.innerText());
  check("Primeiro uso: aviso de privacidade diz para QUEM os dados vão e o que NÃO vai", /xAI \(Grok\)/.test(privacyText) && /Descrições dos seus lançamentos não são enviadas/.test(privacyText), privacyText.slice(0, 120));
  const composer = pageA.getByLabel("Mensagem para o assistente");
  check("Sem aceitar o aviso, o campo de mensagem fica bloqueado e nada é enviado", (await composer.isDisabled()) && xai.received.length === 0);
  await pageA.getByRole("button", { name: "Entendi, usar o assistente" }).click();
  await pageA.waitForFunction(() => !document.querySelector("input[aria-label='Mensagem para o assistente']")?.disabled);
  check("Aceitar libera o campo e guarda o consentimento só neste aparelho", (await pageA.evaluate(() => localStorage.getItem("tars-ai-consent-v1"))) === "1");

  const usageNow = async () => (await dbRows("select coalesce(sum(requests), 0)::int as requests, coalesce(sum(tokens), 0)::int as tokens from public.ai_usage where user_id = $1", [userA]))[0];
  const send = async (text) => {
    await composer.fill(text);
    await pageA.getByRole("button", { name: "Enviar" }).click();
  };

  // pergunta sobre os dados: o "modelo" chama a ferramenta e redige a partir do resultado REAL do banco
  await send("Quanto gastei este mês?");
  await pageA.getByText(/despesas R\$\s[\d.,]+ e resultado/).waitFor({ timeout: 15000 });
  const answered = norm(await pageA.locator("main").innerText());
  check("Pergunta sobre os dados: resposta com os valores reais e o período consultado", /Em .* de \d{4}: despesas R\$\s[\d.,]+ e resultado R\$\s[\d.,]+\./.test(answered) && /Período: .* de \d{4}/.test(answered), answered.slice(-160));
  check("O app chamou o provedor com a chave configurada (cabeçalho Authorization)", xai.received.length === 2 && xai.received.every((r) => r.headers.authorization === `Bearer ${xai.apiKey}`), String(xai.received.length));
  const sentToModel = JSON.stringify(xai.received.map((r) => r.body));
  check("O que foi enviado ao modelo NÃO inclui descrições de lançamentos nem e-mail", !/Outback teste|Toque duplo|Sem rede|pedro@tars/.test(sentToModel));
  check("O prompt traz a data de hoje do servidor e só as ferramentas permitidas", /\d{4}-\d{2}-\d{2}/.test(xai.received[0].body.messages[0].content) && xai.received[0].body.tools.map((t) => t.function.name).sort().join() === "get_financial_summary,get_reading_summary,get_study_summary,get_workout_summary,propose_transaction");
  const afterQuestion = await usageNow();
  check("O uso foi contado no banco (1 pergunta, 1280 tokens: 2 chamadas)", afterQuestion.requests === 1 && afterQuestion.tokens === 1280, JSON.stringify(afterQuestion));

  // lançamento por texto: o assistente PROPÕE, nada é salvo antes de confirmar
  const aiTx = () => dbRows("select id, amount_cents::int as cents, source, occurred_on::text as day from public.transactions where source = 'ai'");
  await send("Gastei 42 reais no Outback ontem");
  await pageA.getByRole("button", { name: "Confirmar lançamento" }).waitFor({ timeout: 15000 });
  const card = norm(await pageA.locator("main").innerText());
  check("A proposta mostra valor, categoria e que nada foi salvo ainda", /R\$ 42,00/.test(card) && /Alimentação/.test(card) && /nada foi salvo ainda/.test(card));
  check("Antes de confirmar NADA foi gravado", (await aiTx()).length === 0);
  await pageA.getByRole("button", { name: "Confirmar lançamento" }).dblclick().catch(() => {});
  await toast(pageA, "Despesa de R$ 42,00 salva").waitFor({ timeout: 8000 }).catch(() => {});
  await pageA.waitForTimeout(600);
  const saved = await aiTx();
  check("Confirmar (toque duplo) grava UM lançamento, de origem 'ai', com o valor certo", saved.length === 1 && saved[0].cents === 4200 && saved[0].source === "ai", JSON.stringify(saved));
  check("O id do lançamento é o da proposta (UUID gerado pelo servidor), por isso repetir não duplica", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(saved[0]?.id ?? ""));
  const dayInSaoPaulo = (offsetDays) => {
    const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // YYYY-MM-DD
    const d = new Date(`${base}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  check("'Ontem' foi resolvido a partir da data de hoje do servidor (fuso de São Paulo)", saved[0]?.day === dayInSaoPaulo(-1), `${saved[0]?.day} esperado ${dayInSaoPaulo(-1)}`);

  await send("VARIOS lançamentos de uma vez");
  await pageA.getByText(/mais de um lançamento/).waitFor({ timeout: 15000 });
  check("Vários lançamentos numa mensagem: o app pede um de cada vez (sem proposta)", (await pageA.getByRole("button", { name: "Confirmar lançamento" }).count()) === 0 && (await aiTx()).length === 1);

  // falha do provedor: mensagem clara e caminho manual
  await send("FALHAR agora");
  await pageA.getByRole("button", { name: "Lançar manualmente" }).waitFor({ timeout: 15000 });
  const failure = norm(await pageA.locator("main").innerText());
  check("Provedor com erro: mensagem clara, sem detalhes técnicos", /indisponível|Use o formulário/.test(failure) && !/500|erro interno simulado|xai-chave/.test(failure));
  await pageA.getByRole("button", { name: "Lançar manualmente" }).click();
  await pageA.waitForSelector("#tx-amount");
  check("'Lançar manualmente' abre o formulário (o app não depende da IA)", true);
  await pageA.keyboard.press("Escape");
  await pageA.waitForTimeout(500);
  const afterFailure = await usageNow();
  check("A tentativa que falhou também conta no limite (evita tempestade de novas tentativas)", afterFailure.requests >= 4, JSON.stringify(afterFailure));

  // limite diário: ao atingir, o provedor NÃO é chamado
  await dbRows("update public.ai_usage set requests = 60 where user_id = $1 and day = (now() at time zone 'America/Sao_Paulo')::date", [userA]);
  const callsBefore = xai.received.length;
  await send("Quanto gastei este mês?");
  await pageA.getByText(/limite diário/).waitFor({ timeout: 15000 });
  check("Limite diário atingido: mensagem clara e o provedor NÃO foi chamado", xai.received.length === callsBefore);
  await dbRows("update public.ai_usage set requests = 1 where user_id = $1 and day = (now() at time zone 'America/Sao_Paulo')::date", [userA]);

  // "Por texto" em Finanças usa o mesmo assistente
  await pageA.goto("/financas");
  await appReady(pageA);
  await pageA.getByRole("button", { name: "Por texto" }).click();
  await pageA.fill("textarea", "Gastei 18,50 de uber");
  await pageA.getByRole("button", { name: "Interpretar" }).click();
  await pageA.waitForSelector("text=Confirmar lançamento", { timeout: 15000 });
  const prefilled = norm(await pageA.inputValue("#tx-amount"));
  check("'Por texto': a proposta chega pré-preenchida para revisar (R$ 18,50)", prefilled === "R$ 18,50", prefilled);
  await pageA.keyboard.press("Escape");
  await pageA.waitForTimeout(500);

  /* ===== segurança do transporte: cabeçalhos e CSP (o build de produção os aplica) ===== */
  {
    const res = await ctxA.request.get("/login");
    const h = res.headers();
    const csp = h["content-security-policy"] ?? "";
    check("CSP presente: só o próprio servidor, sem eval, sem frames, sem <object>", /default-src 'self'/.test(csp) && /connect-src 'self'(;|$)/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && !/unsafe-eval/.test(csp), csp.slice(0, 90));
    check("Cabeçalhos de segurança básicos (nosniff, DENY, referrer, COOP)", h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY" && h["referrer-policy"] === "strict-origin-when-cross-origin" && h["cross-origin-opener-policy"] === "same-origin");
    check("O servidor não se anuncia (sem X-Powered-By)", h["x-powered-by"] === undefined);
    const api = await ctxA.request.get("/api/snapshot");
    check("As respostas de dados também levam os cabeçalhos de segurança", api.headers()["x-content-type-options"] === "nosniff" && /private/.test(api.headers()["cache-control"] ?? ""));
    const sw = await ctxA.request.get("/sw.js");
    check("O service worker nunca fica em cache e tem CSP própria", /no-store/.test(sw.headers()["cache-control"] ?? "") && /script-src 'self'/.test(sw.headers()["content-security-policy"] ?? "") && /javascript/.test(sw.headers()["content-type"] ?? ""));
    const robots = await (await ctxA.request.get("/robots.txt")).text();
    check("robots.txt proíbe indexação (app pessoal)", /Disallow:\s*\//.test(robots));
    const html = await (await ctxA.request.get("/login")).text();
    check("As páginas pedem noindex", /<meta name="robots" content="noindex/.test(html));
  }

  /* ===== exportação, saúde e keep-alive ===== */
  {
    const exported = await ctxA.request.get("/api/export");
    const disposition = exported.headers()["content-disposition"] ?? "";
    const file = await exported.json();
    check("Exportar: baixa um .json com a data no nome", exported.status() === 200 && /attachment; filename="tars-backup-\d{4}-\d{2}-\d{2}\.json"/.test(disposition), disposition);
    check("Exportar: formato versionado e dados do usuário A (inclusive categorias arquivadas)", file.app === "tars" && file.version === 1 && file.data.transactions.length >= 3 && file.data.categories.some((c) => c.archived !== true) && file.data.books !== undefined, `${file.data.transactions.length} lançamentos`);
    check("Exportar: não vaza e-mail, id de usuário nem sessão", !/pedro@tars|"user_id"|userId|access_token/i.test(JSON.stringify(file)));
    check("Exportar: nunca é cacheável", /no-store/.test(exported.headers()["cache-control"] ?? ""));
    const anon = await (await newContext()).request.get("/api/export");
    check("Exportar sem sessão -> 401", anon.status() === 401, String(anon.status()));

    const anonCtx = await newContext();
    const publicHealth = await anonCtx.request.get("/api/health");
    const publicBody = await publicHealth.json();
    check("Health público: só o status, sem detalhes", publicHealth.status() === 200 && JSON.stringify(publicBody) === '{"status":"ok"}', JSON.stringify(publicBody));
    const privateBody = await (await ctxA.request.get("/api/health")).json();
    check("Health logado: latência do banco e IA ligada", privateBody.status === "ok" && privateBody.database.ok === true && privateBody.ai === "configured", JSON.stringify(privateBody));
    fake.setRestDown(true);
    const degraded = await anonCtx.request.get("/api/health");
    check("Health com o banco fora do ar: 503 'degraded' (sem travar)", degraded.status() === 503 && (await degraded.json()).status === "degraded", String(degraded.status()));
    fake.setRestDown(false);

    const secret = "segredo-do-cron-com-16-ou-mais";
    const noAuth = await anonCtx.request.get("/api/cron/keep-alive");
    const wrong = await anonCtx.request.get("/api/cron/keep-alive", { headers: { authorization: "Bearer errado" } });
    const right = await anonCtx.request.get("/api/cron/keep-alive", { headers: { authorization: `Bearer ${secret}` } });
    check("Keep-alive: sem segredo ou com segredo errado -> 401", noAuth.status() === 401 && wrong.status() === 401, `${noAuth.status()}/${wrong.status()}`);
    check("Keep-alive com o segredo certo -> 200 e toca o banco", right.status() === 200 && (await right.json()).ok === true);
    // Sem sessão, qualquer caminho que não seja público vai ao login, existindo ou não (não revela quais rotas existem).
    const missing = await (await newContext()).request.get("/pagina-que-nao-existe", { maxRedirects: 0 });
    const existing = await (await newContext()).request.get("/financas", { maxRedirects: 0 });
    check("Sem sessão, rota inexistente e rota real respondem igual: redirecionam ao login", [307, 308].includes(missing.status()) && missing.status() === existing.status() && (missing.headers()["location"] ?? "").endsWith("/login"), `${missing.status()} ${missing.headers()["location"]}`);
    await anonCtx.close();
  }

  /* ===== PWA: service worker, tela offline e aviso de sem conexão ===== */
  {
    const ctx = await newContext();
    const page = await ctx.newPage();
    watch(page);
    await login(page, "outro@tars.example", "outra-senha-forte-1");
    await page.waitForURL("**/inicio");
    await appReady(page);

    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, { timeout: 15000 });
    check("O service worker foi registrado e ativado", true);

    await page.goto("/404-qualquer");
    check("Rota inexistente logado mostra a página 404 em português", (await page.getByText("Página não encontrada").count()) === 1);

    await page.goto("/financas");
    await appReady(page);
    const cacheReport = await page.evaluate(async () => {
      const out = {};
      for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
      return out;
    });
    const cachedPaths = Object.values(cacheReport).flat();
    check("O cache tem a página /offline e arquivos estáticos", cachedPaths.includes("/offline") && cachedPaths.some((p) => p.startsWith("/_next/static/")), `${cachedPaths.length} itens`);
    check("O cache NÃO tem telas do app, nem /api, nem dados (financeiros ou de IA)", cachedPaths.every((p) => p === "/offline" || p.startsWith("/_next/static/")), cachedPaths.filter((p) => !p.startsWith("/_next/static/")).join(","));

    // aviso de sem conexão com a tela já aberta + ação que tenta salvar
    await page.getByRole("button", { name: "Lançamento", exact: false }).first().click();
    await page.waitForSelector("#tx-amount");
    await page.fill("#tx-amount", "700");
    await page.fill("#tx-description", "Offline não salva");
    await ctx.setOffline(true);
    await page.getByText("Sem conexão. Para registrar algo é preciso internet").waitFor({ timeout: 8000 }).then(
      () => check("Sem rede: o app avisa que registrar exige internet", true),
      () => check("Sem rede: o app avisa que registrar exige internet", false),
    );
    await page.getByRole("button", { name: "Salvar lançamento" }).click();
    await page.waitForTimeout(2500);
    const offlineToast = (await page.locator("[data-sonner-toast]").allInnerTexts()).map(norm).join(" | ");
    check("Sem rede: salvar mostra erro e NUNCA 'salva'", /Nada foi salvo|Sem conexão/.test(offlineToast) && !/salva/.test(offlineToast.replace(/Nada foi salvo/g, "")), offlineToast);
    check("Sem rede: nada foi gravado no banco", (await dbRows("select count(*)::int as n from public.transactions where description = 'Offline não salva'"))[0].n === 0);

    // abrir uma tela sem rede cai na página /offline (vinda do service worker)
    await page.goto("/treino").catch(() => undefined);
    await page.getByText("Você está sem conexão").waitFor({ timeout: 8000 }).then(
      () => check("Sem rede, abrir uma tela mostra a página /offline", true),
      () => check("Sem rede, abrir uma tela mostra a página /offline", false),
    );
    await ctx.setOffline(false);
    await ctx.close();
  }

  /* ----- configurações ----- */
  await pageA.goto("/configuracoes");
  await appReady(pageA);
  const settingsText = norm(await pageA.locator("main").first().innerText());
  check("Configurações mostram o e-mail da conta real", settingsText.includes("pedro@tars.example"));
  check("Configurações não oferecem 'Resetar dados de demonstração'", !settingsText.includes("Resetar dados de demonstração"));
  check("Exportar dados está habilitado no modo real", (await pageA.getByRole("link", { name: /Exportar dados/ }).count()) === 1);

  /* ===== 8. isolamento: o usuário B não enxerga nada de A ===== */
  {
    const ctx = await newContext();
    const page = await ctx.newPage();
    watch(page);
    await login(page, "outro@tars.example", "outra-senha-forte-1");
    await page.waitForURL("**/inicio");
    await appReady(page);
    const snap = await (await ctx.request.get("/api/snapshot")).json();
    const leaked = JSON.stringify(snap).includes(userA);
    check("B: o snapshot não contém NADA do usuário A", !leaked && snap.data.transactions.length === 0 && snap.data.books.length === 0 && snap.data.subjects.length === 0);
    await page.goto("/financas");
    await appReady(page);
    check("B: a tela de finanças está vazia (sem os lançamentos de A)", (await page.getByText("Outback teste").count()) === 0);
    const hacked = await ctx.request.post("/api/snapshot", { data: {} });
    check("POST em /api/snapshot não é aceito", hacked.status() === 405, String(hacked.status()));
    await ctx.close();
  }

  /* ===== 9. sair ===== */
  await pageA.goto("/configuracoes");
  await appReady(pageA);
  await pageA.getByRole("button", { name: "Sair" }).click();
  // Duas navegações competem (a recarga do app e o refresh automático do Next depois que a action apaga os
  // cookies); o que importa é onde a pessoa termina, não qual delas ganha.
  await pageA.waitForFunction(() => location.pathname === "/login", null, { timeout: 15000 });
  await splashDone(pageA);
  check("Sair leva ao /login", pageA.url().endsWith("/login"));
  check("Os cookies de sessão foram apagados", (await ctxA.cookies()).filter((c) => c.name.startsWith("sb-") && c.value).length === 0);
  const afterLogout = await ctxA.request.get("/api/snapshot");
  check("Depois de sair, a API volta a responder 401", afterLogout.status() === 401, String(afterLogout.status()));
  await pageA.goto("/inicio").catch(() => undefined); // o redirecionamento imediato aborta o goto; o destino é o que importa
  await pageA.waitForFunction(() => location.pathname === "/login", null, { timeout: 15000 });
  check("Depois de sair, o app volta a exigir login", pageA.url().endsWith("/login"));
  check("Dados locais do usuário foram limpos (rascunho de treino e consentimento da IA)", (await pageA.evaluate(() => [localStorage.getItem("tars-draft-v1"), localStorage.getItem("tars-ai-consent-v1")])).every((v) => v === null));

  /* ===== 10. recuperação de senha ===== */
  {
    const ctx = await newContext();
    const page = await ctx.newPage();
    watch(page);
    await page.goto("/esqueci-senha");
    await splashDone(page);
    await page.fill("input[name=email]", "naoexiste@tars.example");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await page.waitForSelector("form [role=status]");
    const unknownMsg = norm(await page.locator("form [role=status]").innerText());
    await page.fill("input[name=email]", "pedro@tars.example");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await page.waitForTimeout(800);
    const knownMsg = norm(await page.locator("form [role=status]").innerText());
    check("Pedir redefinição: mesma resposta com e sem conta (não revela e-mails)", unknownMsg === knownMsg, unknownMsg);
    check("O e-mail só foi 'enviado' para a conta que existe", fake.mails.length === 1 && fake.mails[0].to === "pedro@tars.example");

    const token = fake.mails[0].tokenHash;
    await page.goto("/redefinir-senha");
    await splashDone(page);
    check("Link de redefinição sem token é recusado", (await page.getByText("Este link de redefinição não é válido").count()) === 1);

    // Um "scanner de e-mail" (Outlook, antivírus) abre os links ANTES da pessoa. Se abrir consumisse o token de uso
    // único, a redefinição falharia depois. Aqui o scanner faz GET no link, duas vezes, e a pessoa ainda precisa conseguir.
    const link = `/redefinir-senha?token_hash=${token}&type=recovery`;
    const scanner = await newContext();
    const scan = [await scanner.request.get(link), await scanner.request.get(link)];
    check("Scanner de e-mail abre o link (2x) sem erro", scan.every((r) => r.status() === 200), scan.map((r) => r.status()).join(","));
    await scanner.close();

    await page.goto(link);
    await splashDone(page);
    await page.waitForSelector("input[name=password]");

    await page.fill("input[name=password]", "curta");
    await page.fill("input[name=confirm]", "curta");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await page.waitForSelector("form [role=alert]");
    check("Senha curta é recusada com a regra explícita", (await page.locator("form [role=alert]").first().innerText()).includes("pelo menos 10"));

    await page.fill("input[name=password]", "nova-senha-bem-longa");
    await page.fill("input[name=confirm]", "nova-senha-diferente");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await page.waitForSelector("text=As senhas não são iguais.");
    check("Confirmação diferente é recusada", true);

    await page.fill("input[name=password]", "nova-senha-bem-longa");
    await page.fill("input[name=confirm]", "nova-senha-bem-longa");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await page.waitForURL("**/inicio", { timeout: 15000 });
    check("Nova senha salva e já entra logado, mesmo com o link aberto antes por um scanner", page.url().endsWith("/inicio"));

    const reuse = await (await newContext()).newPage();
    await reuse.goto(`/redefinir-senha?token_hash=${token}&type=recovery`);
    await splashDone(reuse);
    await reuse.waitForSelector("input[name=password]");
    await reuse.fill("input[name=password]", "outra-senha-bem-longa");
    await reuse.fill("input[name=confirm]", "outra-senha-bem-longa");
    await reuse.getByRole("button", { name: "Salvar nova senha" }).click();
    await reuse.waitForSelector("form [role=alert]");
    check("O mesmo link não funciona uma segunda vez", (await reuse.locator("form [role=alert]").first().innerText()).includes("expirou ou já foi usado"));

    const oldLogin = await (await newContext()).newPage();
    await login(oldLogin, "pedro@tars.example", PASSWORD);
    await oldLogin.waitForSelector("form [role=alert]");
    check("A senha antiga deixou de funcionar", (await oldLogin.locator("form [role=alert]").first().innerText()).includes("incorretos"));
    await login(oldLogin, "pedro@tars.example", "nova-senha-bem-longa");
    await oldLogin.waitForURL("**/inicio", { timeout: 15000 });
    check("A nova senha funciona", true);
    await ctx.close();
  }

  /* ===== deploy SEM IA: o app inteiro continua funcionando ===== */
  {
    const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
    serverNoAi = spawn(process.execPath, [nextBin, "start", "-p", String(NOAI_PORT), "-H", "127.0.0.1"], {
      cwd: ROOT,
      env: { ...appEnv, AI_PROVIDER: "none", AI_MODEL: "", AI_API_KEY: "", AI_BASE_URL: "" },
      stdio: "pipe",
    });
    for (let i = 0; i < 60; i++) {
      if (await fetch(`http://127.0.0.1:${NOAI_PORT}/login`).then((r) => r.ok, () => false)) break;
      if (i === 59) throw new Error("O servidor sem IA não subiu");
      await new Promise((r) => setTimeout(r, 500));
    }
    const ctx = await browser.newContext({ ...contextOptions, baseURL: `http://127.0.0.1:${NOAI_PORT}` });
    const page = await ctx.newPage();
    watch(page);
    await login(page, "outro@tars.example", "outra-senha-forte-1");
    await page.waitForURL("**/inicio");
    await appReady(page);
    check("Sem IA: o cabeçalho não mostra o botão do assistente", (await page.locator("a[aria-label='Abrir assistente']").count()) === 0);
    await page.goto("/financas");
    await appReady(page);
    check("Sem IA: 'Por texto' some, mas o lançamento manual continua", (await page.getByRole("button", { name: "Por texto" }).count()) === 0 && (await page.getByRole("button", { name: "Lançamento", exact: false }).count()) >= 1);
    await page.getByRole("button", { name: "Lançamento", exact: false }).first().click();
    await page.waitForSelector("#tx-amount");
    await page.fill("#tx-amount", "1500");
    await page.fill("#tx-description", "Sem IA funciona");
    await page.getByRole("button", { name: "Salvar lançamento" }).click();
    await toast(page, "Despesa de R$ 15,00 salva").waitFor({ timeout: 8000 }).then(
      () => check("Sem IA: salvar um lançamento manual funciona normalmente", true),
      () => check("Sem IA: salvar um lançamento manual funciona normalmente", false),
    );
    await page.goto("/assistente");
    await appReady(page);
    check("Sem IA: abrir /assistente explica que não está configurado (e o campo fica bloqueado)", (await page.getByText("O assistente não está configurado neste app").count()) === 1 && (await page.getByLabel("Mensagem para o assistente").isDisabled()));
    const api = await ctx.request.post("/api/assistant", { data: { message: "oi" }, headers: { origin: `http://127.0.0.1:${NOAI_PORT}` } });
    check("Sem IA: a API responde 503 'ai_disabled' (sem tentar o provedor)", api.status() === 503 && (await api.json()).error === "ai_disabled", String(api.status()));
    const snapshot = await (await ctx.request.get("/api/snapshot")).json();
    check("Sem IA: o snapshot informa que a IA está desligada", snapshot.capabilities.ai === false && snapshot.capabilities.aiProvider === null);
    await ctx.close();
  }

  /* ===== relatório ===== */
  // Ruído conhecido e inofensivo: "Failed to load resource" (respostas 401 esperadas nos testes de acesso) e o aviso de
  // fonte pré-carregada, que o Chrome emite porque a abertura animada (splash, ~3 s) deixa o texto oculto no início.
  const relevant = problems.filter((p) => !/401|Failed to load resource|was preloaded using link preload but not used/.test(p));
  console.log("\nProblemas de console:" + (relevant.length ? "\n" + [...new Set(relevant)].join("\n") : " nenhum"));
  await browser.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
  await shutdown(failed ? 1 : 0);
} catch (error) {
  console.error(error);
  await shutdown(1);
}
