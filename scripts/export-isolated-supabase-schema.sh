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
relation_literals=()
while IFS= read -r table_name; do
  [[ -z "$table_name" ]] && continue
  if [[ ! "$table_name" =~ ^[a-z0-9_]+$ ]]; then
    echo "invalid table manifest entry: $table_name" >&2
    exit 65
  fi
  table_args+=(--table="public.$table_name")
  relation_literals+=("'$table_name'")
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
relation_list=$(IFS=,; printf '%s' "${relation_literals[*]}")
connection_args=(
  --host "$db_host"
  --port "$db_port"
  --username "$db_user"
  --dbname "$db_name"
)

# The baseline owns business tables/functions only. Guard installation owns its
# private schema, RPCs and triggers and must happen separately on BOTH projects.
# pg_dump --table would include public guard triggers without their private
# dependencies. Never strip arbitrary triggers or emit that incomplete baseline.
assert_guard_free_source() {
  local guard_present
  guard_present=$(PGPASSWORD="$db_pass" psql "${connection_args[@]}" --no-psqlrc \
    --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --command "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'mind_manual_migration') OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('mind_manual_admit_edge','mind_manual_release_edge')) OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('mind_manual_subject_write_fence','mind_manual_subject_write_fence_after','mind_manual_truncate_fence')) OR EXISTS (SELECT 1 FROM pg_policy WHERE polname IN ('mind_manual_gateway_insert','mind_manual_gateway_update','mind_manual_gateway_delete'));")
  if [[ "$guard_present" != "f" ]]; then
    echo "baseline export requires a pre-guard source snapshot; use the retained reviewed baseline, then install the exact manual guards separately on both projects" >&2
    exit 65
  fi
}
assert_guard_free_source

# pg_dump treats an unmatched --table pattern as non-fatal when another pattern
# matches. Validate the entire allowlist first so a required runtime relation or
# function can never disappear silently from an apparently successful export.
missing_relations=$(PGPASSWORD="$db_pass" psql "${connection_args[@]}" --no-psqlrc \
  --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --command "WITH expected(name) AS (SELECT unnest(ARRAY[$relation_list]::text[])) SELECT e.name FROM expected AS e WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = e.name AND c.relkind IN ('r', 'p', 'v', 'm')) ORDER BY e.name;")
if [[ -n "$missing_relations" ]]; then
  echo "source project is missing required public relations:" >&2
  printf '%s\n' "$missing_relations" >&2
  exit 65
fi

invalid_functions=$(PGPASSWORD="$db_pass" psql "${connection_args[@]}" --no-psqlrc \
  --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --command "WITH expected(name) AS (SELECT unnest(ARRAY[$function_list]::text[])), counted AS (SELECT e.name, (SELECT count(*) FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = e.name) AS object_count FROM expected AS e) SELECT name || ':' || object_count::text FROM counted WHERE object_count <> 1 ORDER BY name;")
if [[ -n "$invalid_functions" ]]; then
  echo "every reviewed public function name must resolve exactly once (name:count):" >&2
  printf '%s\n' "$invalid_functions" >&2
  exit 65
fi

PGPASSWORD="$db_pass" pg_dump "${connection_args[@]}" --role postgres \
  --schema-only --section=pre-data --no-owner --no-comments \
  "${table_args[@]}" --file "$work_dir/pre.sql"

PGPASSWORD="$db_pass" psql "${connection_args[@]}" --no-psqlrc \
  --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --command "SET ROLE postgres; SELECT pg_catalog.pg_get_functiondef(p.oid) || ';' FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ($function_list) ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);" \
  > "$work_dir/functions.sql"

PGPASSWORD="$db_pass" pg_dump "${connection_args[@]}" --role postgres \
  --schema-only --section=post-data --no-owner --no-comments \
  "${table_args[@]}" --file "$work_dir/post.sql"

assert_guard_free_source
if LC_ALL=C grep -Eq 'mind_manual_migration|mind_manual_(subject_write_fence|truncate_fence|admit_edge|release_edge|gateway_)' \
  "$work_dir/pre.sql" "$work_dir/post.sql" "$work_dir/functions.sql"; then
  echo "guard objects appeared in the baseline snapshot; no output created" >&2
  exit 65
fi

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
  printf '%s\n' 'SET row_security = on;'
  sed '/^CREATE EXTENSION IF NOT EXISTS/d' "$hardening_sql"
} > "$output_path"

chmod 600 "$output_path"
printf 'wrote %s (%s bytes)\n' "$output_path" "$(wc -c < "$output_path" | tr -d ' ')"
