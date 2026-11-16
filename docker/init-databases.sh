#!/bin/sh
# Roda uma unica vez, so quando o volume do Postgres e criado vazio (imagem oficial
# executa tudo em /docker-entrypoint-initdb.d nesse momento). Cria os dois bancos usados
# no desenvolvimento: o do Hub de Integracao e o do Atualizador, lado a lado no mesmo servidor.
set -e

for db in hub_dev atualizador_dev; do
  exists=$(psql -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")
  if [ "$exists" != "1" ]; then
    psql -U "$POSTGRES_USER" -c "CREATE DATABASE $db"
  fi
done
