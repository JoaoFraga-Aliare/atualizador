-- Dados enviados pelo Postman (cabecalho Referer: postman) sao de teste: ficam gravados e funcionam, mas NAO contam no
-- checklist de homologacao. Uma escrita que nao e do Postman limpa a marca (o dado passa a valer).
alter table sync_rows add column teste boolean not null default false;
alter table terminals add column teste boolean not null default false;
alter table certificados add column teste boolean not null default false;
