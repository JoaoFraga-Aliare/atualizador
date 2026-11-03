-- Monitoramento: alertas calculados pelo Hub (terminal sem contato, envios parados, certificado, ERP, webhook).
-- Cada alerta tem uma chave estavel; fica aberto enquanto a condicao existir e e resolvido sozinho quando some.
create table alertas (
  chave text primary key,                          -- ex.: terminal:<uuid>, envios:<tenant>, certificado:<tenant>
  tipo text not null,
  tenant_id uuid references tenants(id) on delete cascade,
  terminal_id uuid references terminals(id) on delete cascade,
  titulo text not null,
  detalhe text not null default '',
  aberto_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),     -- ultima avaliacao em que a condicao ainda existia
  resolvido_em timestamptz
);
create index alertas_abertos_idx on alertas (resolvido_em, aberto_em desc);
-- limites e liga/desliga dos alertas (vazio = padroes do Hub)
alter table log_config add column alertas jsonb not null default '{}'::jsonb;
