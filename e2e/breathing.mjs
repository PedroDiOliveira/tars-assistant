/**
 * Respiração guiada no modo DEMO, ponta a ponta, num celular (375 px): o ícone discreto do cabeçalho, a saída que
 * volta para a aba de origem, a sessão inteira com o relógio do navegador controlado (preparação, inspiração,
 * expiração, retenções, parada sem salto), a sincronia entre a bolinha (tamanho e rosto), a barra e o rótulo no MESMO
 * instante, o seletor de ritmo (pílula que se desdobra: toque, teclado, Esc, toque fora), a pausa ao ir para o segundo
 * plano, o wake lock, o som, as preferências guardadas, o movimento reduzido e a paisagem.
 *
 *   NEXT_PUBLIC_APP_MODE=demo npm run dev        (noutro terminal)
 *   npm run test:e2e:breathing                   ou  BASE=http://localhost:3101 BROWSER=webkit node e2e/breathing.mjs
 *
 * Cada verificação imprime PASS/FAIL e o processo sai com código 1 se alguma falhar.
 */
import { chromium, webkit } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3000";
const ENGINE = process.env.BROWSER || "chromium";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
fs.mkdirSync(OUT, { recursive: true });
const PREFS_KEY = "tars-breath-prefs-v1";
/** Mesmas constantes de src/domain/breathing.ts e breathing.css. */
const LEAD_IN = 2500;
const SETTLE = 1200;
/** escala da bolinha: murcha → cheia (breathing.css) */
const ORB_MIN = 0.72;
const ORB_GAIN = 0.28;

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  [${ENGINE}] ${name}${extra ? "  -> " + extra : ""}`);
};
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const shot = (name) => path.join(OUT, `breathing-${name}.png`);

const mobile = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo" };
if (ENGINE === "chromium") mobile.isMobile = true;

/** Wake lock de mentira: o headless não tem tela para manter acesa; conta pedidos e liberações. */
function fakeWakeLock() {
  const log = { requests: 0, releases: 0, held: 0 };
  window.__wake = log;
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
      request: async () => {
        log.requests += 1;
        log.held += 1;
        const lock = new EventTarget();
        let released = false;
        lock.release = async () => {
          if (released) return;
          released = true;
          log.releases += 1;
          log.held -= 1;
          lock.dispatchEvent(new Event("release"));
        };
        return lock;
      },
    },
  });
}

function tools(page, problems) {
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) problems.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message.slice(0, 200)}`));

  const settle = async () => {
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-app-ready"), null, { timeout: 30000 });
    await page.waitForSelector(".launch-screen", { state: "detached", timeout: 30000 });
    await page.waitForTimeout(250);
  };
  const t = {
    settle,
    open: async (route) => {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await settle();
    },
    character: () => page.locator(".breather"),
    /** Toca no personagem e dá ao React um instante para pintar o texto (o relógio da página não anda). */
    tap: async () => {
      await page.locator(".breather").click();
      await page.waitForTimeout(80);
    },
    exitButton: () => page.getByRole("button", { name: "Sair da respiração guiada" }),
    soundButton: () => page.getByRole("button", { name: "Som ambiente" }),
    trigger: () => page.locator(".breath-picker-trigger"),
    option: (name) => page.getByRole("option", { name, exact: true }),
    /** Abre o seletor, escolhe e espera o cartão se dobrar de volta. */
    choose: async (name) => {
      await page.locator(".breath-picker-trigger").click();
      await page.getByRole("option", { name, exact: true }).click();
      await page.waitForTimeout(80);
    },
    /** Estado do seletor num instante: rótulo da pílula, se está aberto, quem tem o foco, onde está o cartão. */
    picker: () =>
      page.evaluate(() => {
        const trigger = document.querySelector(".breath-picker-trigger");
        const surface = document.querySelector(".breath-picker-surface");
        const list = document.querySelector(".breath-picker-list");
        const rect = surface.getBoundingClientRect();
        const active = document.activeElement;
        const nameOf = (el) => (el?.getAttribute("aria-labelledby") ? document.getElementById(el.getAttribute("aria-labelledby")).textContent : null);
        // um ponto no alto do cartão: só responde ao toque com o cartão aberto (fechado, o recorte limita à pílula)
        const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12);
        return {
          expanded: trigger.getAttribute("aria-expanded"),
          label: document.querySelector(".breath-picker-name").textContent,
          name: trigger.textContent.trim(),
          listInert: list.inert,
          focus: active === trigger ? "trigger" : nameOf(active),
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
          topHitsCard: surface.contains(probe),
          scrim: Number(getComputedStyle(document.querySelector(".breath-picker-scrim")).opacity),
          rhythm: document.querySelector(".breath-rhythm").textContent,
          options: [...document.querySelectorAll(".breath-picker-option")].map((o) => Number(getComputedStyle(o).opacity)),
        };
      }),
    prefs: () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.state ?? null, PREFS_KEY),
    noHorizontalScroll: () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    /** Pausa o relógio do navegador: daqui em diante o tempo só anda com `run`. */
    freeze: async () => {
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 50);
    },
    run: (ms) => page.clock.runFor(ms),
    /** Lê, num único instante, tudo o que precisa andar junto: variáveis, barra, bolinha, rosto, rótulo e contagem. */
    probe: () =>
      page.evaluate(() => {
        const root = document.querySelector(".breath-screen");
        const css = getComputedStyle(root);
        const num = (name) => Number(css.getPropertyValue(name));
        const track = document.querySelector(".breath-bar");
        const fill = new DOMMatrix(getComputedStyle(document.querySelector(".breath-bar-fill")).transform);
        const orb = new DOMMatrix(getComputedStyle(document.querySelector(".breather-orb")).transform);
        const opacity = (sel) => Number(getComputedStyle(document.querySelector(sel)).opacity);
        return {
          breath: num("--breath"),
          inflow: num("--inflow"),
          outflow: num("--outflow"),
          presence: num("--presence"),
          bar: fill.e / track.clientWidth + 1,
          barOpacity: Number(getComputedStyle(track).opacity),
          orbX: orb.a,
          orbY: orb.d,
          eyesOpen: opacity(".breather-eye-open"),
          eyesClosed: opacity(".breather-eye-closed"),
          smile: opacity(".breather-smile"),
          mouthO: opacity(".breather-o"),
          cheeks: opacity(".breather-cheek"),
          size: document.querySelector(".breather").getBoundingClientRect().width,
          label: document.querySelector(".breath-label").innerText.trim(),
          count: document.querySelector(".breath-count").innerText.trim(),
          button: document.querySelector(".breather").getAttribute("aria-label"),
          optionsInert: document.querySelector(".breath-options").inert,
        };
      }),
    setVisibility: (state) =>
      page.evaluate((value) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value });
        document.dispatchEvent(new Event("visibilitychange"));
        if (value === "visible") delete document.visibilityState;
      }, state).then(() => page.waitForTimeout(80)),
  };
  return t;
}

