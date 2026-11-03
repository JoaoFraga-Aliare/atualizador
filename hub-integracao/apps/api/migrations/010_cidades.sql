-- Cidades: cadastro UNICO do Hub (nao mais por empresa/terminal). Carga inicial pela API do IBGE;
-- o codigo da cidade e o codigo IBGE do municipio (7 digitos). O terminal recebe pela sincronizacao
-- normal (/v1/sync/cities), lendo daqui (seq global: sobe a cada mudanca).
create table cidades (
  codigo integer primary key,
  nome text not null,
  uf text not null,
  codigo_pais integer not null default 1058,   -- Brasil
  populacao integer,
  seq bigint not null default nextval('sync_seq'),
  atualizado_em timestamptz not null default now()
);
create index cidades_seq_idx on cidades (seq);
create index cidades_uf_idx on cidades (uf);

create table cidades_cargas (
  id bigserial primary key,
  origem text not null,                -- 'ibge'
  iniciado_em timestamptz not null default now(),
  duracao_ms integer,
  lidas integer not null default 0,
  novas integer not null default 0,
  alteradas integer not null default 0,
  erro text
);
