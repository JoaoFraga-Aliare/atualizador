-- Configuracao do log de requisicoes (menu Logs do administrador): retencao e quais erros geram notificacao.
-- dias_log / horas_corpo nulos = usar o padrao do ambiente (HUB_LOG_DIAS / HUB_LOG_CORPO_HORAS).
create table log_config (
  id int primary key check (id = 1),
  dias_log int check (dias_log between 1 and 3650),
  horas_corpo int check (horas_corpo between 1 and 720),
  notificar jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into log_config (id) values (1);
