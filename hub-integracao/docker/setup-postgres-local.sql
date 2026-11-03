-- Setup do banco do Hub num Postgres local (sem Docker). Rode como superusuário (ex.: postgres).
-- Não toca em outros bancos. TROQUE as senhas e use as mesmas no .env.
--   psql -h localhost -p 5433 -U postgres -f docker/setup-postgres-local.sql
CREATE ROLE hub_owner LOGIN PASSWORD 'hub_owner_dev' NOBYPASSRLS;
CREATE ROLE hub_app   LOGIN PASSWORD 'hub_app_dev'   NOBYPASSRLS;
CREATE DATABASE hub OWNER hub_owner;
\c hub
-- pgcrypto (gen_random_uuid) exige superusuário; o dono não consegue criar a extensão sozinho no PG 10.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
