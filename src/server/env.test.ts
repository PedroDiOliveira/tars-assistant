import { describe, expect, it } from "vitest";
import { aiEnabled, EnvError, parseEnv } from "./env";

const liveBase = {
  NEXT_PUBLIC_APP_MODE: "live",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  CRON_SECRET: "0123456789abcdef",
};

describe("parseEnv", () => {
  it("sem nada configurado roda em modo demo, com IA desligada", () => {
    const env = parseEnv({});
    expect(env.NEXT_PUBLIC_APP_MODE).toBe("demo");
    expect(env.AI_PROVIDER).toBe("none");
    expect(aiEnabled(env)).toBe(false);
    expect(env.AI_BASE_URL).toBeUndefined(); // o padrão vem do provedor escolhido
  });

  it("modo live exige Supabase e o segredo do cron", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_APP_MODE: "live" })).toThrow(EnvError);
    const env = parseEnv(liveBase);
    expect(env.SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("lista todas as variáveis faltando, uma por linha", () => {
    try {
      parseEnv({ NEXT_PUBLIC_APP_MODE: "live" });
      expect.unreachable();
    } catch (error) {
      const message = (error as EnvError).message;
      expect(message).toContain("SUPABASE_URL");
      expect(message).toContain("SUPABASE_PUBLISHABLE_KEY");
      expect(message).toContain("CRON_SECRET");
    }
  });

  it.each(["xai", "groq"] as const)("IA com %s exige chave e modelo; sem provedor o app funciona sem elas", (provider) => {
    expect(() => parseEnv({ ...liveBase, AI_PROVIDER: provider })).toThrow(/AI_API_KEY/);
    expect(() => parseEnv({ ...liveBase, AI_PROVIDER: provider, AI_API_KEY: "k" })).toThrow(/AI_MODEL/);
    const env = parseEnv({ ...liveBase, AI_PROVIDER: provider, AI_API_KEY: "k", AI_MODEL: "algum-modelo" });
    expect(aiEnabled(env)).toBe(true);
    expect(aiEnabled(parseEnv(liveBase))).toBe(false);
  });

  it("a mensagem de erro diz qual provedor exigiu a chave", () => {
    expect(() => parseEnv({ ...liveBase, AI_PROVIDER: "groq" })).toThrow(/AI_PROVIDER=groq/);
  });

  it("rejeita um provedor desconhecido em vez de ignorá-lo em silêncio", () => {
    expect(() => parseEnv({ ...liveBase, AI_PROVIDER: "openai" })).toThrow(/AI_PROVIDER/);
  });

  it("aceita uma URL base própria e recusa uma inválida", () => {
    const ok = parseEnv({ ...liveBase, AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "m", AI_BASE_URL: "https://proxy.example/v1" });
    expect(ok.AI_BASE_URL).toBe("https://proxy.example/v1");
    expect(() => parseEnv({ ...liveBase, AI_PROVIDER: "groq", AI_API_KEY: "k", AI_MODEL: "m", AI_BASE_URL: "não é url" })).toThrow(/AI_BASE_URL/);
  });

  it("campo em branco (painel da Vercel) conta como ausente", () => {
    const env = parseEnv({ AI_PROVIDER: "", AI_API_KEY: "  ", AI_BASE_URL: " ", SUPABASE_URL: "", NEXT_PUBLIC_APP_MODE: "" });
    expect(env.NEXT_PUBLIC_APP_MODE).toBe("demo");
    expect(env.AI_PROVIDER).toBe("none");
  });

  it("rejeita modo inválido em vez de cair em demo sem avisar", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_APP_MODE: "producao" })).toThrow(/NEXT_PUBLIC_APP_MODE/);
  });

  it("converte e valida os limites numéricos", () => {
    const env = parseEnv({ AI_DAILY_REQUEST_LIMIT: "25", AI_MONTHLY_TOKEN_BUDGET: "1000" });
    expect(env.AI_DAILY_REQUEST_LIMIT).toBe(25);
    expect(env.AI_PER_MINUTE_LIMIT).toBe(10); // padrão
    expect(env.AI_MONTHLY_TOKEN_BUDGET).toBe(1000);
    expect(() => parseEnv({ AI_DAILY_REQUEST_LIMIT: "0" })).toThrow(EnvError);
    expect(() => parseEnv({ AI_DAILY_REQUEST_LIMIT: "abc" })).toThrow(EnvError);
  });

  it("nunca imprime o valor de um segredo na mensagem de erro", () => {
    const secret = "segredo-super-sensivel-123";
    try {
      parseEnv({ ...liveBase, SUPABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as EnvError).message).not.toContain(secret);
    }
  });
});
