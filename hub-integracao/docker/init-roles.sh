#!/bin/sh
# Cria o papel da aplicação (sem BYPASSRLS) usado pela API em runtime.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_app') THEN
    CREATE ROLE hub_app LOGIN NOBYPASSRLS;
  END IF;
END \$\$;
ALTER ROLE hub_app PASSWORD '${HUB_APP_PASSWORD}';
SQL
