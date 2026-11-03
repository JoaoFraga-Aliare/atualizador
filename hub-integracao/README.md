# Hub

Hub multiempresa que o PDV Agrosys (Delphi) passa a consumir no lugar do SOAP direto do ERP. O ERP (ou adaptador do
player) envia **cadastros** ao Hub; o PDV lê os cadastros do Hub e envia o **movimento** (vendas, pedidos, notas) de volta.

Este repositório contém só o **esqueleto**: tenant/segurança completos e uma fatia vertical funcionando.

```
api/   Node 22 + TypeScript + Fastify + PostgreSQL (migrations SQL versionadas)
web/   Next.js (painel administrativo; consome a api/)
docs/referencia/pdv-schema.sql   pg_dump --schema-only do banco do PDV (fonte do espelho)
```

## Decisões

| Tema | Escolha | Motivo |
|---|---|---|
| Framework HTTP | **Fastify 5** | Mais simples de manter seguro (schema, hooks, `inject` para testes), plugins oficiais de helmet/rate-limit/cors, melhor desempenho que Express. |
| Migrations | Runner próprio (`api/src/migracoes.ts`) com arquivos `migrations/NNNN_nome.sql` | Sem dependência extra; SQL puro porque RLS/policies/triggers são o coração do modelo. Checksum impede editar migration aplicada. |
| Espelho do PDV | `api/scripts/gerar-espelho.mjs` gera SQL a partir do dump | Reprodutível; as 59 tabelas entram em lotes sem escrever 1.000+ colunas à mão. |
| Rotas de sincronização | Genéricas por tabela (`/v1/cadastros/:tabela`, `/v1/movimento/:tabela`) | A lista de tabelas e colunas aceitas vem do catálogo do Postgres (lista fechada); campos desconhecidos são rejeitados. |
| Rotas | Prefixo `/v1`, nomes em português | Contrato versionado. |
| Tokens | `hub_emp_…` / `hub_cx_…`, 256 bits aleatórios, só o **hash SHA-256** vai ao banco | Token já tem entropia alta; argon2 é para senhas. |
| Segredos em repouso | AES-256-GCM (`SEGREDOS_CHAVE`, `api/src/seguranca/cripto.ts`) | Colunas `*_cifrado(a)` em `empresa_fiscal` / `empresa_email`. |

### Modelo (migration 0001)

- `empresa` (dados cadastrais) + `empresa_fiscal` (certificado, CSC/idCSC, CSRT, ambiente, escalas) + `empresa_email` (SMTP).
- `caixa`: série/último número de NF-e e NFC-e **por caixa** (série única por empresa, garantida por índice), cota de
  caixas por empresa (trigger) e `parametros jsonb` com impressora/gaveta/balança/pinpad/TEF/comportamento.
  Estado de execução (`id_sessao`, `usu_logado`, `cai_status`, `cai_vlcaixa`) **não** é sincronizado.
- `usuario_hub` + `usuario_escopo` (tipo `geral` | `empresa` | `caixa`; várias linhas `empresa` = multiempresa).
  O nome evita colidir com a tabela `usuario` do ERP, que será espelhada como cadastro.
- `token_acesso` (empresa | caixa; expiração, revogação, rotação), `auditoria` (append-only para a aplicação).
- Ids do Agrosys (`emp_empresa`, `uni_unidade`, `fil_filial`, `*_hlg`, `*_cx`) permanecem como colunas de ids externos
  nas tabelas espelhadas e em `ids_externos jsonb` de empresa/caixa. `empresa_id` (uuid do Hub) é o tenant.
- Dados `tra_*`/`cid_*` embutidos no caixa vão para o cadastro `transportador` (a espelhar).

### Tabelas espelhadas (migration 0002, gerada)

- Cadastros: `produto`, `clifor`, `condpagto` — PK `(empresa_id, pk_original)`.
- Movimento: `venda` — PK `(empresa_id, id)` onde `id` é o UUID gerado no caixa (idempotência), com `caixa_id` e
  `UNIQUE (empresa_id, caixa_id, ven_codigo)`.
- `character(n)` do PDV vira `varchar(n)`. Toda linha tem `hub_versao` (cursor de polling incremental) e `hub_atualizado_em`.

### Segurança

- **RLS** em todas as tabelas de tenant (`FORCE`); a API roda com o papel `hub_app` (sem `BYPASSRLS`) e define por
  transação `app.empresa_id`, `app.caixa_id`, `app.papel` (`comTenant`) ou `app.admin` (`comAdmin`, painel).
  Cadastros: só o papel `empresa` escreve. Movimento: só o papel `caixa` escreve, e só como o próprio caixa; um caixa só lê o seu movimento.
  Isso vale **no banco**, mesmo que a camada da API erre.
- Autenticação por token com escopos: empresa = `cadastros:ler|escrever`; caixa = `cadastros:ler`, `movimento:escrever`.
  Falhas de autenticação retornam sempre a mesma resposta 401.
