/**
 * xAI FALSA para os testes E2E: um servidor com o formato da API compatível com a da OpenAI
 * (`POST /v1/chat/completions` com `tools`) e um "modelo" roteirizado por regras simples. Não há IA aqui; serve para
 * exercitar o app real (chave, formato, ferramentas, falhas) sem gastar nada.
 *
 * Roteiro (olha a ÚLTIMA mensagem):
 *   - mensagem de ferramenta   -> redige a resposta final a partir do resultado da ferramenta
 *   - contém "FALHAR"          -> HTTP 500
 *   - contém "VARIOS"          -> duas propostas de lançamento (o app deve pedir um de cada vez)
 *   - contém "quanto gastei"   -> get_financial_summary do mês de hoje (testado ANTES de "gastei", que ele contém)
 *   - contém "gastei"          -> propose_transaction (valor = primeiro número; "ontem" resolvido pela data do prompt)
 *   - qualquer outra coisa     -> pergunta o que faltou
 */
import http from "node:http";

export async function startFakeXai({ port = 54398, apiKey = "xai-chave-de-teste" } = {}) {
  /** Tudo o que o app enviou, para os testes conferirem (chave, ferramentas, vazamento de dados). */
  const received = [];
  const state = { down: false };

  const reply = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const toolCall = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

  function decide(messages) {
    const last = messages.at(-1);
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const today = /(\d{4}-\d{2}-\d{2})/.exec(system)?.[1] ?? "2026-01-01";

    if (last.role === "tool") {
      const result = JSON.parse(last.content);
      if (result.error) return { content: `Não consegui: ${result.error}` };
      if (result.expenseText !== undefined) {
        return { content: `Em ${result.period.label}: despesas ${result.expenseText} e resultado ${result.resultText}.` };
      }
      return { content: "Aqui está o resumo do período." };
    }

    const text = String(last.content ?? "");
    const lower = text.toLowerCase();
    if (text.includes("FALHAR")) return null;
    if (text.includes("VARIOS")) {
      return {
        tool_calls: [
          toolCall("a", "propose_transaction", { type: "expense", amount_brl: 10 }),
          toolCall("b", "propose_transaction", { type: "expense", amount_brl: 20 }),
        ],
      };
    }
    if (lower.includes("quanto gastei")) {
      return { tool_calls: [toolCall("f1", "get_financial_summary", { month: today.slice(0, 7) })] };
    }
    if (lower.includes("gastei")) {
      const amount = Number(/(\d+(?:[.,]\d+)?)/.exec(text)?.[1].replace(",", ".") ?? 0);
      const date = new Date(`${today}T12:00:00Z`);
      if (lower.includes("ontem")) date.setUTCDate(date.getUTCDate() - 1);
      return {
        tool_calls: [
          toolCall("p1", "propose_transaction", {
            type: "expense",
            amount_brl: amount,
            description: lower.includes("outback") ? "Outback" : "",
            date: date.toISOString().slice(0, 10),
            category_name: lower.includes("outback") ? "Alimentação" : undefined,
          }),
        ],
      };
    }
    return { content: "Não entendi. Qual foi o valor e o que foi?" };
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/v1/chat/completions") return reply(res, 404, { error: "não implementado no falso" });
      if (req.headers.authorization !== `Bearer ${apiKey}`) return reply(res, 401, { error: "chave inválida" });
      if (state.down) return reply(res, 503, { error: "fora do ar" });

      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      received.push({ headers: req.headers, body });
      const decision = decide(body.messages);
      if (decision === null) return reply(res, 500, { error: "erro interno simulado" });

      const message = { role: "assistant", content: decision.content ?? null, ...(decision.tool_calls ? { tool_calls: decision.tool_calls } : {}) };
      return reply(res, 200, {
        choices: [{ index: 0, message, finish_reason: decision.tool_calls ? "tool_calls" : "stop" }],
        usage: { prompt_tokens: 600, completion_tokens: 40, total_tokens: 640 },
      });
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${port}/v1`,
    apiKey,
    received,
    setDown(down) {
      state.down = down;
    },
    reset() {
      received.length = 0;
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
