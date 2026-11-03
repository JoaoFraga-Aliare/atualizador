-- Webhooks (so empresas de origem API): tudo que o terminal devolve ao Hub (nota, movimento de caixa,
-- e-mail) e que hoje o sistema do cliente buscaria em GET /v1/tenants/:id/outbox tambem e DISPARADO
-- por HTTP POST para as URLs cadastradas, assinado com HMAC.
create table webhooks (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  url text not null,
  segredo_cifrado text not null,                 -- AES-GCM; o valor so aparece ao criar/regenerar
  segredo_prefixo text not null,
  eventos text[] not null default '{}',          -- vazio = todos os eventos
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index webhooks_tenant_idx on webhooks (tenant_id);

-- Uma linha por (webhook, evento): fila com tentativas e historico da resposta.
--   pendente : aguarda envio (ou nova tentativa na hora de proxima_tentativa)
--   enviado  : o destino respondeu 2xx
--   falhou   : esgotou as tentativas (da para reenviar pelo gerencial)
create table webhook_entregas (
  id bigserial primary key,
  webhook_id uuid not null references webhooks(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  outbox_id bigint references outbox(id) on delete set null,
  evento text not null,
  corpo text not null,                           -- envelope JSON exatamente como enviado
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou')),
  tentativas integer not null default 0,
  proxima_tentativa timestamptz not null default now(),
  codigo_http integer,
  resposta text,
  erro text,
  duracao_ms integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index webhook_entregas_fila_idx on webhook_entregas (status, proxima_tentativa);
create index webhook_entregas_tenant_idx on webhook_entregas (tenant_id, id desc);
create unique index webhook_entregas_outbox_uq on webhook_entregas (webhook_id, outbox_id) where outbox_id is not null;
