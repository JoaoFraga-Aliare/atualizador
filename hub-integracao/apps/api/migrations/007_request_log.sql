-- Log de requisicoes: o que o terminal pediu ao Hub, o que o Hub pediu ao ERP e o que o sistema
-- do cliente fez na API. A linha (rota, status, tempo, resultado) fica por HUB_LOG_DIAS; os
-- corpos (texto grande: o que foi enviado/recebido) so por HUB_LOG_CORPO_HORAS e depois sao
-- apagados, mantendo a requisicao e o status.
create table request_log (
  id bigserial primary key,
  ocorrido_em timestamptz not null default now(),
  tenant_id uuid references tenants(id) on delete cascade,
  terminal_id uuid references terminals(id) on delete set null,
  canal text not null check (canal in ('terminal->hub', 'hub->erp', 'cliente->hub')),
  correlacao uuid,                    -- liga a chamada do terminal as chamadas ao ERP que ela gerou
  metodo text,
  rota text not null,                 -- ex.: /v1/sync/brands, /v1/terminal/ops/PDVCLIENTE
  operacao text,                      -- entidade, operacao do ERP ou tipo de envio
  status_http integer,
  resultado text not null check (resultado in ('ok', 'recusado', 'erro')),
  duracao_ms integer,
  itens integer,                      -- linhas devolvidas/recebidas, quando se aplica
  mensagem text,                      -- curta (limite 500)
  req_corpo text,                     -- ate 64 KB, sem segredos; apagado apos a janela
  resp_corpo text,
  corpo_expira_em timestamptz
);
create index request_log_tenant_idx on request_log (tenant_id, id desc);
create index request_log_terminal_idx on request_log (terminal_id, id desc);
create index request_log_corpo_idx on request_log (corpo_expira_em) where req_corpo is not null or resp_corpo is not null;
create index request_log_data_idx on request_log (ocorrido_em);
