-- Chaves de API da empresa: o sistema do cliente (origem API) envia o catalogo com
--   POST /v1/<entidade>   Authorization: Bearer hk_...
-- A chave identifica a empresa (nao ha id na URL). No banco fica so o hash e o prefixo.
create table api_keys (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  chave_hash text not null,
  prefixo text not null,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);
create unique index api_keys_hash_uq on api_keys (chave_hash);
create index api_keys_tenant_idx on api_keys (tenant_id);
