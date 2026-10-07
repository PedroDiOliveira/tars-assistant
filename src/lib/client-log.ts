/** Log do navegador, só com um código curto (nunca mensagem de erro, que pode ter dados do usuário). */
export function log(event: string, code?: string): void {
  console.error(JSON.stringify({ level: "error", event, ...(code && /^[A-Za-z0-9_-]{1,40}$/.test(code) ? { code } : {}) }));
}
