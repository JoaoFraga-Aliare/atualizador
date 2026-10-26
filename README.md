# Central de Atualização

Plataforma para distribuir atualizações do PDV, do Integrador e de outros produtos
Delphi e acompanhar os terminais dos clientes. O backend usa Express + SQLite, o
painel usa Next.js + Material UI e, em produção, o Nginx entrega o painel,
encaminha `/api` e serve `/downloads`.

O cliente Delphi (Atualizador do PDV) fica em outro repositório
(`PDV\atualizador`).

## Recursos

- Autocadastro de cliente e terminal na primeira consulta, com chave própria por
  terminal emitida pela Central.
- Produtos e canais `test`, `beta` e `production`.
- Publicação de pacote ZIP (com `manifest.json` gerado pelo servidor) ou script
  SQL, pelo painel ou pelo CI (token de API por usuário).
- Liberação para todos, para clientes selecionados e gradual (percentual de
  terminais).
- Assinatura Ed25519 de cada publicação.
- Erros de produção cifrados, backups de banco sob demanda, canal ao vivo
  (WebSocket) e personalização remota do tema do ERP.

## Estrutura

```text
backend/
  src/index.js          ponto de entrada (sobe o servidor)
  src/app.js            monta banco, middlewares, rotas e WebSocket
  src/routes/           rotas: terminal, account, ci-upload, admin-*
  src/db.js             migrações versionadas (PRAGMA user_version)
  src/terminal-keys.js  chave própria por terminal
  src/sessions.js       sessões do painel (cookie httpOnly)
  src/release-signature.js, package-manifest.js, release.js, ...
  test/                 testes unitários e de rotas (sobem a API real)
frontend/app/           painel (dashboard/page.js + componentes)
deploy/                 Nginx e script de instalação no Windows
```

## Desenvolvimento local

Na raiz do projeto:

```bash
npm run setup
npm run dev
```

O painel fica em `http://localhost:3000` e encaminha `/api` e `/downloads` para a
API em `http://localhost:3333`. Na primeira preparação, `backend/.env` é criado a
partir de `backend/.env.example`; troque as credenciais antes de usar fora do
ambiente local.

| Comando                | O que faz                                    |
| ---------------------- | -------------------------------------------- |
| `npm test`             | testes do backend (unitários e de rotas)     |
| `npm run lint`         | ESLint em todo o projeto                     |
| `npm run format`       | formata com Prettier                         |
| `npm run format:check` | confere a formatação sem alterar             |
| `npm run build`        | gera o painel estático em `frontend/out`     |

Para mudar o banco, acrescente um passo no fim de `MIGRATIONS` em
`backend/src/db.js`; nunca altere um passo já publicado.

## Configuração (`backend/.env`)

| Variável                        | Padrão                            | Uso                                                                 |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `PORT`                          | `3333`                            | Porta da API                                                        |
| `DATABASE_PATH`                 | `./data/updater.db`               | Banco SQLite                                                        |
| `PACKAGES_PATH`                 | `./packages`                      | Pacotes publicados (público em `/downloads`)                        |
| `DATABASE_BACKUPS_PATH`         | `./data/bancos`                   | Backups de banco dos terminais (privado)                            |
| `PACKAGE_SIGNING_KEY_PATH`      | `./data/package-signing-key.pem`  | Chave privada Ed25519 (criada na 1ª execução)                       |
| `DOWNLOAD_BASE_URL`             | vazio                             | Prefixo das URLs de download (ex.: `/downloads`)                    |
| `ADMIN_USER` / `ADMIN_PASSWORD` | —                                 | Primeiro administrador (criado se não houver nenhum)                |
| `JWT_SECRET`                    | —                                 | Assinatura das sessões do painel                                    |
| `INSTALLATION_KEY`              | —                                 | Chave global dos terminais (primeiro contato e cifragem dos erros)  |
| `TERMINAL_KEY_ENFORCEMENT`      | `confirmed`                       | `off` mantém a chave global aceita para terminais com chave própria |
| `TRUST_PROXY`                   | `1`                               | Saltos de proxy confiáveis (Nginx)                                  |
| `LOGIN_MAX_FAILURES`            | `10`                              | Falhas de login por IP e usuário em 15 min                          |
| `LOGIN_IP_MAX_FAILURES`         | `50`                              | Falhas de login por IP em 15 min                                    |
| `INSTALLATION_KEY_MAX_FAILURES` | `30`                              | Chaves de terminal inválidas por IP em 15 min (HTTP e WebSocket)    |
| `HEALTH_MIN_FREE_MB`            | `1024`                            | Espaço livre mínimo para o `/health` responder 200                  |
| `LOG_FORMAT`                    | `json`                            | `combined` volta ao log de acesso no formato do Apache              |
| `APP_TIME_ZONE`                 | `America/Sao_Paulo`               | Fuso usado nas análises por dia                                     |
| `ERROR_JSON_LIMIT`              | `12mb`                            | Tamanho máximo do corpo JSON (erros com print)                      |

