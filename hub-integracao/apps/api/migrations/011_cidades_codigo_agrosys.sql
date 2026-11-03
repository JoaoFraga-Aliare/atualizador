-- Cidades: o codigo que o PDV usa (cid_cidade) e a numeracao INTERNA do Agrosys, nao o codigo IBGE.
-- Por isso `codigo` continua sendo o codigo do PDV e o IBGE vira uma coluna propria (unica).
alter table cidades add column codigo_ibge integer;
update cidades set codigo_ibge = codigo where codigo_ibge is null;
alter table cidades alter column codigo_ibge set not null;
create unique index cidades_ibge_uq on cidades (codigo_ibge);

-- Numeracao ja existente: aproveita as cidades que o Agrosys sincronizou por empresa (cid_cidade x cid_ibge),
-- uma linha por codigo IBGE (a mais recente). O que nao tiver cid_ibge fica de fora.
insert into cidades (codigo, codigo_ibge, nome, uf, codigo_pais, populacao)
select distinct on (codigo_ibge) codigo, codigo_ibge, nome, uf, codigo_pais, populacao from (
  select (dados->>'cid_cidade')::int as codigo, (dados->>'cid_ibge')::int as codigo_ibge,
         coalesce(dados->>'cid_nome', '') as nome, coalesce(dados->>'est_estado', '') as uf,
         coalesce((dados->>'pai_pais')::int, 1058) as codigo_pais, (dados->>'populacao')::int as populacao, seq
    from sync_rows
   where entidade = 'cities' and not excluido
     and dados->>'cid_cidade' ~ '^[0-9]+$' and dados->>'cid_ibge' ~ '^[0-9]+$'
) x
order by codigo_ibge, seq desc
on conflict do nothing;
