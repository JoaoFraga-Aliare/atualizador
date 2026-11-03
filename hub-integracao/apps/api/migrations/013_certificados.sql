-- Certificado digital A1 (.pfx) da empresa, guardado CIFRADO (envelope): o arquivo e a senha sao cifrados
-- com uma chave de dados propria (AES-256-GCM) e essa chave e cifrada com a chave-mestra, que fica FORA do
-- banco (HUB_CERT_MASTER_KEY / HUB_CERT_KEY_FILE). So os metadados ficam em claro.
create table certificados (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  versao integer not null default 1,                -- sobe a cada troca; o terminal compara e baixa
  nome text not null,                               -- nome do arquivo informado no envio
  pfx_cifrado text not null,
  senha_cifrada text not null,
  chave_cifrada text not null,                      -- chave de dados, cifrada com a chave-mestra
  titular text not null,
  cnpj text,
  serie text not null,                              -- numero de serie do certificado (hex)
  impressao text not null,                          -- SHA-1 do certificado
  valido_de timestamptz not null,
  valido_ate timestamptz not null,
  enviado_por text not null,
  enviado_em timestamptz not null default now()
);

-- Quem enviou, removeu ou baixou (terminal) o certificado.
create table certificado_acessos (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  evento text not null check (evento in ('envio', 'remocao', 'download')),
  versao integer,
  terminal_id uuid references terminals(id) on delete set null,
  usuario text,
  ip text,
  em timestamptz not null default now()
);
create index certificado_acessos_tenant_idx on certificado_acessos (tenant_id, id desc);
