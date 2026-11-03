# Hub — convenções

Hub multiempresa entre ERPs (players) e o PDV Agrosys. Leia o `README.md` para decisões e pendências.

## Idioma
Código (nomes de tabelas, colunas, rotas, funções), mensagens, commits e docs em **português**.

## Estrutura
- `api/` Fastify + TypeScript + PostgreSQL. `src/` (app, auth, db, esquema, rotas, seguranca), `migrations/*.sql`, `scripts/`, `test/`.
- `web/` Next.js (painel; só consome a api).
- `docs/referencia/pdv-schema.sql` é a fonte do espelho do PDV.

## Comandos
`npm install` · `npm run db:up` · `npm run migrar` · `npm run dev` · `npm test` · `npm run lint` · `npm run build`

## Regras
- Migrations: nunca editar uma já aplicada; criar `NNNN_nome.sql` novo. Tabelas espelhadas vêm de `api/scripts/gerar-espelho.mjs` (não editar à mão).
- Toda tabela de tenant tem `empresa_id` e RLS (`FORCE`). Acesso a dados só via `comTenant`/`comAdmin` (`api/src/db.ts`); a app roda como `hub_app`, nunca como dono.
- Cadastros: ERP → Hub (token **empresa**); PDV lê (token **caixa**). Movimento: PDV → Hub (token **caixa**), idempotente por UUID do caixa. Só venda/pedido/nota e movimentos têm `caixa_id`.
- Segurança: tokens só como hash e mostrados uma vez; senhas com argon2; segredos (`*_cifrad*`) com AES-GCM via `cofre`, nunca em listagens, logs ou auditoria; nunca commitar `.env`; nunca logar `Authorization`.
- Nome de tabela/coluna vindo do cliente nunca entra no SQL: usar a lista descoberta em `esquema.ts`.
- Mudou regra de autenticação, escopo ou RLS → acrescente teste em `api/test/`.
- Não conectar no banco real do PDV nem usar credenciais reais em dev/teste.