/** Escala esperada da bolinha para o ar e o fluxo do instante (a mesma conta do CSS): incha, estica ao inspirar e
 *  achata ao expirar. Com movimento reduzido, só a escala sutil. */
function orbMatches(p, motion = true) {
  if (!motion) {
    const scale = 0.84 + 0.04 * p.breath;
    return near(p.orbX, scale, 0.002) && near(p.orbY, scale, 0.002);
  }
  const scale = ORB_MIN + ORB_GAIN * p.breath;
  const x = scale * (1 - 0.025 * p.inflow + 0.02 * p.outflow);
  const y = scale * (1 + 0.035 * p.inflow - 0.025 * p.outflow);
  return near(p.orbX, x, 0.002) && near(p.orbY, y, 0.002);
}

(async () => {
  const browser = await ({ chromium, webkit }[ENGINE]).launch();
  const problems = [];

  // ---------- 1. cabeçalho e navegação ----------
  {
    const context = await browser.newContext(mobile);
    await context.addInitScript(fakeWakeLock);
    const page = await context.newPage();
    const t = tools(page, problems);

    await t.open("/inicio");
    const link = page.getByRole("link", { name: "Respirar: pausa guiada" });
    check("Cabeçalho: ícone de respiração com rótulo acessível, levando a /respirar", (await link.count()) === 1 && (await link.getAttribute("href")) === "/respirar");
    const order = await page.locator("header a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    check("Cabeçalho: o ícone fica à direita, antes do assistente e do perfil", order.indexOf("/respirar") > -1 && order.indexOf("/respirar") < order.indexOf("/configuracoes") && (order.indexOf("/assistente") === -1 || order.indexOf("/respirar") < order.indexOf("/assistente")), order.join(" "));
    const box = await link.boundingBox();
    check("Cabeçalho: alvo de toque de 44 px", box !== null && box.width >= 44 && box.height >= 44, JSON.stringify(box));
    const [windAlpha, sparkAlpha] = await page.evaluate(() => {
      const alpha = (sel) => {
        const el = document.querySelector(sel);
        return el ? Number((getComputedStyle(el).color.match(/[\d.]+(?=\)$)/) ?? ["1"])[0]) : 1;
      };
      return [alpha('header a[href="/respirar"]'), alpha('header a[href="/assistente"]')];
    });
    check("Cabeçalho: o ícone é mais discreto que o do assistente", windAlpha < sparkAlpha, `${windAlpha} < ${sparkAlpha}`);
    await page.screenshot({ path: shot("header"), clip: { x: 0, y: 0, width: 375, height: 64 } });

    await page.setViewportSize({ width: 320, height: 640 });
    const fits = await page.evaluate(() => [...document.querySelectorAll("header a")].every((a) => a.getBoundingClientRect().right <= window.innerWidth));
    check("Cabeçalho: em 320 px os ícones cabem sem rolagem lateral", fits && (await t.noHorizontalScroll()));
    await page.setViewportSize(mobile.viewport);

    // Volta para a aba de origem (Finanças), pelo botão
    await t.open("/financas");
    await page.getByRole("link", { name: "Respirar: pausa guiada" }).click();
    await page.waitForURL("**/respirar");
    await page.locator(".breath-screen").waitFor();
    check("Entrar pelo cabeçalho abre a tela de respiração", (await page.getByRole("heading", { name: "Respiração guiada" }).count()) === 1);
    // Vale a primeira meta theme-color do documento (as do Next têm `media`, a da tela não).
    await page.waitForTimeout(300);
    const themeColors = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));
    check("Barra de status acompanha o céu enquanto a tela está aberta", themeColors[0] === "#061712", themeColors.join(" "));
    await t.exitButton().click();
    await page.waitForURL("**/financas");
    const restored = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));
    check("Sair volta para a aba de onde veio (Finanças) e devolve a cor da barra de status", page.url().endsWith("/financas") && restored.every((c) => c !== "#061712"), restored.join(" "));

    // Pela tecla Esc, a partir de Exercícios
    await t.open("/treino");
    await page.getByRole("link", { name: "Respirar: pausa guiada" }).click();
    await page.waitForURL("**/respirar");
    await page.locator(".breath-screen").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForURL("**/treino");
    check("Esc sai e volta para a aba de origem (Exercícios)", page.url().endsWith("/treino"));

    // Aberta direto pela URL: não há "voltar" dentro do app, então vai para a Início
    await t.open("/respirar");
    await t.exitButton().click();
    await page.waitForURL("**/inicio");
    check("Aberta direto pela URL, sair leva à Início", page.url().endsWith("/inicio"));
    await context.close();
  }

  // ---------- 2. a sessão, com o relógio do navegador nas mãos do teste ----------
  {
    const context = await browser.newContext(mobile);
    await context.addInitScript(fakeWakeLock);
    await context.clock.install();
    const page = await context.newPage();
    const t = tools(page, problems);
    await t.open("/respirar");

    const idleText = (await page.locator(".breath-screen").innerText()).replace(/\s+/g, " ");
    check("Parado: dica 'Toque para começar' e personagem com rótulo de início", /Toque para começar/.test(idleText) && (await page.getByRole("button", { name: "Começar respiração guiada" }).count()) === 1);
    const idlePicker = await t.picker();
    check("Parado: só a pílula com o ritmo atual (Coerente) e o ritmo descrito; a lista fica fechada", idlePicker.label === "Coerente" && idlePicker.expanded === "false" && idlePicker.listInert && /Inspire 5 s · expire 5 s/.test(idlePicker.rhythm), JSON.stringify(idlePicker).slice(0, 200));
    check("Parado: olhos abertos, sorrindo, sem 'o' na boca", (await t.probe()).eyesOpen === 1 && (await t.probe()).eyesClosed === 0 && (await t.probe()).mouthO === 0);
    check("Parado: som desligado de fábrica", (await t.soundButton().getAttribute("aria-pressed")) === "false");
    check("O rótulo da fase é uma região aria-live educada", (await page.locator(".breath-label").getAttribute("aria-live")) === "polite");
    const target = await t.character().boundingBox();
    check("Personagem: alvo de toque grande (≥ 220 px)", target !== null && target.width >= 220 && target.height >= 220, JSON.stringify(target));
    await page.screenshot({ path: shot("idle") });

    await t.freeze();
    await t.tap();
    let p = await t.probe();
    check("Toque inicia: 'Prepare-se', botão vira 'Parar' e o seletor de ritmo sai de cena (inert)", p.label === "Prepare-se" && p.button === "Parar respiração guiada" && p.optionsInert === true, JSON.stringify({ label: p.label, button: p.button }));
    check("Preparação: bolinha murcha (sem ar), sem contagem", p.breath === 0 && p.count === "" && orbMatches(p));
    check("Wake lock pedido ao iniciar", (await page.evaluate(() => window.__wake.held)) === 1);
    await t.run(1250);
    p = await t.probe();
    check("Preparação: a luz sobe (presença ~0,5 na metade)", near(p.presence, 0.5, 0.05) && p.breath === 0, String(p.presence));
    check("Preparação: ela vai fechando os olhos", p.eyesOpen < 0.6 && p.eyesClosed > 0.1, `${p.eyesOpen} / ${p.eyesClosed}`);
    await page.screenshot({ path: shot("lead-in") });

    await t.run(LEAD_IN - 1250 + 2500);
    p = await t.probe();
    check("Meio da inspiração: 'Inspire', faltam 3 s, pulmão pela metade", p.label === "Inspire" && p.count === "3" && near(p.breath, 0.5, 0.03), JSON.stringify({ label: p.label, count: p.count, breath: p.breath }));
    check("Sincronia: barra = personagem no mesmo instante", near(p.bar, p.breath, 0.01), `${p.bar} vs ${p.breath}`);
    check("Sincronia: tamanho (e o leve esticar) da bolinha é exatamente o que o ar manda", orbMatches(p), `${p.orbX} x ${p.orbY} @ ${p.breath}`);
    check("Inspirando: olhos fechados, ar entrando no máximo, sorriso (sem 'o')", p.eyesClosed === 1 && p.eyesOpen === 0 && near(p.inflow, 1, 0.02) && p.outflow === 0 && p.smile === 1 && p.mouthO === 0, JSON.stringify({ i: p.inflow, s: p.smile, o: p.mouthO }));
    check("Inspirando: estica um pouquinho para cima", p.orbY > p.orbX);
    await page.screenshot({ path: shot("inhale") });
    const before = p.breath;
    await t.run(200);
    p = await t.probe();
    check("Na inspiração o nível só sobe", p.breath > before, `${before} -> ${p.breath}`);

    // O rAF do relógio falso anda de 16 em 16 ms: lê um pouco depois da fronteira, nunca em cima dela.
    await t.run(2300 + 40);
    p = await t.probe();
    check("Virada: 'Expire', 5 s, bolinha cheia e barra cheia", p.label === "Expire" && p.count === "5" && p.breath > 0.99 && p.bar > 0.99, JSON.stringify({ label: p.label, count: p.count, breath: p.breath }));
    check("Cheia: a bolinha inflou e as bochechas coraram", near(p.orbX, 1, 0.01) && p.cheeks > 0.98, `${p.orbX} ${p.cheeks}`);
    await page.screenshot({ path: shot("open") });
    await t.run(2500 - 40);
    p = await t.probe();
    const midExhale = p.breath;
    check("Meio da expiração: boca em 'o' (o ar saindo no máximo), sem sorriso, achatando", near(p.outflow, 1, 0.02) && p.mouthO === 1 && p.smile === 0 && p.orbX > p.orbY && orbMatches(p), JSON.stringify({ out: p.outflow, o: p.mouthO, s: p.smile }));
    await t.run(200);
    p = await t.probe();
    check("Meio da expiração: o nível desce e a barra esvazia junto", near(midExhale, 0.5, 0.03) && p.breath < midExhale && near(p.bar, p.breath, 0.01), `${midExhale} -> ${p.breath}`);
    check("Sincronia na expiração: bolinha no tamanho certo", orbMatches(p), `${p.orbX} x ${p.orbY} @ ${p.breath}`);
    await page.screenshot({ path: shot("exhale") });

    // Seis ciclos depois (um minuto), ainda no compasso: o tempo vem do relógio, não de somas
    await t.run(60_000);
    p = await t.probe();
    // 2,7 s dentro da expiração de 5 s: nível = 1 − ease(0,54)
    const expected = 1 - (1 - Math.cos(Math.PI * (2700 / 5000))) / 2;
    check("Sem deriva: um minuto depois, mesma fase e mesmo nível", p.label === "Expire" && near(p.breath, expected, 0.03), `${p.label} ${p.breath} (${expected.toFixed(3)})`);

    // Parar: volta ao repouso a partir de onde estava, sem salto
    const atStop = p.breath;
    await t.tap();
    p = await t.probe();
    check("Toque para: dica volta, botão vira 'Começar', seletor volta a valer", p.label === "Toque para começar" && p.button === "Começar respiração guiada" && p.optionsInert === false);
    check("Parar não dá salto: a bolinha continua de onde estava", near(p.breath, atStop, 0.02), `${atStop} -> ${p.breath}`);
    await t.run(SETTLE / 2);
    p = await t.probe();
    check("Assentando: metade do caminho na metade do tempo", near(p.breath, atStop / 2, 0.03), `${p.breath}`);
    await t.run(SETTLE);
    p = await t.probe();
    check("Assentado: murcha, luz apagada, barra some", p.breath === 0 && p.presence === 0 && p.barOpacity === 0);
    check("Assentado: abre os olhos de novo e a boca volta ao sorriso", p.eyesOpen === 1 && p.eyesClosed === 0 && p.mouthO === 0 && p.smile === 1);
    check("Wake lock liberado ao parar", (await page.evaluate(() => window.__wake.held)) === 0);

    // Recomeçar no meio do assentamento também não salta
    await t.tap();
    await t.run(LEAD_IN + 2500);
    const running = (await t.probe()).breath;
    await t.tap();
    await t.run(300);
    const settling = (await t.probe()).breath;
    await t.tap();
    p = await t.probe();
    check("Recomeçar durante o assentamento não salta", near(p.breath, settling, 0.02) && settling < running, `${running} -> ${settling} -> ${p.breath}`);
    await t.run(LEAD_IN + 40);
    p = await t.probe();
    check("…e a nova sessão começa murcha, na primeira inspiração", p.label === "Inspire" && p.breath < 0.02, `${p.label} ${p.breath}`);

    // Segundo plano: encerra, solta o wake lock e avisa
    await t.run(2000);
    await t.setVisibility("hidden");
    p = await t.probe();
    check("Ir para o segundo plano pausa a sessão e solta o wake lock", p.button === "Começar respiração guiada" && (await page.evaluate(() => window.__wake.held)) === 0);
    await t.setVisibility("visible");
    p = await t.probe();
    check("Ao voltar: 'Pausado. Toque para continuar'", p.label === "Pausado. Toque para continuar", p.label);
    await t.run(SETTLE + 100);

    // Caixa: retenções com a barra parada; escolha guardada no aparelho
    await t.choose("Caixa");
    check("Escolher 'Caixa' fica guardado no aparelho", (await t.prefs())?.pattern === "box");
    const boxPicker = await t.picker();
    check("Caixa: a pílula mostra o nome novo e o ritmo vem descrito embaixo", boxPicker.label === "Caixa" && boxPicker.expanded === "false" && /Inspire 4 s · segure 4 s · expire 4 s · segure 4 s/.test(boxPicker.rhythm), JSON.stringify(boxPicker).slice(0, 200));
    await t.tap();
    await t.run(LEAD_IN + 4000 + 2000);
    p = await t.probe();
    check("Caixa: retenção cheia mostra 'Segure', bolinha cheia e barra cheia", p.label === "Segure" && p.breath === 1 && p.bar > 0.99, JSON.stringify({ label: p.label, breath: p.breath }));
    check("Caixa: na retenção não passa ar (sem 'o', sem esticar), bochechas cheias", p.inflow === 0 && p.outflow === 0 && p.mouthO === 0 && p.smile === 1 && p.cheeks > 0.98 && near(p.orbX, 1, 0.001) && near(p.orbY, 1, 0.001));
    await page.screenshot({ path: shot("hold") });
    const offset = await page.evaluate(() => {
      const root = document.querySelector(".breath-screen");
      const back = document.querySelector(".breath-icon-button").getBoundingClientRect();
      return { scroll: root.scrollLeft + root.scrollTop, back: Math.round(back.left) + "," + Math.round(back.top) };
    });
    check("A tela nunca rola nem se desloca (órbitas que transbordam não criam rolagem)", offset.scroll === 0 && offset.back === "8,6", JSON.stringify(offset));
    await t.run(1200);
    p = await t.probe();
    check("Caixa: na retenção nada se mexe (barra e bolinha parados)", p.breath === 1 && p.label === "Segure" && p.count === "1");
    await t.run(800 + 4000 + 2000);
    p = await t.probe();
    check("Caixa: retenção vazia mostra 'Segure' com a bolinha murcha", p.label === "Segure" && p.breath === 0 && orbMatches(p), JSON.stringify({ label: p.label, breath: p.breath }));
    await t.tap();
    await t.run(SETTLE + 100);

    // Som: liga, guarda e não quebra nada
    await t.soundButton().click();
    check("Som: botão marcado e preferência guardada", (await t.soundButton().getAttribute("aria-pressed")) === "true" && (await t.prefs())?.sound === true);
    await t.tap();
    await t.run(LEAD_IN + 3000);
    await t.soundButton().click();
    await t.tap();
    await t.run(SETTLE + 100);
    check("Som: desligar durante a sessão funciona", (await t.soundButton().getAttribute("aria-pressed")) === "false");

    // Preferência sobrevive ao recarregar
    await page.clock.resume();
    await t.open("/respirar");
    check("Recarregar mantém o padrão escolhido", (await t.picker()).label === "Caixa" && (await page.getByRole("button", { name: "Ritmo: Caixa" }).count()) === 1);
    await context.close();
  }

  // ---------- 3. seletor de ritmo: a pílula que se desdobra ----------
  {
    const context = await browser.newContext(mobile);
    const page = await context.newPage();
    const t = tools(page, problems);
    await t.open("/respirar");
    /** o cartão anima ~0,6 s; espera passar */
    const settled = () => page.waitForTimeout(750);

    let s = await t.picker();
    check("Seletor fechado: a pílula tem nome acessível com o ritmo atual e diz que está fechada", s.expanded === "false" && (await page.getByRole("button", { name: "Ritmo: Coerente" }).count()) === 1);
    check("Seletor fechado: fora da pílula o cartão não recebe toque (recorte) e as opções ficam fora do alcance", !s.topHitsCard && s.listInert && s.options.every((o) => o === 0), JSON.stringify(s));
    const pill = await t.trigger().locator(".breath-picker-pill").boundingBox();
    check("Seletor fechado: pílula com alvo de toque de 44 px", pill !== null && pill.height >= 44 && pill.width >= 44, JSON.stringify(pill));

    await t.trigger().click();
    await settled();
    s = await t.picker();
    check("Tocar na pílula abre o cartão com os quatro ritmos e o véu", s.expanded === "true" && !s.listInert && s.topHitsCard && s.options.length === 4 && s.options.every((o) => o === 1) && s.scrim === 1, JSON.stringify(s).slice(0, 220));
    check("Ao abrir, o foco vai para o ritmo atual", s.focus === "Coerente", String(s.focus));
    check("O cartão aberto cabe na tela", s.rect.top >= 0 && s.rect.bottom <= 812 && s.rect.left >= 0 && s.rect.right <= 375, JSON.stringify(s.rect));
    check("O ritmo atual está marcado (aria-selected) e só ele", (await t.option("Coerente").getAttribute("aria-selected")) === "true" && (await page.locator('[role="option"][aria-selected="true"]').count()) === 1);
    const caixaAbout = await t.option("Caixa").evaluate((el) => document.getElementById(el.getAttribute("aria-describedby")).textContent);
    check("Cada ritmo descreve as fases e para que serve (a Caixa avisa sobre tontura)", /Inspire 4 s · segure 4 s · expire 4 s · segure 4 s/.test(caixaAbout) && /tontura/.test(caixaAbout), caixaAbout);
    await page.screenshot({ path: shot("picker-open") });

    await page.keyboard.press("ArrowDown");
    const afterDown = (await t.picker()).focus;
    await page.keyboard.press("End");
    const afterEnd = (await t.picker()).focus;
    await page.keyboard.press("ArrowDown");
    const wrapped = (await t.picker()).focus;
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
    const afterHome = (await t.picker()).focus;
    check("Teclado: setas, Home e End movem o foco entre os ritmos (dando a volta)", afterDown === "Suave" && afterEnd === "4-7-8" && wrapped === "Coerente" && afterHome === "Coerente", [afterDown, afterEnd, wrapped, afterHome].join(" "));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    s = await t.picker();
    check("Esc fecha o cartão SEM sair da tela, e o foco volta para a pílula", s.expanded === "false" && s.focus === "trigger" && page.url().endsWith("/respirar"), `${s.expanded} ${s.focus} ${page.url()}`);
    await settled();

    await page.keyboard.press("ArrowDown");
    await settled();
    s = await t.picker();
    check("Teclado: seta na pílula abre o cartão", s.expanded === "true" && s.focus === "Coerente", `${s.expanded} ${s.focus}`);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    s = await t.picker();
    check("Teclado: Enter escolhe (Suave), fecha e devolve o foco à pílula", s.label === "Suave" && s.expanded === "false" && s.focus === "trigger" && (await t.prefs())?.pattern === "extended" && /Inspire 4 s · expire 6 s/.test(s.rhythm), JSON.stringify(s).slice(0, 200));
    await settled();

    // Tocar fora (no personagem, por baixo do véu) só fecha: não começa a sessão
    await t.trigger().click();
    await settled();
    const orbBox = await page.locator(".breather").boundingBox();
    await page.mouse.click(orbBox.x + orbBox.width / 2, orbBox.y + 30);
    await page.waitForTimeout(80);
    s = await t.picker();
    check("Tocar fora fecha o cartão e não inicia a respiração", s.expanded === "false" && (await page.getByRole("button", { name: "Começar respiração guiada" }).count()) === 1 && (await page.locator(".breath-label").innerText()).trim() === "Toque para começar");
    await settled();

    // Escolher pelo toque: o nome novo vai para a pílula e o cartão se fecha
    await t.choose("4-7-8");
    s = await t.picker();
    check("Tocar num ritmo escolhe, guarda e fecha (pílula mostra '4-7-8')", s.label === "4-7-8" && s.expanded === "false" && (await t.prefs())?.pattern === "478", `${s.label} ${s.expanded}`);
    await settled();
    s = await t.picker();
    check("Depois de fechar, o cartão volta a ser só a pílula", !s.topHitsCard && s.scrim === 0 && s.options.every((o) => o === 0), JSON.stringify(s).slice(0, 200));
    await page.screenshot({ path: shot("picker-chosen") });

    // Com o cartão aberto, Esc com o foco fora dele também só fecha
    await t.trigger().click();
    await settled();
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    check("Esc com o foco fora do cartão também só fecha o seletor", (await t.picker()).expanded === "false" && page.url().endsWith("/respirar"));
    await context.close();
  }

  // ---------- 4. movimento reduzido ----------
  {
    const context = await browser.newContext({ ...mobile, reducedMotion: "reduce" });
    await context.clock.install();
    const page = await context.newPage();
    const t = tools(page, problems);
    await t.open("/respirar");
    await t.freeze();
    await t.tap();
    await t.run(LEAD_IN + 4990);
    const p = await t.probe();
    const still = await page.evaluate(() => {
      const float = getComputedStyle(document.querySelector(".breather-float"));
      return { transform: float.transform, animation: float.animationName };
    });
    check("Movimento reduzido: a bolinha não incha, não estica nem boia (só escala sutil 0,84 → 0,88)", orbMatches(p, false) && near(p.orbX, 0.88, 0.003) && still.transform === "none" && still.animation === "none", `${p.orbX} ${JSON.stringify(still)}`);
    check("Movimento reduzido: o ritmo segue guiado (rótulo, barra, rosto de olhos fechados)", p.label === "Inspire" && p.bar > 0.99 && p.eyesClosed === 1, `${p.label} ${p.bar} ${p.eyesClosed}`);
    await page.screenshot({ path: shot("reduced-motion") });
    await context.close();
  }

  // ---------- 5. paisagem e tema escuro ----------
  {
    const context = await browser.newContext({ ...mobile, viewport: { width: 812, height: 375 }, colorScheme: "dark" });
    await context.clock.install();
    const page = await context.newPage();
    const t = tools(page, problems);
    await t.open("/respirar");
    const layout = await page.evaluate(() => {
      const inside = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      };
      return { character: inside(".breather"), panel: inside(".breath-panel"), top: inside(".breath-top") };
    });
    check("Paisagem: personagem, texto e controles cabem na tela", layout.character && layout.panel && layout.top && (await t.noHorizontalScroll()), JSON.stringify(layout));
    await page.screenshot({ path: shot("landscape") });
    await t.trigger().click();
    await page.waitForTimeout(750);
    const card = (await t.picker()).rect;
    check("Paisagem: o cartão do seletor aberto cabe na tela", card.top >= 0 && card.bottom <= 375 && card.right <= 812, JSON.stringify(card));
    await page.screenshot({ path: shot("landscape-picker") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(750);
    await t.freeze();
    await t.tap();
    await t.run(LEAD_IN + 2500);
    await page.screenshot({ path: shot("landscape-inhale") });
    await context.close();
  }

  // ---------- 6. fluidez em tempo real ----------
  {
    const context = await browser.newContext(mobile);
    const page = await context.newPage();
    const t = tools(page, problems);
    await t.open("/respirar");
    await page.evaluate(() => {
      window.__long = 0;
      try {
        new PerformanceObserver((list) => (window.__long += list.getEntries().length)).observe({ type: "longtask", buffered: false });
      } catch {
        window.__long = -1;
      }
    });
    await t.tap();
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const deltas = [];
          let last = performance.now();
          const end = last + 4000;
          const step = (now) => {
            deltas.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(step);
            else resolve(deltas);
          };
          requestAnimationFrame(step);
        }),
    );
    const slow = frames.filter((d) => d > 50).length;
    const longTasks = await page.evaluate(() => window.__long);
    check("Fluidez: 4 s de sessão sem quadros lentos (> 50 ms) nem tarefas longas", slow === 0 && longTasks <= 0, `${frames.length} quadros, ${slow} lentos, ${longTasks} tarefas longas`);
    await context.close();
  }

  check("Nenhum erro nem aviso no console", problems.length === 0, problems.slice(0, 5).join(" | "));
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