## Instalação no Windows

1. Instale Node.js 22 e Nginx.
2. Na raiz do repositório, execute `deploy\windows\build-and-deploy.bat`
   (destino padrão `C:\UpdaterCentral`). O script gera o painel, copia backend e
   painel e instala as dependências. Ele não apaga `backend\.env`,
   `backend\data` nem `packages`.
3. Ajuste `C:\UpdaterCentral\backend\.env` (senhas, `JWT_SECRET`,
   `INSTALLATION_KEY`).
4. Registre o serviço com NSSM (comandos impressos no fim do script).
5. Copie `deploy\nginx\updater-windows.conf` para o Nginx e ajuste domínio e
   certificados.
6. Faça backup de `C:\UpdaterCentral\backend\data`: banco, backups dos terminais e
   a chave de assinatura.

O `GET /health` confere o banco e o espaço livre e responde 503 quando algo
falha; use-o no monitoramento.

## Consulta de atualização e chave do terminal

`POST /api/v1/updates/check`, com `Authorization: Bearer <chave>`:

```json
{
  "client": { "id": "uuid-cliente", "name": "Cliente Exemplo", "document": "12345678000190" },
  "terminal": { "id": "uuid-terminal", "name": "CAIXA 01", "computerName": "PC-01", "osVersion": "Windows 11" },
  "product": "pdv",
  "channel": "production",
  "currentVersion": "1.0.0",
  "currentExecutableHash": "sha256 do executável em uso (opcional)"
}
```

O UUID do terminal deve ser persistido. Na primeira consulta (com a
`INSTALLATION_KEY`), a resposta traz `terminalKey`. O terminal deve guardar essa
chave e usá-la no lugar da global em todas as chamadas (consulta, eventos, erros,
tema, backup de banco e WebSocket). Ao ser usada pela primeira vez, a chave fica
confirmada e a chave global deixa de valer para aquele terminal
(`401 terminal_key_required`). Usar a chave com outro `terminalId` responde
`403 terminal_mismatch`. Se o terminal perder a chave (reinstalação), descarte-a
no painel (Clientes > terminais > ícone de chave); a próxima consulta emite outra.

A resposta também traz `mandatory` e `mandatoryNow` (obrigatória por
configuração ou prazo vencido), dados do arquivo (`downloadUrl`, `sha256`,
`sizeBytes`) e a assinatura. Publicações com liberação gradual só aparecem para
a fração de terminais escolhida; aumentar o percentual apenas acrescenta
terminais.

## Pacotes ZIP

O ZIP pode ser enviado sem manifesto. Ao publicar, o backend preserva a estrutura
de diretórios, calcula o SHA-256 de cada arquivo e grava um `manifest.json` na
raiz do pacote com o ID da publicação, produto, canal, versão e `entryPoint`. Um
manifesto já existente no ZIP é substituído pelos dados validados pelo servidor.

## Assinatura das publicações

