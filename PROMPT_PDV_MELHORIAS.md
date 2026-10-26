# Prompt: adaptações do PDV e do Atualizador à Central de Atualização

Cole o texto abaixo numa sessão aberta em `D:\Projetos\PDV\PDV`. A verificação da
assinatura dos pacotes tem prompt próprio em `PROMPT_PDV_ASSINATURA_PACOTES.md`;
os dois podem ser feitos na mesma rodada.

---

A Central de Atualização mudou e o PDV (`PDV\`, unit `uAtualizacaoPDV.pas`) e o
Atualizador (`atualizador\`, units `uUpdaterHttp.pas`, `uAtualizadorCore.pas`,
`uUpdater.pas`, `uUpdaterConfig.pas`) precisam de ajustes. Delphi 12; os `.pas`
estão em ANSI (Windows-1252): preserve a codificação e os finais de linha.

## 1. Chave própria do terminal (obrigatório antes de ligar a cobrança na Central)

Hoje tudo usa a chave global (`[Server] Token` do `updater.ini`, que é a
`INSTALLATION_KEY` da Central). A Central agora emite uma chave por terminal:

- A resposta de `POST /api/v1/updates/check` traz `terminalKey` (texto
  `tk_...`) enquanto o terminal ainda usa a chave global. O campo some depois que
  o terminal passa a usar a chave dele.
- No primeiro uso da `terminalKey` em qualquer chamada, a Central a confirma e,
  a partir daí, **recusa a chave global para aquele terminal** com
  `401 {"error":"terminal_key_required"}`.
- Usar a chave com outro `terminalId` responde `403 terminal_mismatch`.
- Se o suporte descartar a chave no painel (reinstalação, chave perdida), a
  chave antiga passa a responder `401 invalid_installation_key` e a próxima
  consulta com a chave global recebe uma `terminalKey` nova.

O que implementar:

1. Ler `terminalKey` em `TUpdaterHttp.Check` e, quando vier preenchida, gravá-la
   em `[Server] TerminalKey` do mesmo `updater.ini` (o PDV e o Atualizador leem
   esse arquivo). Se for simples, proteja o valor com DPAPI
   (`CryptProtectData`, escopo da máquina); senão, texto puro, como já é o
   `Token`.
2. Em **todas** as chamadas à Central, usar `Authorization: Bearer <TerminalKey>`
   quando ela existir, e a chave global só quando ainda não houver
   `TerminalKey`:
   - Atualizador: `/api/v1/updates/check` e `/api/v1/updates/events`;
   - PDV: `/api/v1/errors` (`EnviarEnvelope`) e
     `/api/v1/config/themes/...` (consulta do tema);
   - qualquer outro projeto que chame `/api/v1/live` (WebSocket, parâmetro
     `token`), `/api/v1/database/request` ou `/api/v1/database/upload` (procure
     no Integrador e no Backup).
3. **Não trocar a chave da cifragem dos erros.** O envelope de `/api/v1/errors`
   continua derivado da chave global (`DerivarChaveHkdfSha256(TerminalId,
   <chave global>, Salt)`); só o cabeçalho `Authorization` passa a usar a
   `TerminalKey`. Hoje a mesma variável `Token` serve para as duas coisas: separe.
4. Ao receber `401 invalid_installation_key` usando a `TerminalKey`, apagar a
   `TerminalKey` gravada e repetir a chamada uma vez com a chave global (que vai
   trazer uma chave nova no próximo `/updates/check`). Ao receber
   `401 terminal_key_required` com a chave global, não insistir: registrar no
   log que a chave do terminal foi perdida e que o suporte deve descartá-la no
   painel da Central.
5. Quando o PDV chama o Atualizador passando `/token=...` na linha de comando,
   continue passando a chave global; o Atualizador lê a `TerminalKey` do ini.
6. PDV e Atualizador precisam sair na mesma versão: se só o Atualizador passar a
   usar a `TerminalKey`, a Central recusa a chave global que o PDV ainda usa para
   erros e tema. Enquanto houver terminais com versões misturadas, a Central pode
   rodar com `TERMINAL_KEY_ENFORCEMENT=off` (avise o responsável pela Central).

## 2. Produto nos eventos de atualização

`TUpdaterHttp.SendEvent` recebe `ProductCode` mas não o envia. Incluir
`Json.AddPair('product', ProductCode)`. Sem isso a Central assume `pdv`, e os
eventos do Integrador ficam ligados à versão errada.

## 3. Hash do executável na consulta

Enviar `currentExecutableHash` no corpo de `/api/v1/updates/check`: SHA-256, em
hexadecimal minúsculo, do executável instalado (o `EntryPoint` do
`updater.ini`, por exemplo `PDV.exe`; já existe `FileSha256` em
`uUpdaterFiles.pas`). Com isso a Central:

- responde `currentAuthorized: false` quando o executável não corresponde a
  nenhuma publicação homologada (registre no log e, se fizer sentido, avise o
  operador). Nesse caso a Central não oferece atualização, então o terminal
  precisa de atendimento do suporte;
- passa a decidir a próxima versão pela ordem de publicação, e não só pela
  comparação de números de versão.

Se o arquivo não existir ou não puder ser lido, não envie o campo.

## 4. Status dos eventos

A Central agora só aceita `status` com letras, números, `_`, `.` e `-` (até 40
caracteres); versões e produto com até 50 caracteres; mensagens acima de 4000
caracteres são cortadas. Os valores atuais (`downloading`, `success`,
`rollback`, `error`) já passam. Não crie status com espaço ou acento.

## 5. Limite de tentativas

Depois de várias chaves inválidas seguidas do mesmo IP (30 em 15 minutos), a
Central responde `429 {"error":"too_many_attempts"}` por até 15 minutos, inclusive
para a chave certa, e o WebSocket fecha com o motivo `too_many_attempts`. Trate
429 como "tente mais tarde": não repita em laço, espere o próximo ciclo de
consulta e registre no log.

## 6. Atualização obrigatória (só conferir)

A Central passou a enviar `mandatoryNow`, que o Atualizador já lê; antes o campo
não vinha e nenhuma atualização era tratada como obrigatória. Nada a mudar no
código, mas confira em um terminal de teste o que o PDV faz quando o Atualizador
devolve `ATU_OBRIGATORIA`, porque esse caminho nunca era usado.

## 7. Liberação gradual (nada a fazer)

A Central pode liberar uma versão só para parte dos terminais. Para o PDV isso é
transparente: terminais fora do percentual recebem `available: false`.

## Pronto quando

- Atualizador e PDV compilam em Release.
- Contra uma Central de teste:
  - a primeira consulta grava `TerminalKey`; as chamadas seguintes (consulta,
    eventos, erros, tema) usam essa chave e funcionam;
  - depois disso, uma chamada com a chave global é recusada
    (`terminal_key_required`), confirmando que nada mais usa a global;
  - descartando a chave no painel, o terminal se recupera sozinho na consulta
    seguinte;
  - um erro enviado pelo PDV aparece decifrado no painel (prova de que a
    cifragem continua com a chave global);
  - os eventos do Integrador aparecem com o produto certo;
  - um executável alterado gera `currentAuthorized: false`.
- Diga quais arquivos mudaram e se algum outro projeto (Integrador, Backup)
  também chama a Central.
