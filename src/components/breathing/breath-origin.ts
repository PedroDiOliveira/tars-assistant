/**
 * De onde a pessoa veio. O ícone do cabeçalho existe nas quatro abas, e sair da respiração deve voltar exatamente para
 * a aba (e a rolagem) de origem: isso é o `history.back()`. Só que, aberta direto pela URL ou num app recém-iniciado,
 * não há "voltar" dentro do app; aí a saída vai para a Início.
 *
 * Fica em memória de módulo de propósito: sobrevive à navegação interna e some ao recarregar, que é exatamente
 * quando o histórico do app também deixa de valer.
 */
let enteredFromApp = false;

/** Chamado no toque do ícone do cabeçalho. */
export function markBreathEntry(): void {
  enteredFromApp = true;
}

interface Navigation {
  back(): void;
  replace(href: "/inicio"): void;
}

export function leaveBreathing(router: Navigation): void {
  if (enteredFromApp) {
    enteredFromApp = false;
    router.back();
  } else {
    router.replace("/inicio");
  }
}
