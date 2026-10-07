/**
 * Roda uma vez quando uma instância do servidor sobe, antes de atender requisições.
 * Valida as variáveis de ambiente para que uma configuração errada derrube o deploy na hora
 * (com a lista do que falta), e não apareça como erro obscuro na primeira tela.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./server/env");
    getEnv();
  }
}