Cada publicação é assinada com Ed25519. A chave privada fica em
`PACKAGE_SIGNING_KEY_PATH` e é criada na primeira execução. **Faça backup desse
arquivo**: se ele for perdido, uma nova chave é gerada e os atualizadores que
conhecem só a antiga passam a recusar todas as atualizações. Na inicialização,
publicações sem assinatura ou assinadas com outra chave são assinadas com a chave
atual.

A chave pública fica em `GET /api/v1/packages/signing-key` (`publicKey` são os 32
bytes crus em Base64) e deve ser embutida no atualizador. A resposta do
`/updates/check` traz `signature`, `signatureKeyId`, `signatureAlgorithm` e
`signedPayloadFormat`. O texto assinado tem uma linha por campo, separadas por
`\n`, em UTF-8 e sem `\n` final:

```text
agrosys-release-v1
releaseId=42
product=pdv
channel=production
version=2.3.1.0
sha256=<sha256 do arquivo, minúsculo>
sizeBytes=1048576
```

O atualizador remonta esse texto com o produto e o canal que consultou, valida a
assinatura e depois confere o SHA-256 e o tamanho do arquivo baixado. O que o
Atualizador do PDV precisa fazer está em
[PROMPT_PDV_ASSINATURA_PACOTES.md](PROMPT_PDV_ASSINATURA_PACOTES.md) e
[PROMPT_PDV_MELHORIAS.md](PROMPT_PDV_MELHORIAS.md).

## Personalização remota do ERP

Administradores configuram Agrosys e Aliare por produto em **Produtos >
Personalizar**. Cada tema tem uma configuração padrão e variantes opcionais por
período, dias da semana ou datas específicas; entre variantes aplicáveis, vence a
maior prioridade.

```http
GET /api/v1/config/themes/{codigoProduto}/{agrosys|aliare}?date=2026-12-24
Authorization: Bearer {chave do terminal}
```

`date` é opcional. Agrosys retorna somente logo e plano de fundo; Aliare também
retorna fonte, cores, imagens de início e tamanho da logo interna (padrão
191 x 35). Depois da primeira consulta, o ERP deve persistir `configuration.id` e
`configuration.hash` e enviá-los nas próximas
(`?currentThemeId=12&currentThemeHash=HASH_SALVO`). Se `currentThemeValid` vier
`false`, o ERP baixa as imagens, aplica cores e fonte e troca o ID/hash
guardado.

## Painel e CI

O login do painel grava o cookie `central_session` (httpOnly, SameSite=Strict,
8 horas); o JWT não fica no navegador. Sair revoga a sessão, e desativar um
usuário revoga as sessões dele. O pipeline de CI usa um token de API do usuário
(escopo de produtos e canais); veja [backend/CI-CD-FRONTEND.md](backend/CI-CD-FRONTEND.md)
e `backend/scripts/build-and-upload.bat`.

## Documentação da API

Com o backend em execução, o Swagger UI fica em `http://localhost:3333/docs/` e a
especificação OpenAPI em `http://localhost:3333/api-docs.json`.

## Segurança

- Use HTTPS e troque todas as credenciais do `.env.example`.
- Tudo em `packages` é público em `/downloads`. Backups de banco dos terminais
  ficam em `DATABASE_BACKUPS_PATH` e só saem pelas rotas autenticadas do painel.
- Falhas de autenticação são limitadas por IP (`429 too_many_attempts`); só as
  falhas contam, então vários caixas atrás do mesmo IP não são bloqueados.
- Cada terminal recebe chave própria; a `INSTALLATION_KEY` continua necessária
  para o primeiro contato e para cifrar os erros, então mantenha-a em segredo.
- A chave de assinatura fica no mesmo servidor que publica. Proteja
  `backend/data` e restrinja o acesso ao servidor.
- Nunca sobrescreva um ZIP publicado.

## GitHub Codespaces

O repositório contém `.devcontainer/devcontainer.json`: as dependências são
instaladas e `backend/.env` é criado automaticamente. Execute `npm run dev` e
abra a porta **Painel web (3000)** (mantenha as portas privadas). O Codespace é
ambiente de desenvolvimento: banco e pacotes podem ser perdidos ao excluí-lo.
