/**
 * Rede de segurança para o app não ficar num esqueleto mudo quando o JavaScript não roda
 * (arquivos do servidor de desenvolvimento bloqueados ao abrir pelo IP da rede, chunk que
 * falhou, extensão do navegador). O script é embutido no HTML: ele roda mesmo quando os
 * arquivos externos não carregam, que é justamente o caso que precisamos denunciar.
 *
 * O app marca `data-app-ready` em <html> assim que monta (ver AppLaunch); se a marca não
 * aparecer a tempo, mostramos uma explicação em vez do esqueleto girando para sempre.
 */
const TIMEOUT_MS = 8000;

const SCRIPT = `
(function () {
  var done = false;
  function ready() { return document.documentElement.hasAttribute("data-app-ready"); }
  function warn() {
    if (done || ready()) return;
    done = true;
    var splash = document.querySelector(".launch-screen");
    if (splash) splash.remove();
    var content = document.querySelector(".app-content");
    if (content) {
      content.removeAttribute("inert");
      content.removeAttribute("aria-hidden");
      content.style.opacity = "1";
    }
    document.documentElement.style.overflow = "";
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;inset:auto 0 0 0;z-index:2147483647;margin:12px;padding:16px;border-radius:16px;background:#084734;color:#fff;font:500 14px/1.5 system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.3)";
    box.innerHTML =
      '<p style="margin:0 0 8px;font-weight:700">O app não terminou de carregar</p>' +
      '<p style="margin:0 0 12px;opacity:.85">Se você abriu pelo IP da rede, pare o servidor e rode <code style="background:rgba(255,255,255,.14);padding:1px 5px;border-radius:5px">npm run dev</code> de novo para liberar este endereço.</p>' +
      '<button type="button" style="min-height:44px;width:100%;border:0;border-radius:12px;background:#cef17b;color:#084734;font:600 15px system-ui,sans-serif">Recarregar</button>';
    box.querySelector("button").addEventListener("click", function () { location.reload(); });
    document.body.appendChild(box);
  }
  setTimeout(warn, ${TIMEOUT_MS});
})();
`;

export function BootCheck() {
  return (
    <script
      // No cliente o script não deve ser reexecutado numa navegação; só vale no carregamento.
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
