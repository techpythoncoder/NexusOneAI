#!/bin/bash
# =============================================================================
# PostgreSQL Multi-Database Init Script
# =============================================================================
# This script runs once when the Postgres container is first created.
# It reads POSTGRES_MULTIPLE_DATABASES env var (comma-separated DB names)
# and creates each one, granting all privileges to the main user.
#
# Why: Each microservice owns its own database (database-per-service pattern).
# They all live in one Postgres instance in dev, but remain logically isolated.
# =============================================================================

set -e

function create_user_and_database() {
  local database=$1
  echo "  Creating database: $database"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $database;
    GRANT ALL PRIVILEGES ON DATABASE $database TO $POSTGRES_USER;
EOSQL
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  echo "==> Creating multiple databases: $POSTGRES_MULTIPLE_DATABASES"
  for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
    # Trim whitespace
    db=$(echo $db | xargs)
    # Skip if it's the main db (already created by Docker)
    if [ "$db" != "$POSTGRES_DB" ]; then
      create_user_and_database $db
    fi
  done

  # Create keycloak schema inside the main DB (Keycloak uses it)
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE SCHEMA IF NOT EXISTS keycloak;
EOSQL

  echo "==> All databases created successfully."
fi
