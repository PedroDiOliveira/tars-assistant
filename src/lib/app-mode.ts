/**
 * Modo da aplicação, fixo por deploy (`NEXT_PUBLIC_APP_MODE`): "live" usa Supabase e dados
 * reais; "demo" usa dados fictícios no navegador. Nunca alterna em runtime, para que dados de
 * demonstração e dados pessoais jamais se misturem. Qualquer valor diferente de "live" é demo;
 * `server/env.ts` rejeita valores inválidos na subida do servidor.
 */
export type AppMode = "live" | "demo";

export const APP_MODE: AppMode = process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo";
export const IS_LIVE = APP_MODE === "live";
