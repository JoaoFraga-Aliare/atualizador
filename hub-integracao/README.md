# Hub de Integracao

Monorepo (npm workspaces):

| Pacote | O que e |
|---|---|
| `packages/contracts` | Entidades (zod) geradas do catalogo da fase 1, hash canonico de linha, envelopes |
| `packages/providers` | Adaptador do Agrosys: monta `vdadosParam` e le `vdadosRetorno` (funcoes puras) |
| `apps/api` | API Express: login, tenants, usuario de integracao, terminais, ingestao, sync incremental |
| `apps/web` | Gerencial e documentacao (Next.js) |

Decisoes e modelo de sincronizacao: `../docs/hub/` (README, decisoes.md, 03-sincronizacao.md).

## Rodar
```bash
cp .env.example .env        # ajuste HUB_DATABASE_URL e HUB_JWT_SECRET
npm install
npm run migrate             # aplica apps/api/migrations
HUB_ADMIN_EMAIL=voce@x.com HUB_ADMIN_PASSWORD=uma-senha-longa npm run seed -w @hub/api
npm run dev:api             # :4000
PORT=3100 npm run dev:web   # :3000 por padrao; PORT muda
```
Postgres 10 ou superior (nada de gen_random_uuid: ids sao gerados na aplicacao).

## Log de requisicoes
Variaveis opcionais da API: `HUB_LOG_CORPO_HORAS` (padrao 6) e `HUB_LOG_DIAS` (padrao 60). Veja `../docs/hub/05-log-e-conexao.md`.

## Postman
`npm run postman` gera a collection e o ambiente em `../docs/hub/postman/` (veja `../docs/hub/12-postman.md`): todas as requisicoes enviam `Referer: postman`, que o Hub marca como teste e nao conta na homologacao.

## Piloto e monitoramento
`npm run consumo -- 72` mostra quanto os terminais consomem (requisicoes, trafego, banco) nas ultimas 72 h.
`npm run diagnostico` confere um Hub no ar (somente leitura); alertas em Hub > Logs > Alertas. Veja `../docs/hub/13-roteiro-piloto.md` e `11-operacao-seguranca.md`.

## Seguranca e producao
Atras de Nginx defina `HUB_TRUST_PROXY=1`; limites de taxa e checklist de implantacao em `../docs/hub/11-operacao-seguranca.md`.

## Testes
```bash
npm test                                         # contracts e providers
HUB_TEST_DATABASE_URL=postgres://.../hub_test npm test -w @hub/api   # banco descartavel: o teste recria o schema public
npm run typecheck
```

## Regenerar contratos
`npm run gerar` le `../docs/hub/catalogo.json` e `../tools/hub-catalogo/chaves.json`
(chaves primarias reais do banco; `tools/hub-catalogo/introspect-chaves.js` as atualiza).

## Proximos passos
- Servico de sincronizacao com o Agrosys (transporte SOAP + agendador por entidade) usando `packages/providers`.
- Cliente no Integrador (Delphi): conexao por token (`tk_...`, configurado uma vez) e `GET /v1/sync/{entidade}?desde=`.
- Escopo por terminal (filial, tabela de preco, inativos) e monitoramento no gerencial.
- SSO (OIDC): novas linhas em `identities`; a API ja so conhece o JWT do Hub.
- Endurecimento: limite de tentativas de login, auditoria, RLS por tenant.
