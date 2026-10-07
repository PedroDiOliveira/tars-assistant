/**
 * Cabeçalhos de segurança das respostas. Função pura (usada pelo `next.config.ts` e testada à parte).
 *
 * CSP: o app só conversa com o próprio servidor (`connect-src 'self'`): o navegador nunca fala direto com o Supabase
 * nem com o provedor de IA, então um script injetado não teria para onde enviar dados. `script-src` aceita
 * 'unsafe-inline' porque o Next e o tema injetam pequenos scripts inline, e um nonce por requisição forçaria
 * renderização dinâmica e acabaria com as telas estáticas (navegação instantânea). Em compensação NÃO há
 * 'unsafe-eval', nem domínios de terceiros, nem frames, nem <object>.
 */
export interface SecurityHeaderOptions {
  /** em desenvolvimento o Turbopack precisa de eval e de WebSocket (HMR): sem CSP lá */
  production: boolean;
  /** só quando servido por HTTPS (Vercel). Em http://IP-da-rede isto quebraria o carregamento dos arquivos. */
  https: boolean;
}

export interface Header {
  key: string;
  value: string;
}

export function contentSecurityPolicy({ https }: Pick<SecurityHeaderOptions, "https">): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Header[] {
  const headers: Header[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // O app não usa nada disto: negar de antemão tira o risco de um script pedir. (Só nomes que o Chrome reconhece:
    // um nome desconhecido, como "bluetooth", gera um aviso no console a cada página.)
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
  if (options.production) headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(options) });
  return headers;
}

/** O service worker precisa ser sempre revalidado (senão uma versão velha ficaria presa) e rodar com CSP própria. */
export const SERVICE_WORKER_HEADERS: Header[] = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
];
