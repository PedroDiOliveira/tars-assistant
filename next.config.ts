import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import { SERVICE_WORKER_HEADERS, securityHeaders } from "./src/lib/security-headers";
import { parseEnv } from "./src/server/env-schema";

// Um deploy com configuração inválida (ex.: modo live sem as chaves do Supabase) tem de quebrar AQUI, no build, com a
// lista do que falta. Sem isto o build passaria e o erro só apareceria em cada requisição, em produção.
parseEnv(process.env);

/**
 * IPs locais da máquina (192.168.x.y, 10.x.y.z...). O servidor de desenvolvimento só libera
 * `localhost` por padrão; sem liberar estes, abrir pelo IP da rede (no iPhone, por exemplo)
 * bloqueia os arquivos internos do Next e a tela fica presa no esqueleto de carregamento.
 * Detectamos em vez de fixar um IP porque ele muda de rede para rede.
 */
function localNetworkHosts(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .map((net) => net!.address);
}

/**
 * O watcher do Turbopack usa inotify e falha com ENOSPC quando o limite de watchers do sistema
 * está esgotado (o VSCode vigiando muitos projetos faz isso), derrubando o dev server em loop.
 * `NEXT_WATCH_POLL=1 npm run dev` troca o inotify por polling, que não depende desse limite.
 * Fica opt-in porque polling gasta mais CPU.
 */
const watchOptions = process.env.NEXT_WATCH_POLL ? { pollIntervalMs: 1000 } : undefined;

const nextConfig: NextConfig = {
  // Permite compilar para outra pasta (`NEXT_DIST_DIR=.next-check npm run build`) sem pisar no servidor de
  // desenvolvimento, que mantém seus arquivos em `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Esconde "X-Powered-By: Next.js": não ajuda ninguém além de quem procura versões vulneráveis.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders({ production: process.env.NODE_ENV === "production", https: Boolean(process.env.VERCEL) }) },
      { source: "/sw.js", headers: SERVICE_WORKER_HEADERS },
    ];
  },
  allowedDevOrigins: localNetworkHosts(),
  watchOptions,
  turbopack: {
    // Há um package-lock.json solto no diretório home; sem isto o Next infere a raiz errada.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
