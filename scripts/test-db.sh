#!/usr/bin/env bash
# =====================================================================
# Sobe um Postgres+PostGIS efêmero, aplica TODAS as migrations na ordem
# e roda a suíte de testes de regras de negócio (supabase/tests/*.sql).
# Não depende de Supabase nem de rede — é o teste que roda em CI.
# =====================================================================
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/cadex-pgdata}"
PGPORT="${PGPORT:-54329}"
PGSOCK="${PGSOCK:-/tmp/cadex-pgsock}"
DB=cadex_test
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PGHOST="$PGSOCK"
export PGPORT

cleanup() {
  $AS "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

# O Postgres recusa rodar como root. Em ambientes de CI/container que
# rodam como root, reexecutamos o servidor sob o usuário `postgres`.
AS=""
if [ "$(id -u)" = "0" ]; then
  AS="setpriv --reuid=postgres --regid=postgres --clear-groups --"
fi

if [ ! -d "$PGDATA" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA" "$PGSOCK"
  [ -n "$AS" ] && chown -R postgres:postgres "$PGDATA" "$PGSOCK"
  $AS "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
fi
mkdir -p "$PGSOCK"
[ -n "$AS" ] && chown -R postgres:postgres "$PGDATA" "$PGSOCK" && touch /tmp/cadex-pg.log \
  && chown postgres:postgres /tmp/cadex-pg.log

$AS "$PGBIN/pg_ctl" -D "$PGDATA" -o "-k $PGSOCK -p $PGPORT -c listen_addresses=''" \
  -l /tmp/cadex-pg.log -w start >/dev/null

psql -U postgres -d postgres -qc "drop database if exists $DB;"
psql -U postgres -d postgres -qc "create database $DB;"

PSQL="psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q"

echo "==> shim auth (somente local; produção usa o auth do Supabase)"
$PSQL -f "$ROOT/scripts/auth-shim.sql"

echo "==> migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  $PSQL -f "$f"
done

echo "==> seed de demonstração (§46)"
$PSQL -f "$ROOT/supabase/seed/demo.sql"

echo "==> testes"
fail=0
for f in "$ROOT"/supabase/tests/*.sql; do
  name="$(basename "$f")"
  if out=$($PSQL -f "$f" 2>&1); then
    echo "    PASS  $name"
  else
    echo "    FAIL  $name"
    echo "$out" | sed 's/^/          /'
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "RESULTADO: FALHOU"
  exit 1
fi
echo "RESULTADO: todos os testes passaram"
