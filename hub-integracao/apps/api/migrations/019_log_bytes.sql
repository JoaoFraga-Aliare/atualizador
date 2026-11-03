-- Consumo por terminal: tamanho (bytes) do que entrou e do que saiu em cada requisicao. Fica mesmo depois que o conteudo e apagado.
alter table request_log add column req_bytes integer;
alter table request_log add column resp_bytes integer;

-- O ping nao entra no log de requisicoes (seria ruido); aqui fica so a contagem por terminal e por hora, para o relatorio de consumo.
create table terminal_pings (
  terminal_id uuid not null references terminals(id) on delete cascade,
  hora timestamptz not null,
  n integer not null default 0,
  primary key (terminal_id, hora)
);
