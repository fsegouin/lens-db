#!/bin/bash
# Runs once, on the first start with an empty data volume. Creates the
# application role and database. The role is deliberately not a superuser:
# it owns the lensdb database and nothing else, and it is the only login the
# network side of pg_hba.conf lets through.
set -euo pipefail

: "${LENSDB_PASSWORD:?LENSDB_PASSWORD is required (see .env.example)}"
case "$LENSDB_PASSWORD" in
  *[!A-Za-z0-9]*) echo "LENSDB_PASSWORD must be letters and digits only" >&2; exit 1 ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  CREATE ROLE lensdb LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${LENSDB_PASSWORD}';
  CREATE DATABASE lensdb OWNER lensdb;
EOSQL

# pg_stat_statements needs a superuser to create; lensdb can read it once
# it exists. pg_stat_statements_reset() stays superuser-only, which matches
# Supabase.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname lensdb <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  GRANT pg_read_all_stats TO lensdb;
  -- The trigram GIN indexes on lenses.name and cameras.name need this. It was
  -- preinstalled on Supabase, so no migration creates it.
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
