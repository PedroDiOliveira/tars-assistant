/**
 * Teclado virtual x formulários: com o teclado aberto, o sheet (e a barra de baixo) tem de ficar ACIMA dele, e o
 * campo em foco tem de aparecer inteiro, sem ficar atrás do botão de salvar.
 *
 *   npm run test:e2e:keyboard                      (compila o app em modo demo numa pasta própria e sobe sozinho)
 *   BASE=http://localhost:3000 npm run test:e2e:keyboard   (usa um servidor em modo demo que já esteja rodando)
 *
 * O Chromium sem tela não abre teclado de verdade, então ele é SIMULADO do jeito que o navegador do celular o
 * expõe: `window.visualViewport` fica menor que a janela (a janela de layout NÃO muda, como no iOS e no Chrome do
 * Android) e dispara `resize`. Isso valida a lógica e o layout; não substitui um teste em aparelho físico.
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "e2e", "artifacts");
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.env.KB_APP_PORT || 3400);
const EXTERNAL = Boolean(process.env.BASE);
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`;
const DIST = ".next-kb";
const VIEW = { width: 390, height: 844 };
const KEYBOARD = 336; // teclado + barra de sugestões de um iPhone em pé
const TOL = 1.5;

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};

let server;
async function shutdown(code) {
  try {
    server?.kill("SIGKILL");
  } catch {}
  process.exit(code);
}

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });

try {
  if (!EXTERNAL) {
    if (!(await portFree(PORT))) {
      console.error(`A porta ${PORT} já está em uso. Libere-a, defina KB_APP_PORT ou use BASE=<url de um servidor demo>.`);
      process.exit(1);
    }
    const env = { ...process.env, NEXT_DIST_DIR: DIST, NEXT_PUBLIC_APP_MODE: "demo" };
    console.log("Compilando o app em modo demo (pasta separada, não mexe no servidor de desenvolvimento)…");
    const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, env, encoding: "utf8" });
    if (build.status !== 0) {
      console.error(build.stdout?.slice(-2000), build.stderr?.slice(-2000));
      throw new Error("O build demo falhou");
    }
    const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
    server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: ROOT, env, stdio: "pipe" });
    let log = "";
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    for (let i = 0; i < 60; i++) {
      if (await fetch(`${BASE}/inicio`).then((r) => r.ok, () => false)) break;
      if (i === 59) throw new Error("O servidor não subiu:\n" + log.slice(-1500));
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    baseURL: BASE,
  });

  // `visualViewport` simulado: só a parte visível encolhe (e, no iOS, pode rolar: `offsetTop`); a janela de layout
  // (`innerHeight`) continua do tamanho da tela inteira.
  await context.addInitScript(() => {
    const listeners = { resize: new Set(), scroll: new Set() };
    const vv = {
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      height: window.innerHeight,
      get width() {
        return window.innerWidth;
      },
      addEventListener(type, fn) {
        listeners[type]?.add(fn);
      },
      removeEventListener(type, fn) {
        listeners[type]?.delete(fn);
      },
      dispatchEvent() {
        return true;
      },
    };
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    window.__setKeyboard = (px, pan = 0) => {
      vv.height = window.innerHeight - px;
      vv.offsetTop = px > 0 ? pan : 0;
      for (const fn of [...listeners.scroll]) fn(new Event("scroll"));
      for (const fn of [...listeners.resize]) fn(new Event("resize"));
      // Retângulo cinza só para os screenshots: é onde o teclado estaria.
      let box = document.getElementById("__kb");
      if (!box) {
        box = document.createElement("div");
        box.id = "__kb";
        box.textContent = "TECLADO";
        box.style.cssText =
          "position:fixed;left:0;right:0;z-index:2147483647;pointer-events:none;background:#9aa0a6;color:#fff;font:600 18px system-ui;display:flex;align-items:center;justify-content:center";
        document.body.appendChild(box);
      }
      box.style.height = px + "px";
      box.style.bottom = -(px > 0 ? pan : 0) + "px";
      box.style.display = px > 0 ? "flex" : "none";
    };
  });

  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[error] ${m.text().slice(0, 200)}`);
  });

  const appReady = async (url) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("main", { timeout: 15000 });
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 15000 });
    await page.waitForSelector(".launch-screen", { state: "detached", timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 15000 });
    await page.waitForTimeout(300);
  };

  const setKeyboard = async (px, pan = 0) => {
    await page.evaluate(([p, o]) => window.__setKeyboard(p, o), [px, pan]);
    await page.waitForTimeout(450);
  };

  /** Posição de tudo que importa, em coordenadas da janela de layout. */
  const measure = () =>
    page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right };
      };
      const vv = window.visualViewport;
      const sheet = document.querySelector('[data-slot="drawer-content"]');
      const active = document.activeElement;
      return {
        inner: window.innerHeight,
        visTop: vv.offsetTop,
        visBottom: vv.offsetTop + vv.height,
        sheet: rect(sheet),
        footer: rect(sheet?.querySelector(".sticky")),
        scroller: rect(sheet?.querySelector(".overflow-y-auto")),
        active: rect(active),
        activeTag: active?.tagName ?? null,
      };
    });

  const FIELD = '[data-slot="drawer-content"] :is(input:not([type=hidden]):not([type=checkbox]), textarea)';

  const sheets = [
    { name: "Novo lançamento", url: "/financas", open: () => page.getByRole("button", { name: "Lançamento" }).first().click() },
    { name: "Lançar por texto", url: "/financas", open: () => page.getByRole("button", { name: "Por texto" }).click() },
    { name: "Nova ficha de treino", url: "/treino", open: () => page.getByRole("button", { name: "Nova ficha" }).click() },
    { name: "Meta de treinos", url: "/configuracoes", open: () => page.getByRole("button", { name: /Treinos por semana/ }).click() },
    { name: "Nova categoria", url: "/configuracoes/catalogos", open: () => page.getByRole("button", { name: "Despesa" }).first().click() },
    { name: "Estudo manual", url: "/estudos", open: () => page.getByRole("button", { name: "Manual" }).click() },
  ];

  async function runSheet(scenario, pan = 0) {
    const label = pan ? `${scenario.name} (teclado com rolagem do iOS)` : scenario.name;
    await appReady(scenario.url);
    await scenario.open();
    await page.waitForSelector('[data-slot="drawer-content"]');
    await page.waitForTimeout(700); // animação de abertura do sheet
    const field = page.locator(FIELD).last();
    await field.focus();
    await setKeyboard(KEYBOARD, pan);
    const m = await measure();
    const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await page.screenshot({ path: path.join(OUT, `kb-${slug}${pan ? "-pan" : ""}.png`) });

    check(
      `${label}: o sheet termina acima do teclado`,
      m.sheet && Math.abs(m.sheet.bottom - m.visBottom) <= TOL,
      `sheet.bottom=${m.sheet?.bottom.toFixed(0)} área visível termina em ${m.visBottom.toFixed(0)}`,
    );
    check(
      `${label}: o sheet cabe na área visível (topo não sai da tela)`,
      m.sheet && m.sheet.top >= m.visTop - TOL,
      `sheet.top=${m.sheet?.top.toFixed(0)} topo visível=${m.visTop.toFixed(0)}`,
    );
    const limit = m.footer ? m.footer.top : m.scroller?.bottom ?? m.visBottom;
    check(
      `${label}: o campo em foco aparece inteiro, acima do botão de salvar`,
      m.active && m.scroller && m.active.top >= m.scroller.top - TOL && m.active.bottom <= limit + TOL,
      `campo ${m.active?.top.toFixed(0)}–${m.active?.bottom.toFixed(0)}, área útil ${m.scroller?.top.toFixed(0)}–${limit.toFixed(0)}`,
    );
    if (m.footer) {
      check(
        `${label}: o botão de salvar fica visível`,
        m.footer.bottom <= m.visBottom + TOL && m.footer.top >= m.visTop,
        `rodapé ${m.footer.top.toFixed(0)}–${m.footer.bottom.toFixed(0)}`,
      );
    }

    await field.blur();
    await setKeyboard(0);
    const after = await measure();
    check(
      `${label}: sem teclado, o sheet volta para o rodapé da tela`,
      after.sheet && Math.abs(after.sheet.bottom - after.inner) <= TOL,
      `sheet.bottom=${after.sheet?.bottom.toFixed(0)} tela=${after.inner}`,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  for (const scenario of sheets) await runSheet(scenario);
  await runSheet(sheets[0], 40);
  await runSheet(sheets[2], 40);

  // ---------- assistente: o campo de mensagem fica numa barra fixa embaixo ----------
  await appReady("/assistente");
  const composer = page.getByLabel("Mensagem para o assistente");
  await composer.focus();
  await setKeyboard(KEYBOARD);
  const box = await composer.boundingBox();
  const vis = await page.evaluate(() => window.visualViewport.offsetTop + window.visualViewport.height);
  await page.screenshot({ path: path.join(OUT, "kb-assistente.png") });
  check("Assistente: o campo de mensagem fica acima do teclado", box && box.y + box.height <= vis + TOL, `campo termina em ${box ? (box.y + box.height).toFixed(0) : "?"}, teclado começa em ${vis.toFixed(0)}`);
  await composer.blur();
  await setKeyboard(0);
  const boxAfter = await composer.boundingBox();
  check("Assistente: sem teclado, a barra volta para o rodapé", boxAfter && boxAfter.y + boxAfter.height > VIEW.height - 80, `campo termina em ${boxAfter ? (boxAfter.y + boxAfter.height).toFixed(0) : "?"}`);

  // ---------- treino em andamento: a barra "Finalizar" não pode cobrir o campo que está sendo digitado ----------
  await appReady("/treino");
  await page.getByRole("button", { name: /^Iniciar / }).first().click();
  await page.waitForURL("**/treino/sessao");
  await page.waitForSelector("text=séries concluídas");
  const weight = page.getByLabel(/^Carga da série 1 de/).first();
  await weight.focus();
  await setKeyboard(KEYBOARD);
  const wBox = await weight.boundingBox();
  const bar = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Finalizar treino");
    const r = btn?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { top: r.top, bottom: r.bottom } : null;
  });
  await page.screenshot({ path: path.join(OUT, "kb-treino-sessao.png") });
  const visW = await page.evaluate(() => window.visualViewport.offsetTop + window.visualViewport.height);
  check(
    "Treino: com o teclado aberto, o campo de carga está visível e a barra de baixo não o cobre",
    wBox && wBox.y >= 0 && wBox.y + wBox.height <= visW + TOL && (bar === null || bar.top >= wBox.y + wBox.height - TOL),
    `campo ${wBox?.y.toFixed(0)}–${wBox ? (wBox.y + wBox.height).toFixed(0) : "?"}, barra ${bar ? bar.top.toFixed(0) + "–" + bar.bottom.toFixed(0) : "oculta"}, teclado em ${visW.toFixed(0)}`,
  );
  await weight.blur();
  await setKeyboard(0);

  check("Sem erros de console nem exceções na página", problems.length === 0, problems.slice(0, 3).join(" | "));

  await browser.close();
} catch (error) {
  console.error(error);
  results.push({ name: "execução", ok: false });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
await shutdown(failed ? 1 : 0);
