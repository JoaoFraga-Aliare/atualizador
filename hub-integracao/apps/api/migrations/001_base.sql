-- Compativel com PostgreSQL 10+ (sem gen_random_uuid: ids gerados na aplicacao).

create table tenants (
  id uuid primary key,
  nome text not null,
  documento text,
  provider text not null default 'agrosys',
  provider_config jsonb not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table users (
  id uuid primary key,
  email text not null,
  nome text not null,
  senha_hash text,                       -- null = conta so por SSO
  is_super boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));

-- Identidade desacoplada do metodo de login: hoje 'password'; SSO entra como
-- novas linhas (provider 'oidc:<issuer>', subject = sub do token).
create table identities (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  subject text not null,
  criado_em timestamptz not null default now(),
  unique (provider, subject)
);

create table memberships (
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  papel text not null check (papel in ('tenant_admin', 'integracao')),
  primary key (user_id, tenant_id)
);

create table terminals (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  codigo_legado text,                    -- cai_codigo do PDV
  ativo boolean not null default true,
  token_versao integer not null default 1,
  pareamento_hash text,
  pareamento_expira timestamptz,
  ultimo_contato timestamptz,
  criado_em timestamptz not null default now()
);
create index terminals_tenant_idx on terminals (tenant_id);
create unique index terminals_pareamento_uq on terminals (pareamento_hash) where pareamento_hash is not null;

create sequence sync_seq;

-- Estado atual de cada linha de cada entidade, por tenant. Upsert apenas: o
-- ERP nao exclui, so inativa (campo da propria entidade).
create table sync_rows (
  tenant_id uuid not null references tenants(id) on delete cascade,
  entidade text not null,
  chave text not null,
  dados jsonb not null,
  hash text not null,
  seq bigint not null default nextval('sync_seq'),
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, entidade, chave)
);
create index sync_rows_seq_idx on sync_rows (tenant_id, entidade, seq);

create table sync_runs (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  entidade text not null,
  origem text not null,                  -- 'api' | 'provider:agrosys'
  iniciado_em timestamptz not null default now(),
  duracao_ms integer,
  lidas integer not null default 0,
  mudadas integer not null default 0,
  erro text
);
create index sync_runs_idx on sync_runs (tenant_id, entidade, iniciado_em desc);
