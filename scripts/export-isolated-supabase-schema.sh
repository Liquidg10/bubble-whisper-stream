#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /absolute/path/to/mind-manual-baseline.sql" >&2
  exit 64
fi

output_path=$1
if [[ "$output_path" != /* ]]; then
  echo "output path must be absolute" >&2
  exit 64
fi

for required_command in supabase pg_dump psql sed mktemp; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "missing required command: $required_command" >&2
    exit 69
  fi
done

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
table_manifest="$repo_root/supabase/isolation/mind-manual-tables.txt"
function_manifest="$repo_root/supabase/isolation/mind-manual-functions.txt"
hardening_sql="$repo_root/supabase/isolation/post-schema-hardening.sql"

for manifest in "$table_manifest" "$function_manifest" "$hardening_sql"; do
  if [[ ! -f "$manifest" ]]; then
    echo "missing isolation input: $manifest" >&2
    exit 66
  fi
done

linked_ref_file="$repo_root/supabase/.temp/project-ref"
if [[ ! -f "$linked_ref_file" ]]; then
  echo "link the source project with supabase link before exporting" >&2
  exit 65
fi

source_ref=$(tr -d '[:space:]' < "$linked_ref_file")
if [[ "$source_ref" != "ekekeywoxvdbfbmqyhjy" ]]; then
  echo "refusing export from unexpected project ref: $source_ref" >&2
  exit 65
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

# Supabase emits a short-lived cli_login_postgres credential in its dry-run
# script. Capture it in memory; never echo or persist the credential.
dry_script=$(cd "$repo_root" && supabase db dump --linked --schema public --dry-run 2>/dev/null)
db_host=$(printf '%s' "$dry_script" | sed -n 's/^export PGHOST="\([^"]*\)"/\1/p')
db_port=$(printf '%s' "$dry_script" | sed -n 's/^export PGPORT="\([^"]*\)"/\1/p')
db_user=$(printf '%s' "$dry_script" | sed -n 's/^export PGUSER="\([^"]*\)"/\1/p')
db_pass=$(printf '%s' "$dry_script" | sed -n 's/^export PGPASSWORD="\([^"]*\)"/\1/p')
db_name=$(printf '%s' "$dry_script" | sed -n 's/^export PGDATABASE="\([^"]*\)"/\1/p')

for required_value in "$db_host" "$db_port" "$db_user" "$db_pass" "$db_name"; do
  if [[ -z "$required_value" ]]; then
    echo "could not parse the temporary Supabase database login" >&2
    exit 70
  fi
done

table_args=()
while IFS= read -r table_name; do
  [[ -z "$table_name" ]] && continue
  if [[ ! "$table_name" =~ ^[a-z0-9_]+$ ]]; then
    echo "invalid table manifest entry: $table_name" >&2
    exit 65
  fi
  table_args+=(--table="public.$table_name")
done < "$table_manifest"

function_literals=()
while IFS= read -r function_name; do
  [[ -z "$function_name" ]] && continue
  if [[ ! "$function_name" =~ ^[a-z0-9_]+$ ]]; then
    echo "invalid function manifest entry: $function_name" >&2
    exit 65
  fi
  function_literals+=("'$function_name'")
done < "$function_manifest"

function_list=$(IFS=,; printf '%s' "${function_literals[*]}")
connection_args=(
  --host "$db_host"
  --port "$db_port"
  --username "$db_user"
  --dbname "$db_name"
)

PGPASSWORD="$db_pass" pg_dump "${connection_args[@]}" --role postgres \
  --schema-only --section=pre-data --no-owner --no-comments \
  "${table_args[@]}" --file "$work_dir/pre.sql"

PGPASSWORD="$db_pass" psql "${connection_args[@]}" --no-psqlrc \
  --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --command "SET ROLE postgres; SELECT pg_catalog.pg_get_functiondef(p.oid) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ($function_list) ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);" \
  > "$work_dir/functions.sql"

PGPASSWORD="$db_pass" pg_dump "${connection_args[@]}" --role postgres \
  --schema-only --section=post-data --no-owner --no-comments \
  "${table_args[@]}" --file "$work_dir/post.sql"

{
  printf '%s\n' '-- Generated Mind Manual isolated-project baseline.'
  printf '%s\n' "-- Source: $source_ref"
  printf '%s\n\n' '-- Commerce objects are intentionally excluded by allowlist.'
  printf '%s\n' '-- Runtime extensions required by reviewed functions.'
  sed -n '/^CREATE EXTENSION IF NOT EXISTS/p' "$hardening_sql"
  printf '\n'
  sed '/^\\restrict /d; /^\\unrestrict /d' "$work_dir/pre.sql"
  printf '\n%s\n' '-- Reviewed Mind Manual functions.'
  sed '/^SET$/d' "$work_dir/functions.sql"
  printf '\n%s\n' '-- Constraints, indexes, triggers, policies, and grants.'
  sed '/^\\restrict /d; /^\\unrestrict /d' "$work_dir/post.sql"
  printf '\n%s\n' '-- Isolation hardening and non-public-schema objects.'
  sed '/^CREATE EXTENSION IF NOT EXISTS/d' "$hardening_sql"
} > "$output_path"

chmod 600 "$output_path"
printf 'wrote %s (%s bytes)\n' "$output_path" "$(wc -c < "$output_path" | tr -d ' ')"
