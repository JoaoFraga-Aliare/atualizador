# Central de Atualização

Plataforma independente para distribuir atualizações. O back-end usa Express + SQLite, o painel usa Next.js + Material UI e o Nginx Windows entrega o front, encaminha `/api` e serve `/downloads`.

## Recursos

- Autocadastro de cliente e terminal na primeira consulta.
- Produtos e canais `test`, `beta` e `production`.
- Upload ZIP pelo painel e SHA-256 automático.
- Geração automática de `manifest.json` para todos os arquivos e diretórios do ZIP.
- Liberação para todos ou clientes selecionados.
- Dashboard, clientes, terminais, produtos e releases.
- Cliente Delphi inicial com download, backup e rollback.

## Pacotes ZIP

O ZIP pode ser enviado sem manifesto. Ao publicar a versão, o backend preserva a
estrutura de diretórios, calcula o SHA-256 de cada arquivo e grava um
`manifest.json` na raiz do pacote com o ID da publicação, produto, canal e
versão. Se o ZIP já contiver um manifesto na raiz, ele será substituído pelos
dados validados pelo servidor.

## Desenvolvimento local

Na raiz do projeto, execute:

```bash
npm run setup
npm run dev
```

O painel fica em `http://localhost:3000` e encaminha `/api` e `/downloads`
para o backend em `http://localhost:3333`. Na primeira preparação, o arquivo
`backend/.env` é criado a partir de `backend/.env.example`; altere as credenciais
antes de usar fora do ambiente local.

## GitHub Codespaces

O repositório contém `.devcontainer/devcontainer.json`. Ao criar um Codespace:

1. As dependências do backend e do frontend são instaladas automaticamente.
2. O arquivo local `backend/.env` é criado se ainda não existir.
3. Execute `npm run dev` no terminal.
4. Abra a porta **Painel web (3000)** na aba **Ports**.

Mantenha as portas privadas. A porta 3333 não precisa ser aberta no navegador,
pois o painel acessa a API pelo proxy da porta 3000.

O Codespace é um ambiente de desenvolvimento, não hospedagem permanente. O
SQLite e os pacotes em `packages/` não são versionados e podem ser perdidos ao
excluir o Codespace. Para produção, mantenha banco, artefatos e segredos em
armazenamento persistente.

## Publicação no GitHub

Banco de dados, arquivos `.env`, dependências, builds e pacotes de atualização
são ignorados pelo Git. Depois de criar um repositório vazio no GitHub:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

Não use `git add -f` para enviar banco, `.env` ou ZIPs de atualização. O código
Delphi pode ser editado no Codespace, mas sua compilação continua sendo feita no
Windows com o RAD Studio.

## Windows

Execute `windows/build-and-deploy.bat`. O destino padrão é `C:\UpdaterCentral`. Copie `nginx/updater-windows.conf` para o Nginx, ajuste o domínio e o `.env`. Mantenha o Node executando com NSSM ou PM2.

## Autocadastro

`POST /api/v1/updates/check`, com `Authorization: Bearer <INSTALLATION_KEY>`:

```json
{"client":{"id":"uuid-cliente","name":"Cliente Exemplo","document":"12345678000190"},"terminal":{"id":"uuid-terminal","name":"CAIXA 01","computerName":"PC-01","osVersion":"Windows 11"},"product":"pdv","channel":"production","currentVersion":"1.0.0"}
```

O UUID do terminal deve ser persistido. Uma release global atende clientes novos; a direcionada aparece para clientes que já fizeram uma consulta.

## Personalização remota do ERP

Administradores configuram Agrosys e Aliare por produto na aba **Produtos > Personalizar**. Cada tema possui uma configuração padrão e variantes opcionais por período, dias da semana ou datas específicas; entre variantes aplicáveis, vence a maior prioridade.

O ERP consulta a configuração vigente com a chave de instalação:

```http
GET /api/v1/config/themes/{codigoProduto}/{agrosys|aliare}?date=2026-12-24
Authorization: Bearer {INSTALLATION_KEY}
```

`date` é opcional. A resposta contém as configurações e URLs absolutas das imagens. Agrosys retorna somente logo e plano de fundo; Aliare também retorna fonte, cores, imagens de início e tamanho da logo interna (padrão 191 x 35).

Depois da primeira consulta, o ERP deve persistir `configuration.id` e `configuration.hash`. Nas próximas consultas, envie ambos para validar a configuração local:

```http
GET /api/v1/config/themes/pdv/aliare?currentThemeId=12&currentThemeHash=HASH_SALVO
Authorization: Bearer {INSTALLATION_KEY}
```

Resposta resumida:

```json
{
  "product": "pdv",
  "theme": "aliare",
  "referenceDate": "2026-09-01",
  "currentThemeValid": true,
  "configuration": {
    "id": 12,
    "hash": "sha256...",
    "settings": {
      "fontFamily": "Segoe UI",
      "borderColor": "#9e9e9e",
      "fontColor": "#212121",
      "errorColor": "#d32f2f",
      "gridSelectionColor": "#1976d2",
      "gridSelectionFontColor": "#ffffff",
      "logoWidth": 191,
      "logoHeight": 35
    },
    "logoUrl": "https://servidor/downloads/themes/...",
    "backgroundUrl": "https://servidor/downloads/themes/...",
    "startImageUrls": []
  }
}
```

Se `currentThemeValid` for `false`, o ERP deve baixar as imagens indicadas, aplicar cores e fonte e substituir o ID/hash armazenado pelos valores retornados. A validação considera tanto uma troca de variante por data quanto alterações feitas na configuração.

## Assinatura das publicações

Cada publicação é assinada com Ed25519. A chave privada fica em
`PACKAGE_SIGNING_KEY_PATH` (padrão `./data/package-signing-key.pem`) e é criada
na primeira execução. **Faça backup desse arquivo**: se ele for perdido, uma
nova chave é gerada e os atualizadores que conhecem só a antiga passam a
recusar todas as atualizações. Na inicialização, publicações sem assinatura ou
assinadas com outra chave são assinadas com a chave atual.

A chave pública fica em `GET /api/v1/packages/signing-key` (`publicKey` são os
32 bytes crus em Base64) e deve ser embutida no atualizador. A resposta do
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

O atualizador remonta esse texto com o produto e o canal que consultou, valida
a assinatura e depois confere o SHA-256 e o tamanho do arquivo baixado.

## Documentação da API

Com o backend em execução, acesse o Swagger UI em `http://localhost:3333/docs/`.
A especificação OpenAPI também está disponível em `http://localhost:3333/api-docs.json`.

## Segurança

- Use HTTPS e troque todas as credenciais.
- Restrinja escrita em `packages` ao back-end.
- Tudo em `packages` é público em `/downloads`. Os backups de banco enviados
  pelos terminais ficam em `DATABASE_BACKUPS_PATH` (padrão `./data/bancos`) e só
  saem pelas rotas autenticadas do painel. Na inicialização, backups antigos em
  `packages/bancos` são movidos para lá automaticamente.
- Falhas de autenticação são limitadas por IP em janelas de 15 minutos e
  respondem `429 too_many_attempts`: `LOGIN_MAX_FAILURES` (padrão 10, por IP e
  usuário), `LOGIN_IP_MAX_FAILURES` (50, por IP) e
  `INSTALLATION_KEY_MAX_FAILURES` (30, chave de instalação inválida). Só as
  falhas contam, então vários caixas atrás do mesmo IP não são bloqueados.
- Nunca sobrescreva um ZIP publicado.
- Evolua a chave global para uma chave por cliente.
- Adicione assinatura digital; SHA-256 valida integridade, não autoria.
