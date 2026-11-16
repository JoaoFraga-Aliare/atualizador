# Agrosys UI

Kit visual com o padrão do site oficial da Agrosys ([agrosys.com.br](https://www.agrosys.com.br/)): cores, fonte, menu lateral recolhível e componentes básicos. Ele nasceu do protótipo do AgroDoc (`docs/prototipo/agrodoc-prototipo.html`) e foi separado para ser usado em outros projetos.

Abra `exemplo.html` para ver todos os componentes funcionando.

## Arquivos

| Arquivo | O que é |
|---|---|
| `tokens.css` | Variáveis de cor, fonte, cantos e sombras (`--ag-*`). Carrega a fonte Poppins do Google Fonts. |
| `componentes.css` | Menu lateral, topo, botões, cards, tabela, selos, abas, formulário, avisos, modal e toast. Requer `tokens.css`. |
| `menu.js` | Recolhimento do menu, hint com o nome do item e memória da escolha. Sem dependências. |
| `logo-agrosys.svg` | Logo oficial do site, para **fundo escuro**. |
| `logo-agrosys-marca.svg` | Só a letra "a" da logo, para fundo escuro. Usada no menu recolhido. |
| `logo-agrosys-fundo-claro.svg` | Logo com as partes brancas trocadas por azul-marinho, para fundo claro. **Derivada, não oficial.** |
| `exemplo.html` | Página de demonstração com todos os componentes. |

## Como usar

### HTML puro

Copie a pasta para o projeto e inclua:

```html
<link rel="stylesheet" href="agrosys-ui/tokens.css">
<link rel="stylesheet" href="agrosys-ui/componentes.css">
<script src="agrosys-ui/menu.js" defer></script>
```

Coloque a classe `ag` no `<body>` (ela ativa a fonte e as cores base) e monte a estrutura `ag-app` > `ag-menu` + `ag-main`, copiando de `exemplo.html`. O `menu.js` liga o menu sozinho quando a página carrega.

### React (Vite) ou outra SPA

1. Copie a pasta para `src/estilos/agrosys-ui/` e importe os CSS no ponto de entrada:
   ```ts
   import "./estilos/agrosys-ui/tokens.css";
   import "./estilos/agrosys-ui/componentes.css";
   ```
2. Use as classes nos componentes (`className="ag-btn ag-btn-primario"`).
3. Para o menu, importe `menu.js` e chame `AgrosysMenu.iniciar(elemento)` num `useEffect` depois de montar o menu. A função devolve outra para desligar os eventos, que deve ser chamada na limpeza do efeito:
   ```tsx
   useEffect(() => window.AgrosysMenu.iniciar(appRef.current), []);
   ```
   Como alternativa, reescreva a mesma lógica num componente: são ~60 linhas.

## Regras do padrão

- **Cores:** azul-marinho `#003E59` no menu, nos títulos e no botão escuro; ciano `#00B7CE` no botão principal, no item ativo e nos rótulos de seção. Para links sobre fundo branco, use `--ag-ciano-texto` (`#007D8F`), porque o ciano puro tem pouco contraste com o branco.
- **Fonte:** Poppins, com títulos em negrito (700) e texto em 400. Sem internet, a fonte cai para Segoe UI.
- **Formas:** cantos de 12px em botões e itens de menu, de 16px em cards, e sombra leve.
- **Rótulos de seção:** pequenos, em maiúsculas e em ciano (`ag-eyebrow`, `ag-menu-secao`), como no site.
- **Ícones:** traço fino de 1,8px no estilo do [Lucide](https://lucide.dev) (licença MIT). Para ícones novos, copie o SVG do Lucide para dentro de `<span class="ag-icone">`.
- **Prefixo:** todas as classes começam com `ag-` e todas as variáveis com `--ag-`, para não colidir com outros CSS (Bootstrap, Tailwind etc.).

## Menu recolhível

- O botão `.ag-recolher` alterna entre o menu completo (240px) e só ícones (72px).
- Com o menu recolhido, o nome do item aparece num hint ao passar o mouse ou ao focar pelo teclado. O texto vem de `data-hint` ou, se ele não existir, de `.ag-rotulo`.
- A escolha fica salva no navegador (chave `agrosys-ui.menuRecolhido`).
- Em telas de até 780px o menu fica sempre recolhido e o botão some.
- Marque o item da página atual com `aria-current="page"` (ou a classe `ag-ativo`).

## Pendências antes de usar fora da área

- **Logo:** os SVGs foram copiados do site público em 2026-11-07. Confirme com o marketing se existe versão oficial em alta resolução ou manual de marca, principalmente para a versão de fundo claro, que foi derivada aqui.
- **Fonte:** a Poppins vem do Google Fonts. Em ambiente sem acesso externo, baixe os arquivos da fonte e troque o `@import` de `tokens.css` por `@font-face` local.
