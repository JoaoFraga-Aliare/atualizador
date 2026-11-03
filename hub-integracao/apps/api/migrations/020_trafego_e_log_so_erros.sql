-- Log so de erros: requisicoes que deram certo nao ficam mais uma a uma no request_log (a menos que gravar_sucesso esteja ligado, para
-- depurar). Elas viram CONTADORES por hora, que bastam para "conexao", resumo e consumo, e custam uma linha por hora em vez de uma por requisicao.
create table trafego_hora (
  tenant_id uuid not null references tenants(id) on delete cascade,
  terminal_id uuid not null default '00000000-0000-0000-0000-000000000000',   -- zero = sem terminal (ERP, sistema do cliente)
  canal text not null,
  operacao text not null default '',
  hora timestamptz not null,
  ok integer not null default 0,
  recusados integer not null default 0,
  erros integer not null default 0,
  ms_total bigint not null default 0,
  bytes_in bigint not null default 0,
  bytes_out bigint not null default 0,
  itens bigint not null default 0,
  primary key (tenant_id, terminal_id, canal, operacao, hora)
);
create index trafego_hora_hora_idx on trafego_hora (hora);

-- "ultima busca" e "ultima chamada ao Agrosys" (aparecem na tela de conexao) passam a ficar na propria linha do terminal/empresa
alter table terminals add column ultima_busca jsonb;
alter table terminals add column ultima_chamada_erp jsonb;
alter table tenants add column ultima_chamada_erp jsonb;

alter table log_config add column gravar_sucesso boolean not null default false;
