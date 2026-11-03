-- Origem da integracao da empresa: 'agrosys' (o Hub busca no ERP) ou 'api'
-- (o sistema do cliente envia pela API do Hub).
update tenants set provider = 'api' where provider = 'rest';
alter table tenants add constraint tenants_origem_chk check (provider in ('agrosys', 'api'));
-- provider_config guarda {"padroes": {...}}: valores padrao da empresa (conexao com o
-- Agrosys: URL, empresa, unidade, filial...) herdados por todos os terminais.

-- Parametros do caixa (antes a tabela caixa do PDV) configurados por terminal.

create table terminal_settings (
  terminal_id uuid primary key references terminals(id) on delete cascade,
  valores jsonb not null default '{}',
  versao integer not null default 1,        -- sobe a cada mudanca; o terminal pede desde=<versao>
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references users(id)
);
