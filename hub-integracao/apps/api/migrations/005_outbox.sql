-- Envios do terminal para o ERP (nota, movimento de caixa, e-mail). O Hub guarda, entrega
-- ao destino conforme a origem da empresa e acompanha o resultado.
--   pendente : aguarda entrega (origem agrosys: fila de tentativas; origem api: o sistema do
--              cliente busca em GET /v1/tenants/:id/outbox e confirma com .../ack)
--   enviado  : o destino aceitou
--   recusado : o destino respondeu com recusa de negocio (nao repete sozinho)
--   erro     : falha tecnica (rede/SOAP); repete com espera crescente
create table outbox (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  terminal_id uuid references terminals(id) on delete set null,
  tipo text not null check (tipo in ('nota', 'movimento-caixa', 'email')),
  chave text not null,                        -- idempotencia: o mesmo envio nao vai duas vezes
  payload jsonb not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'recusado', 'erro')),
  tentativas integer not null default 0,
  proxima_tentativa timestamptz not null default now(),
  mensagem text,
  resposta text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, tipo, chave)
);
create index outbox_fila_idx on outbox (status, proxima_tentativa);
