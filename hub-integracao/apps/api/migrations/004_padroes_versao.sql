-- Versao dos padroes de conexao da empresa: sobe quando mudam, e entra na versao
-- de configuracao que o terminal consulta (GET /v1/terminal/config).
alter table tenants add column padroes_versao integer not null default 0;
