import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: localNetworkHosts(),
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
