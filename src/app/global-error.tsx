"use client";

/**
 * Último recurso: erro no layout raiz. Substitui o documento inteiro, então traz o próprio <html>/<body> e estilos
 * mínimos em linha (o CSS do app pode nem ter carregado).
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f3f7ef", color: "#0a120e" }}>
        <main role="alert" style={{ maxWidth: 448, minHeight: "100dvh", margin: "0 auto", padding: "40px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, textAlign: "center", background: "#fff" }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Algo deu errado</h1>
          <p style={{ margin: 0, opacity: 0.7 }}>Seus dados estão salvos e nada foi perdido. Recarregue a página para continuar.</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 44, border: 0, borderRadius: 12, background: "#084734", color: "#fff", font: "600 16px system-ui, sans-serif" }}>
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
