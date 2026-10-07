/**
 * Log estruturado (uma linha JSON por evento). REGRA: nunca vai conteúdo do usuário nem segredos. Os campos aceitos
 * são só números, booleanos e códigos curtos (tipo de erro, nome de ferramenta); qualquer texto longo ou com cara de
 * dado pessoal é descartado em vez de registrado.
 */
export type LogValue = string | number | boolean | null | undefined | readonly string[];
export type LogFields = Record<string, LogValue>;

const MAX_STRING = 60;
const SAFE_CODE = /^[A-Za-z0-9_.:-]+$/;

function sanitize(value: LogValue): LogValue {
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => (typeof v === "string" && SAFE_CODE.test(v) && v.length <= MAX_STRING ? v : "[omitido]"));
  if (typeof value === "string") return SAFE_CODE.test(value) && value.length <= MAX_STRING ? value : "[omitido]";
  return value;
}

export function formatLog(level: "info" | "warn" | "error", event: string, fields: LogFields = {}): string {
  const safe = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, sanitize(v)]));
  return JSON.stringify({ level, event, ...safe });
}

export function log(level: "info" | "warn" | "error", event: string, fields?: LogFields): void {
  const line = formatLog(level, event, fields);
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
