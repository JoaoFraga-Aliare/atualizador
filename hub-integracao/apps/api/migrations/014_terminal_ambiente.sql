-- Ambiente do terminal: producao (vende de verdade) ou homologacao (testes do integrador / SEFAZ de homologacao).
alter table terminals add column ambiente text not null default 'producao' check (ambiente in ('producao', 'homologacao'));
