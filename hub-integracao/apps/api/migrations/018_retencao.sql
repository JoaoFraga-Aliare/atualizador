-- Retencao de dados: o Hub guarda so o necessario. Prazos em dias (vazio = padrao do Hub), editaveis em Hub > Logs > Configuracoes.
alter table log_config add column retencao jsonb not null default '{}'::jsonb;

-- Sobra de antes de as cidades virarem cadastro comum: ja estao na tabela cidades.
delete from sync_rows where entidade = 'cities';

-- Consultas de limpeza por data
create index if not exists outbox_status_data_idx on outbox (status, atualizado_em);
create index if not exists webhook_entregas_status_data_idx on webhook_entregas (status, atualizado_em);
create index if not exists sync_runs_data_idx on sync_runs (iniciado_em);
create index if not exists sync_rows_excluidos_idx on sync_rows (atualizado_em) where excluido;
