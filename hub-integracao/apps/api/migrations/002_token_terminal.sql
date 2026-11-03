-- Terminal conecta por token (gerado no gerencial, mostrado uma vez). No banco
-- fica so o hash SHA-256; o prefixo serve para o operador identificar qual token e.
drop index if exists terminals_pareamento_uq;
alter table terminals drop column if exists pareamento_hash;
alter table terminals drop column if exists pareamento_expira;
alter table terminals drop column if exists token_versao;
alter table terminals add column token_hash text;
alter table terminals add column token_prefixo text;
alter table terminals add column token_gerado_em timestamptz;
create unique index terminals_token_uq on terminals (token_hash) where token_hash is not null;
