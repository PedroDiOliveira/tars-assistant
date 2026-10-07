import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "../env-schema";
import { createProvider, extraBodyFor, providerLabel } from "./factory";

const live = { NEXT_PUBLIC_APP_MODE: "live", SUPABASE_URL: "https://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x", CRON_SECRET: "0123456789abcdef" };
const env = (extra: Record<string, string>) => parseEnv({ ...live, ...extra });

describe("providerLabel", () => {
  it("diz ao usuário para quem as mensagens vão", () => {
    expect(providerLabel("groq")).toBe("Groq");
    expect(providerLabel("xai")).toBe("xAI (Grok)");
    expect(providerLabel("none")).toBeNull();
  });
});

describe("extraBodyFor", () => {
  it("modelos de raciocínio da Groq pedem o menor esforço (senão pensam até acabar o limite de tokens)", () => {
    expect(extraBodyFor("groq", "openai/gpt-oss-20b")).toEqual({ reasoning_effort: "low", include_reasoning: false });
    expect(extraBodyFor("groq", "openai/gpt-oss-120b")).toEqual({ reasoning_effort: "low", include_reasoning: false });
  });
  it("outros modelos e provedores não recebem parâmetros extras", () => {
    expect(extraBodyFor("groq", "qwen/qwen3.8-27b")).toEqual({});
    expect(extraBodyFor("xai", "grok-4.3")).toEqual({});
    expect(extraBodyFor("none", "x")).toEqual({});
  });
});

describe("createProvider", () => {
  it("sem provedor (ou incompleto) a IA fica desligada", () => {
    expect(createProvider(env({}))).toBeNull();
    expect(createProvider(env({ AI_PROVIDER: "none", AI_API_KEY: "k", AI_MODEL: "m" }))).toBeNull();
  });

  it.each([
    ["groq", "https://api.groq.com/openai/v1/chat/completions"],
    ["xai", "https://api.x.ai/v1/chat/completions"],
  ] as const)("%s: usa a URL padrão do provedor, o nome e a chave configurados", async (provider, expectedUrl) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }] }), { status: 200 }));
    const created = createProvider(env({ AI_PROVIDER: provider, AI_API_KEY: "chave-teste", AI_MODEL: "modelo-x" }), fetchImpl as unknown as typeof fetch);
    expect(created?.name).toBe(provider);
    await created!.chat({ messages: [{ role: "user", content: "oi" }], tools: [], maxTokens: 10, signal: AbortSignal.timeout(2000) });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(expectedUrl);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer chave-teste");
    expect(JSON.parse(init.body as string).model).toBe("modelo-x");
  });

  it("AI_BASE_URL sobrescreve o padrão", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }] }), { status: 200 }));
    const created = createProvider(env({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "m", AI_BASE_URL: "https://proxy.example/v1/" }), fetchImpl as unknown as typeof fetch);
    await created!.chat({ messages: [{ role: "user", content: "oi" }], tools: [], maxTokens: 10, signal: AbortSignal.timeout(2000) });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("https://proxy.example/v1/chat/completions");
  });

  it("os parâmetros extras do modelo chegam ao corpo da requisição", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }] }), { status: 200 }));
    const created = createProvider(env({ AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "openai/gpt-oss-20b" }), fetchImpl as unknown as typeof fetch);
    await created!.chat({ messages: [{ role: "user", content: "oi" }], tools: [], maxTokens: 10, signal: AbortSignal.timeout(2000) });
    const body = JSON.parse(((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(body).toMatchObject({ reasoning_effort: "low", include_reasoning: false, max_tokens: 10 });
  });
});
