#!/bin/bash
# Runs a private PostgreSQL for development, without Docker or sudo, from the
# PostgreSQL binaries already installed on this machine. Its data lives outside
# the repository, and it listens on localhost only.
#
#   scripts/dev-db.sh start | stop | status | reset
set -euo pipefail

DATA_DIR="${DEV_DB_DIR:-$HOME/.local/share/invantra/pgdata}"
PORT="${DEV_DB_PORT:-5433}"
DB_NAME=invoice
DB_USER=invoice

find_bin() {
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  # Debian and Ubuntu keep the server binaries off PATH.
  local dir
  dir=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)
  if [ -z "$dir" ]; then
    echo "PostgreSQL is not installed. Install it, or use: docker compose up -d db" >&2
    exit 1
  fi
  echo "$dir"
}

BIN=$(find_bin)

case "${1:-start}" in
  start)
    if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
      mkdir -p "$DATA_DIR"
      "$BIN/initdb" -D "$DATA_DIR" -U "$DB_USER" --auth=trust --encoding=UTF8 >/dev/null
    fi
    if ! "$BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      # The socket goes in the data directory: the default /var/run/postgresql needs root.
      "$BIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/server.log" -w \
        -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories='$DATA_DIR'" start >/dev/null
    fi
    "$BIN/psql" -h localhost -p "$PORT" -U "$DB_USER" -d postgres -tAc \
      "select 1 from pg_database where datname = '$DB_NAME'" | grep -q 1 ||
      "$BIN/createdb" -h localhost -p "$PORT" -U "$DB_USER" "$DB_NAME"
    echo "PostgreSQL is running."
    echo "DATABASE_URL=postgres://$DB_USER@localhost:$PORT/$DB_NAME"
    ;;
  stop)
    "$BIN/pg_ctl" -D "$DATA_DIR" -m fast stop
    ;;
  status)
    "$BIN/pg_ctl" -D "$DATA_DIR" status
    ;;
  reset)
    "$BIN/pg_ctl" -D "$DATA_DIR" -m fast stop >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR"
    echo "Deleted $DATA_DIR. Run '$0 start' for an empty database."
    ;;
  *)
    echo "Usage: $0 start|stop|status|reset" >&2
    exit 1
    ;;
esac
