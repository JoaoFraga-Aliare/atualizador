# Banco de dados — Postgres + Docker

O backend do Atualizador deixou de usar SQLite e agora usa **PostgreSQL**, o mesmo
motor de banco do Hub de Integração. Cada aplicação mantém seu próprio banco, no
mesmo servidor/instância Postgres:

| Banco            | Usado por          |
|-------------------|---------------------|
| `hub_dev`         | Hub de Integração (`hub-integracao/apps/api`) |
| `atualizador_dev` | Backend do Atualizador (`backend/`) |

Nenhum dado ou schema é compartilhado entre os dois — são bancos independentes
dentro do mesmo servidor Postgres.

## Subindo o Postgres via Docker

```bash
cd docker
docker compose up -d
```

Isso inicia um container `postgres:16-alpine` (`atualizador-postgres`) expondo a
porta `5433` do host (configurável via `POSTGRES_PORT`), e cria automaticamente
os dois bancos (`hub_dev` e `atualizador_dev`) na primeira inicialização, através
do script `init-databases.sh`.

Variáveis de ambiente aceitas pelo `docker-compose.yml` (todas opcionais, com
valores padrão já compatíveis com o `.env.example` de cada app):

| Variável          | Padrão     |
|--------------------|------------|
| `POSTGRES_USER`     | `postgres` |
| `POSTGRES_PASSWORD` | `agrosys`  |
| `POSTGRES_PORT`     | `5433`     |

> **Importante — este arquivo não foi testado rodando de fato em Docker.**
> O ambiente onde esta migração foi feita não tinha o Docker CLI instalado, então
> a validação da parte de banco (schema, queries, tipos, fuso horário) foi feita
> contra uma instância Postgres nativa já em execução na porta 5433, e não contra
> este `docker-compose.yml`. O arquivo foi revisado com cuidado (imagem oficial,
> script de init no formato esperado por `/docker-entrypoint-initdb.d`, healthcheck
> padrão), mas recomendo rodar `docker compose up -d` e confirmar que os dois bancos
> sobem corretamente antes de depender dele em produção.

Para parar e remover o container (mantendo o volume de dados):

```bash
docker compose down
```

Para apagar também os dados (recomeçar do zero):

```bash
docker compose down -v
```

### Já tenho um Postgres rodando nativamente (sem Docker)

Se preferir não usar Docker, basta ter um Postgres acessível e criar os dois
bancos manualmente:

```sql
CREATE DATABASE hub_dev;
CREATE DATABASE atualizador_dev;
```

O `docker/` é só uma forma conveniente de ter esse Postgres sempre disponível em
desenvolvimento — ele não é exigido para o backend funcionar.

## Configurando o backend (`backend/.env`)

O backend lê a conexão via `DATABASE_URL` (substituiu a antiga `DATABASE_PATH`):

```
DATABASE_URL=postgres://postgres:agrosys@localhost:5433/atualizador_dev
```

Ajuste usuário, senha, host e porta conforme o seu Postgres. Veja
`backend/.env.example` para o restante das variáveis necessárias.

## Migrações de schema

O schema agora é versionado em `backend/migrations/*.sql` (mesmo padrão de
migrations do Hub). Elas rodam **automaticamente** a cada start do backend
(`npm start` / `node src/index.js`), antes do servidor aceitar requisições — não
é preciso rodar nada manualmente para criar as tabelas em um banco novo.

## Migrando os dados do SQLite antigo (`updater.db`)

Se você tem um `updater.db` (SQLite) com dados reais de produção/homologação e
quer trazê-los para o Postgres, use o script de migração **uma única vez**:

```bash
cd backend
DATABASE_URL=postgres://postgres:agrosys@localhost:5433/atualizador_dev \
  node scripts/migrate-sqlite-to-postgres.js caminho/para/updater.db
```

O que o script faz:
- Garante que o schema do Postgres já está migrado (`migrate()`).
- Copia os dados tabela por tabela, na ordem de dependência de chaves
  estrangeiras (produtos → usuários → clientes → terminais → releases → ...),
  preservando os IDs originais.
- Ajusta as sequences (`SERIAL`) do Postgres para continuar depois do maior ID
  migrado, evitando colisão em inserts futuros.
