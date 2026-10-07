/**
 * Schema das variáveis de ambiente, SEM dependências do Next. Existe separado de `env.ts` (que importa
 * `server-only`) porque o `next.config.ts` também o usa, para barrar um build com configuração inválida.
 */
import { z } from "zod";

/** Campo em branco no painel da Vercel vale como ausente. */
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

const schema = z
  .object({
    NEXT_PUBLIC_APP_MODE: z.preprocess(blank, z.enum(["live", "demo"]).default("demo")),

    SUPABASE_URL: optional(z.url()),
    SUPABASE_PUBLISHABLE_KEY: optional(z.string().min(1)),

    // Qualquer provedor com API compatível com a da OpenAI (chat completions + ferramentas). A chave e a URL são
    // genéricas de propósito: uma variável XAI_API_KEY guardando uma chave da Groq seria enganosa.
    AI_PROVIDER: z.preprocess(blank, z.enum(["xai", "groq", "none"]).default("none")),
    AI_MODEL: optional(z.string().min(1)),
    AI_API_KEY: optional(z.string().min(1)),
    /** opcional: o padrão vem do provedor (ver `src/server/ai/factory.ts`) */
    AI_BASE_URL: optional(z.url()),
    AI_DAILY_REQUEST_LIMIT: z.preprocess(blank, z.coerce.number().int().positive().default(60)),
    AI_PER_MINUTE_LIMIT: z.preprocess(blank, z.coerce.number().int().positive().default(10)),
    AI_MONTHLY_TOKEN_BUDGET: z.preprocess(blank, z.coerce.number().int().positive().default(500_000)),

    CRON_SECRET: optional(z.string().min(16)),
  })
  .superRefine((env, ctx) => {
    const require = (keys: readonly (keyof typeof env)[], reason: string) => {
      for (const key of keys) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: reason });
      }
    };
    if (env.NEXT_PUBLIC_APP_MODE === "live") {
      require(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "CRON_SECRET"], "obrigatória no modo live");
    }
    if (env.AI_PROVIDER !== "none") {
      require(["AI_API_KEY", "AI_MODEL"], `obrigatória quando AI_PROVIDER=${env.AI_PROVIDER}`);
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Configuração de ambiente inválida:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

/** Pura e testável. A mensagem lista só o nome da variável e o motivo, nunca o valor (pode ser segredo). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`),
    );
  }
  return result.data;
}
