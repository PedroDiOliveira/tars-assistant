/**
 * Páginas abertas a quem não está logado. Fonte única: o proxy (redirecionamento) e o navegador (que não deve
 * buscar dados do usuário nelas, nem recarregar o login em loop ao receber um 401) leem a mesma lista.
 */
export const PUBLIC_PAGES = ["/login", "/esqueci-senha", "/redefinir-senha"] as const;

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
