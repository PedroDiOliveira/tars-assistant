import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "./openai-compatible";
import { ProviderError } from "./provider";

/** Servidor local que imita a API compatível com a da OpenAI e registra o que recebeu. */
let server: http.Server;
let baseUrl: string;
const requests: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
let respond: (res: http.ServerResponse) => void;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      requests.push({ url: req.url ?? "", headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") });
      respond(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  requests.length = 0;
});

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const ok = (message: object, usage: object | null = { prompt_tokens: 120, completion_tokens: 30 }) => (res: http.ServerResponse) =>
  json(res, 200, { choices: [{ message }], ...(usage ? { usage } : {}) });

const SECRET = "chave-super-secreta-123";
const provider = (extra: { name?: string; extraBody?: Record<string, unknown> } = {}) =>
  createOpenAiCompatibleProvider({ name: extra.name ?? "teste", apiKey: SECRET, model: "modelo-teste", baseUrl, extraBody: extra.extraBody });
const request = (over: object = {}) => ({
  messages: [{ role: "system" as const, content: "sistema" }, { role: "user" as const, content: "oi" }],
  tools: [{ name: "get_x", description: "d", parameters: { type: "object", properties: {} } }],
  maxTokens: 300,
  signal: AbortSignal.timeout(5000),
  ...over,
});

describe("requisição enviada ao provedor", () => {
  it("usa POST /chat/completions com a chave no cabeçalho e o formato de ferramentas da OpenAI", async () => {
    respond = ok({ content: "olá" });
    await provider().chat(request());
    const [sent] = requests;
    expect(sent.url).toBe("/v1/chat/completions");
    expect(sent.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(sent.body).toMatchObject({
      model: "modelo-teste",
      max_tokens: 300,
      tool_choice: "auto",
      messages: [{ role: "system", content: "sistema" }, { role: "user", content: "oi" }],
      tools: [{ type: "function", function: { name: "get_x", description: "d", parameters: { type: "object", properties: {} } } }],
    });
  });

  it("expõe o nome do provedor (usado em logs)", () => {
    expect(provider({ name: "groq" }).name).toBe("groq");
  });

  it("a chave nunca vai no corpo da requisição", async () => {
    respond = ok({ content: "ok" });
    await provider().chat(request());
    expect(JSON.stringify(requests[0].body)).not.toContain(SECRET);
  });

  it("mescla os parâmetros extras do provedor/modelo ao corpo, sem perder os padrões", async () => {
    respond = ok({ content: "ok" });
    await provider({ extraBody: { reasoning_effort: "low", include_reasoning: false } }).chat(request());
    expect(requests[0].body).toMatchObject({ reasoning_effort: "low", include_reasoning: false, model: "modelo-teste", max_tokens: 300 });
  });

  it("devolve ao provedor as chamadas de ferramenta e os resultados no formato esperado", async () => {
    respond = ok({ content: "feito" });
    await provider().chat(request({
      messages: [
        { role: "user", content: "quanto gastei?" },
        { role: "assistant", content: null, toolCalls: [{ id: "call_1", name: "get_x", arguments: '{"a":1}' }] },
        { role: "tool", toolCallId: "call_1", content: '{"total":10}' },
      ],
    }));
    expect(requests[0].body.messages).toEqual([
      { role: "user", content: "quanto gastei?" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_x", arguments: '{"a":1}' } }] },
      { role: "tool", tool_call_id: "call_1", content: '{"total":10}' },
    ]);
  });

  it("aceita baseUrl com barra no final", async () => {
    respond = ok({ content: "ok" });
    await createOpenAiCompatibleProvider({ name: "t", apiKey: SECRET, model: "m", baseUrl: `${baseUrl}///` }).chat(request());
    expect(requests[0].url).toBe("/v1/chat/completions");
  });
});

describe("resposta", () => {
  it("lê texto, chamadas de ferramenta e uso de tokens", async () => {
    respond = ok({ content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_x", arguments: '{"m":"2026-10"}' } }] });
    const result = await provider().chat(request());
    expect(result.message).toEqual({ content: null, toolCalls: [{ id: "c1", name: "get_x", arguments: '{"m":"2026-10"}' }] });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
  });

  it("ignora campos extras do provedor (ex.: 'reasoning' da Groq) sem quebrar", async () => {
    respond = ok({ content: "resposta", reasoning: "pensamento interno", role: "assistant" });
    const result = await provider().chat(request());
    expect(result.message.content).toBe("resposta");
  });

  it("uso ausente conta como zero (não quebra)", async () => {
    respond = ok({ content: "oi" }, null);
    expect((await provider().chat(request())).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("resposta fora do formato vira bad_response", async () => {
    for (const body of [{}, { choices: [] }, { choices: [{ message: { tool_calls: [{ id: 1 }] } }] }, "texto"]) {
      respond = (res) => json(res, 200, body);
      await expect(provider().chat(request())).rejects.toMatchObject({ kind: "bad_response" });
    }
    respond = (res) => { res.writeHead(200); res.end("não é json"); };
    await expect(provider().chat(request())).rejects.toMatchObject({ kind: "bad_response" });
  });
});

describe("erros: classificados, sem retry e sem vazar segredo", () => {
  const cases: [number, string][] = [[401, "unauthorized"], [403, "unauthorized"], [402, "rate_limited"], [429, "rate_limited"], [408, "timeout"], [504, "timeout"], [500, "unavailable"], [503, "unavailable"], [400, "bad_response"], [404, "bad_response"]];
  it.each(cases)("HTTP %i vira %s", async (status, kind) => {
    respond = (res) => json(res, status, { error: `detalhe interno com ${SECRET} e a pergunta do usuário` });
    const error = await provider().chat(request()).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe(kind);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain("pergunta do usuário"); // o corpo de erro do provedor não é repassado
    expect(requests).toHaveLength(1); // NENHUMA nova tentativa
  });

  it("estouro de tempo vira timeout (e faz uma tentativa só)", async () => {
    respond = () => undefined; // nunca responde
    const error = await provider().chat(request({ signal: AbortSignal.timeout(150) })).catch((e) => e);
    expect(error).toMatchObject({ kind: "timeout" });
    expect(requests).toHaveLength(1);
  });

  it("provedor inalcançável vira unavailable", async () => {
    const dead = createOpenAiCompatibleProvider({ name: "t", apiKey: SECRET, model: "m", baseUrl: "http://127.0.0.1:9/v1" });
    const error = await dead.chat(request()).catch((e) => e);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect(error.message).not.toContain(SECRET);
  });
});
