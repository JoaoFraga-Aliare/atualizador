/* =========================================================
   Agrosys UI — menu lateral recolhível
   - Botão .ag-recolher alterna entre menu completo e só ícones.
   - Com o menu recolhido, passar o mouse (ou o foco do teclado) num
     item mostra o nome dele num hint. O nome vem de data-hint ou,
     na falta dele, do texto de .ag-rotulo.
   - A escolha fica salva no navegador (localStorage).
   - Em telas estreitas (até 780px) o menu fica sempre recolhido.

   Uso: <script src="menu.js" defer></script> e marcar o contêiner
   com class="ag-app". Em SPA (React etc.), chamar
   AgrosysMenu.iniciar(elemento) depois de montar o menu; a função
   devolve outra para desligar os eventos.
   ========================================================= */
(function () {
  var CHAVE = "agrosys-ui.menuRecolhido";
  var ESTREITA = "(max-width: 780px)";

  function ler() { try { return localStorage.getItem(CHAVE) === "1"; } catch (e) { return false; } }
  function gravar(v) { try { localStorage.setItem(CHAVE, v ? "1" : "0"); } catch (e) { /* sem armazenamento: só não lembra */ } }

  function iniciar(app) {
    app = app || document.querySelector(".ag-app");
    if (!app || app.dataset.agMenu) return function () {}; // ausente ou já ligado
    app.dataset.agMenu = "1";
    var mq = window.matchMedia(ESTREITA);
    var botao = app.querySelector(".ag-recolher");

    var hint = document.createElement("div");
    hint.className = "ag-hint";
    hint.setAttribute("role", "tooltip");
    hint.hidden = true;
    document.body.appendChild(hint);

    function aplicar() {
      var estreita = mq.matches;
      var mini = estreita || ler();
      app.classList.toggle("ag-mini", mini);
      app.classList.toggle("ag-estreita", estreita);
      if (botao) {
        botao.setAttribute("aria-expanded", String(!mini));
        botao.setAttribute("aria-label", mini ? "Expandir menu" : "Recolher menu");
        botao.setAttribute("data-hint", "Expandir menu");
      }
      esconder();
    }
    function nomeDo(el) {
      if (el.dataset.hint) return el.dataset.hint;
      var r = el.querySelector(".ag-rotulo");
      return r ? r.textContent.trim() : "";
    }
    function mostrar(e) {
      if (!app.classList.contains("ag-mini")) return esconder();
      var el = e.target.closest && e.target.closest(".ag-menu .ag-item");
      if (!el || !app.contains(el)) return esconder();
      var nome = nomeDo(el);
      if (!nome) return esconder();
      var r = el.getBoundingClientRect();
      hint.textContent = nome;
      hint.style.left = r.right + 12 + "px";
      hint.style.top = r.top + r.height / 2 + "px";
      hint.hidden = false;
    }
    function esconder() { hint.hidden = true; }
    function alternar() { gravar(!app.classList.contains("ag-mini")); aplicar(); }

    // Itens sem nome acessível herdam o texto do rótulo (o rótulo some quando recolhido).
    app.querySelectorAll(".ag-menu .ag-item").forEach(function (el) {
      if (!el.getAttribute("aria-label") && el !== botao) el.setAttribute("aria-label", nomeDo(el));
    });

    if (botao) botao.addEventListener("click", alternar);
    app.addEventListener("mouseover", mostrar);
    app.addEventListener("focusin", mostrar);
    app.addEventListener("mouseleave", esconder);
    document.addEventListener("scroll", esconder, true);
    mq.addEventListener("change", aplicar);
    aplicar();

    return function desligar() {
      if (botao) botao.removeEventListener("click", alternar);
      app.removeEventListener("mouseover", mostrar);
      app.removeEventListener("focusin", mostrar);
      app.removeEventListener("mouseleave", esconder);
      document.removeEventListener("scroll", esconder, true);
      mq.removeEventListener("change", aplicar);
      hint.remove();
      delete app.dataset.agMenu;
    };
  }

  window.AgrosysMenu = { iniciar: iniciar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { iniciar(); });
  else iniciar();
})();