- helmet, CORS restrito (`WEB_ORIGEM`), rate limit global, `Authorization` redigido nos logs, auditoria nas gravações.
- Senhas: argon2 (dependência instalada; login ainda não implementado).

## Rodando em desenvolvimento

Requisitos: Node 22+, Docker (para o Postgres).

```bash
cp .env.example .env        # gere SEGREDOS_CHAVE conforme o comentário do arquivo
npm install
npm run db:up               # Postgres 17 via docker compose (cria os papéis hub_owner e hub_app)
npm run migrar              # aplica api/migrations
npm run seed:dev -w api     # empresa + caixa de dev; imprime os tokens uma vez
npm run dev                 # api em :3333 e web em :3000
```

Sem Docker, qualquer Postgres 15+ serve: crie o banco `hub`, um dono (`DATABASE_URL_MIGRATION`) e rode
`CREATE ROLE hub_app LOGIN NOBYPASSRLS PASSWORD '…'` (veja `docker/init-roles.sh`).

Testando a API:

```bash
curl http://127.0.0.1:3333/saude
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3333/v1/eu
```

### Scripts (raiz)

`npm run dev | build | lint | test | migrar | db:up`

### Testes

`npm test` sobe um **Postgres real embarcado** (pacote `embedded-postgres`, só dev) — não precisa de Docker — aplica as
migrations e roda os testes: token inválido/revogado/expirado, rotação, escopo errado, cadastros incrementais,
isolamento entre empresas por RLS (inclusive acesso direto ao banco), idempotência do envio, série repetida, cota,
auditoria imutável e cofre de segredos. Para usar outro banco vazio: `TEST_DATABASE_URL_DONO` e `TEST_DATABASE_URL_APP`.

## Adicionando mais tabelas do PDV

1. Acrescente os nomes em `CADASTROS`/`MOVIMENTOS` (variáveis de ambiente do gerador) e gere uma **nova** migration:
   `CADASTROS=cidade,estado MOVIMENTOS=pedido node api/scripts/gerar-espelho.mjs > api/migrations/0003_….sql`
2. Nunca edite migrations já aplicadas. As rotas genéricas descobrem as novas tabelas sozinhas.
3. Tabelas sem PK no PDV recebem `hub_id` (identity) e hoje não aceitam upsert pela rota genérica; defina a chave natural antes.

## Pendências e próximos passos

Validado nesta etapa: typecheck, 26 testes (Postgres real), build do `web/`. **Não validado:** `docker compose` (Docker
não existe na máquina de desenvolvimento) e o servidor via `npm run dev` contra o compose.

1. **Restante do espelho** (56 tabelas): cadastros `precoprodu, prepromo, prevolume, saldo, sal_lote, facliuni, cidade, bairro, estado, condpagto2, formapag, finalizadora, bandeira, credencia, imposto, excecimp, tabcfop, natoperacao, opernat, operacao, tlistap, cimarca, reprvend, comcrit, lprecond, usuario, transportador, agbanco, ocorrencia, tecagronomico, ftmotora, credor`; movimento `pedido, pedidoitem, pedidoitemlote, pagmov, nfscapa, nfsitem, nfexml, hisnfe, hisped, nfs_correcao_, operacaotef, afcaixa, hiscaixa, pendfin, vencparc, cheques`. Ignorar `bkp_*`, `agrosys_scripts`, `impostoOLD`.
   Atenção a tabelas de movimento com PK composta/ids locais ao caixa (ex.: `nfscapa` por `nfs_numero, nfs_serie`) e a filhas (`pedidoitem`) que referenciam o pai: hoje a unicidade é `(empresa_id, caixa_id, pk)`, falta a FK pai-filho por `id` do Hub.
2. **API administrativa**: login (argon2, sessão, MFA TOTP para admin geral), CRUD de empresa/caixa/usuário/vínculos, emissão/revogação/rotação de tokens via API (a lógica existe em `seguranca/tokens.ts`), edição dos segredos fiscais/SMTP com cifragem, atribuição de série/numeração por caixa.
3. **Cursor de polling**: `hub_versao` vem de sequence; transações longas podem publicar fora de ordem. Mitigar com janela de sobreposição no cliente ou ordenar por commit.
4. **Parâmetros do caixa**: hoje em `caixa.parametros` (jsonb); tipar as colunas mais usadas conforme o PDV consumir.
5. **Adaptador Agrosys** (SOAP wsagroServer01 → Hub) e adaptador do outro ERP.
6. **Deploy**: Dockerfile da api/web, compose de produção com reverse proxy e TLS, backup, rotação da `SEGREDOS_CHAVE` (hoje chave única; prever `chave_id` por registro).
7. **Painel**: login e lista reais de empresas/caixas em `web/` (hoje só esqueleto sem dados), sessão em cookie `HttpOnly`/`SameSite`.
8. Rate limit mais estrito por token/IP em falhas de autenticação; teste de carga básico.
