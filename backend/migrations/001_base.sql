-- Traducao do esquema base (antes em SQLite/better-sqlite3) para PostgreSQL.
-- IDs mantidos como integer/serial (nao uuid) para preservar a numeracao existente na migracao dos dados.

create table product(
  id serial primary key,
  code text not null unique,
  name text not null,
  active integer not null default 1,
  created_at timestamptz not null default now()
);

create table client(
  id serial primary key,
  external_id text not null unique,
  name text not null,
  document text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table terminal(
  id serial primary key,
  external_id text not null unique,
  client_id integer not null references client(id),
  name text not null,
  computer_name text,
  product_code text not null,
  channel text not null default 'production',
  current_version text not null default '0.0.0',
  os_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  artifact_type text not null default 'package',
  executable_sha256 text,
  executable_status text,
  api_key_hash text,
  api_key_issued_at timestamptz,
  api_key_confirmed_at timestamptz
);
create unique index idx_terminal_api_key on terminal(api_key_hash) where api_key_hash is not null;

create table release(
  id serial primary key,
  product_id integer not null references product(id),
  version text not null,
  channel text not null check(channel in ('test','beta','production')),
  file_path text not null,
  sha256 text not null,
  size_bytes integer not null,
  mandatory integer not null default 0,
  minimum_version text,
  notes text,
  active integer not null default 1,
  published_at timestamptz not null default now(),
  artifact_type text not null default 'package',
  original_name text,
  deadline_at timestamptz,
  blocked integer not null default 0,
  technical_notes text,
  show_notes_pdv integer not null default 0,
  published_by integer,
  executable_sha256 text,
  deleted_at timestamptz,
  deleted_by integer,
  signature text,
  signature_key_id text,
  rollout_percent integer not null default 100,
  unique(product_id,version,channel)
);

create table ci_artifact(
  id text primary key,
  user_id integer,
  product_code text not null,
  version text not null,
  channel text not null check(channel in ('test','beta','production')),
  file_path text not null,
  original_name text not null,
  sha256 text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  release_id integer,
  api_token_id integer
);

create table release_target(
  id serial primary key,
  release_id integer not null references release(id) on delete cascade,
  target_type text not null check(target_type in ('all','client')),
  client_id integer references client(id),
  check((target_type='all' and client_id is null) or (target_type='client' and client_id is not null)),
  unique(release_id,client_id)
);

create table terminal_event(
  id serial primary key,
  terminal_id integer references terminal(id),
  previous_version text,
  target_version text,
  status text not null,
  message text,
  ip text,
  created_at timestamptz not null default now(),
  release_id integer
);

create table terminal_database_request(
  id serial primary key,
  terminal_id integer not null unique references terminal(id) on delete cascade,
  requested_at timestamptz default now(),
  requested_by integer,
  last_upload_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table terminal_database_upload(
  id serial primary key,
  terminal_id integer not null references terminal(id) on delete cascade,
  file_path text not null,
  original_name text not null,
  sha256 text not null,
  size_bytes integer not null,
  ip text,
  received_at timestamptz not null default now()
);

create table terminal_database_setting(
  id integer primary key check(id=1),
  retention_days integer not null default 30,
  retention_count integer not null default 5,
  updated_at timestamptz not null default now()
);
insert into terminal_database_setting(id,retention_days,retention_count) values(1,30,5);

create table terminal_live_event(
  id serial primary key,
  terminal_id integer references terminal(id) on delete set null,
  type text not null,
  name text not null,
  operation text not null,
  value_text text,
  received_at timestamptz not null default now(),
  ip text
);

create table application_error(
  id serial primary key,
  terminal_id integer references terminal(id),
  product_code text not null default 'pdv',
  occurred_at timestamptz not null,
  version text,
  terminal_name text,
  checkout_number text,
  computer_name text,
  mac_address text,
  user_name text,
  session_id text,
  exception_class text not null,
  message text not null,
  stack_trace text,
  screenshot_base64 text,
  screenshot_mime text,
  ip text,
  received_at timestamptz not null default now(),
  key_terminal_id text,
  crypto_salt text,
  crypto_iv text,
  crypto_auth_tag text,
  encrypted_payload text,
  reported_executable_sha256 text,
  detected_release_id integer,
  executable_hash_status text
);

create table error_setting(
  id integer primary key check(id=1),
  store_screenshot integer not null default 0
);
insert into error_setting(id,store_screenshot) values(1,0);

create table error_rule(
  id serial primary key,
  signature text not null,
  product_code text not null,
  ignored integer not null default 0,
  fixed_release_id integer references release(id) on delete set null,
  created_by integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(signature,product_code)
);

create table app_user(
  id serial primary key,
  username text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'operator' check(role in ('admin','operator')),
  active integer not null default 1,
  created_at timestamptz not null default now(),
  hub_role text check(hub_role is null or hub_role='developer'),
  api_token_hash text,
  api_token_created_at timestamptz
);

create table user_product(
  user_id integer not null references app_user(id) on delete cascade,
  product_id integer not null references product(id) on delete cascade,
  primary key(user_id,product_id)
);

create table user_channel(
  user_id integer not null references app_user(id) on delete cascade,
  channel text not null check(channel in ('test','beta','production')),
  primary key(user_id,channel)
);

create table api_token_product(
  user_id integer not null references app_user(id) on delete cascade,
  product_id integer not null references product(id) on delete cascade,
  primary key(user_id,product_id)
);

create table api_token_channel(
  user_id integer not null references app_user(id) on delete cascade,
  channel text not null check(channel in ('test','beta','production')),
  primary key(user_id,channel)
);

create table notification_read(
  user_id integer not null references app_user(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key(user_id,notification_key)
);

create table product_theme(
  id serial primary key,
  product_id integer not null references product(id) on delete cascade,
  theme text not null check(theme in ('agrosys','aliare')),
  name text not null default 'Padrão',
  is_default integer not null default 0,
  priority integer not null default 0,
  start_date text,
  end_date text,
  weekdays text,
  specific_dates text,
  settings text not null default '{}',
  logo_path text,
  background_path text,
  start_images text not null default '[]',
  active integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_product_theme_default on product_theme(product_id,theme) where is_default=1;
create index idx_product_theme_lookup on product_theme(product_id,theme,active,priority desc);

create table admin_session(
  id text primary key,
  user_id integer not null references app_user(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip text,
  user_agent text
);
create index idx_admin_session_user on admin_session(user_id,revoked_at);

create table api_token(
  id serial primary key,
  user_id integer not null references app_user(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create table api_token_item_product(
  token_id integer not null references api_token(id) on delete cascade,
  product_id integer not null references product(id) on delete cascade,
  primary key(token_id,product_id)
);

create table api_token_item_channel(
  token_id integer not null references api_token(id) on delete cascade,
  channel text not null check(channel in ('test','beta','production')),
  primary key(token_id,channel)
);

create table ci_artifact_channel(
  artifact_id text not null references ci_artifact(id) on delete cascade,
  channel text not null check(channel in ('test','beta','production')),
  primary key(artifact_id,channel)
);

create table hub_user_tenant(
  user_id integer not null references app_user(id) on delete cascade,
  tenant_id text not null,
  kind text not null check(kind in ('homologation','client')),
  approved_at timestamptz,
  approved_by integer references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_missing integer,
  primary key(user_id,tenant_id)
);
create index idx_hub_user_tenant_tenant on hub_user_tenant(tenant_id);

create table hub_user_profile(
  user_id integer primary key references app_user(id) on delete cascade,
  document text,
  company text,
  contact_name text,
  contact_email text,
  contact_phone text
);

create index idx_release_lookup on release(product_id,channel,active,published_at desc);
create index idx_terminal_client on terminal(client_id,last_seen_at desc);
create index idx_event_terminal on terminal_event(terminal_id,created_at desc);
create index idx_event_created_at on terminal_event(created_at desc);
create index idx_event_release on terminal_event(release_id,created_at desc);
create index idx_database_upload_terminal on terminal_database_upload(terminal_id,received_at desc);
create index idx_live_event_terminal on terminal_live_event(terminal_id,received_at desc);
create index idx_application_error_received on application_error(received_at desc);
create index idx_application_error_terminal on application_error(terminal_id,received_at desc);
create index idx_error_rule_signature on error_rule(signature,product_code);
create index idx_api_token_user on api_token(user_id,created_at desc);
create index idx_ci_artifact_token on ci_artifact(api_token_id,created_at desc);
