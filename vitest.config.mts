import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    // O banco de teste (PGlite) sobe as migrações reais; a primeira vez leva alguns segundos.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Cada arquivo de teste de banco carrega um Postgres em WASM (~0,8 GB de pico). Com um worker por CPU a suíte
    // chegava a vários GB e era morta por falta de memória (exit 137) em máquinas de 8 GB. 3 workers bastam.
    maxWorkers: 3,
  },
});