- É seguro executar mais de uma vez: cada tabela é truncada (`TRUNCATE ... CASCADE`)
  antes de receber os dados de novo — então rodar duas vezes só repete a cópia,
  não duplica nada.

**Atenção:** aponte `DATABASE_URL` para o banco Postgres de destino correto antes
de rodar — o script não pede confirmação e sobrescreve o conteúdo das tabelas
desse banco.

## O que mudou no código (resumo técnico)

- `backend/src/db.js` foi reescrito: mantém a mesma forma de uso do
  `better-sqlite3` (`db.prepare(sql).get/all/run(...params)`), mas agora é
  assíncrona e fala com Postgres via `pg`. Isso permitiu converter ~20 arquivos
  para `async`/`await` sem reescrever a maioria das queries.
- Diferenças de SQL entre SQLite e Postgres foram ajustadas: `group_concat` →
  `string_agg`, `date(col,'localtime')` → `(col AT TIME ZONE ?)::date::text`,
  `datetime('now','-N days')` → `now() - interval`, aliases que colidiam com
  palavras reservadas do Postgres (`value`, `role`) receberam `AS`, e aliases em
  camelCase (que o Postgres rebaixa para minúsculas se não forem citados) agora
  usam `AS "nomeCamelCase"` para preservar o formato esperado pelo frontend.
  Algumas consultas com `GROUP BY` precisaram incluir a chave da tabela
  relacionada (ex. `GROUP BY r.id, p.id`), já que o Postgres — diferente do
  SQLite — exige que toda coluna não agregada do `SELECT` apareça no `GROUP BY`
  ou seja dependente funcionalmente da chave primária.
- `better-sqlite3` foi removido das dependências de produção (fica só em
  `devDependencies`, usado pelo script de migração de dados).
- `pg` e `express-async-errors` foram adicionados como dependências.

## Verificação feita nesta migração

Antes de considerar a migração concluída, os seguintes fluxos foram testados de
ponta a ponta contra um Postgres real (banco descartável, depois removido):

- Login de admin, dashboard, listagem de produtos, usuários e erros.
- Publicação de release (upload multipart + transação manual + assinatura do
  pacote), cópia de release para outro canal, detalhes de release com analytics
  (instalações por dia, erros por dia).
- Registro de terminal/cliente (`/api/v1/updates/check`), eventos de atualização
  (`/api/v1/updates/events`) e eventos live (`/api/v1/live/events`).
- Limpeza de releases antigas (`/api/v1/admin/release-cleanup`).

Durante esses testes foram encontrados e corrigidos **6 bugs reais** introduzidos
pela migração (incompatibilidades SQLite→Postgres que só aparecem em runtime, não
em `node --check`):
1. Alias `value` sem `AS` (palavra reservada no Postgres) em 3 arquivos.
2. Alias `role` sem `AS` em `admin-hub.js`.
3. Aliases em camelCase sem aspas, que o Postgres rebaixava para minúsculas,
   quebrando o consumo no frontend (`admin-hub.js`, `admin-terminals.js`).
4. `GROUP BY` faltando a chave da tabela relacionada em duas consultas de
   `admin-releases.js`.
5. Mesmo parâmetro (`?`) usado em dois pontos de uma mesma query (`SELECT` e
   `GROUP BY`) sendo tratado como parâmetros distintos pelo driver — corrigido
   reestruturando a query com uma subconsulta.
6. Cálculo de `activeDays` em `release-history.js` que assumia o formato antigo
   de timestamp do SQLite (sem fuso) e acrescentava `Z` a uma string que já
   vinha em ISO-8601 completo do Postgres, gerando uma data inválida.
7. `backend/src/routes/admin-users.js` havia sido esquecido na conversão inicial
   e ainda usava chamadas síncronas e `group_concat` — convertido por completo.

Rotas que **não** foram exercitadas nesta rodada de testes (recomenda-se
verificar manualmente antes de ir para produção): `admin-errors` (análise com
erros reais / criptografados), `ci-artifacts`, `product-themes`, fluxo completo
de backup de banco do terminal (upload/download), WebSocket de eventos live, e
a suíte de testes existente em `backend/test/*.test.js` (que hoje assume chamadas
síncronas do `better-sqlite3` e provavelmente precisa ser adaptada para
`async`/`await`).
