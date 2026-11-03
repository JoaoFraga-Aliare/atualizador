-- Registros da origem API: id proprio (devolvido ao cliente ao salvar), exclusao e pausa.
-- Exclusao e pausa NAO apagam a linha do Hub: viram uma mudanca (seq novo) que o terminal recebe
-- como 'excluir' e que o Integrador aplica. Retomar/recriar volta a mandar 'upsert'.
alter table sync_rows add column id uuid;
update sync_rows set id = md5(random()::text || clock_timestamp()::text || chave)::uuid;
alter table sync_rows alter column id set not null;
create unique index sync_rows_id_uq on sync_rows (id);
alter table sync_rows add column excluido boolean not null default false;
alter table sync_rows add column pausado boolean not null default false;
