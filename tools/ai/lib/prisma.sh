#!/usr/bin/env bash
set -euo pipefail

schema_changed() {
  local base_ref=$1
  local schema_file=$2
  git diff --name-only "${base_ref}...HEAD" | grep -q "^${schema_file}$"
}

migration_files_changed() {
  local base_ref=$1; shift
  local dirs=("$@")
  local changed
  changed=$(git diff --name-only "${base_ref}...HEAD" || true)
  local d
  for d in "${dirs[@]}"; do
    if echo "$changed" | grep -q "^${d}/"; then
      return 0
    fi
  done
  return 1
}

# Writes a SQL diff preview to pending_sql_path (best-effort).
#
# This is a PREVIEW artifact only. It is never applied automatically.
#
# Implementation strategy (no DB required):
# - Compare schema datamodel at base_ref vs current schema.prisma via `prisma migrate diff`.
# - If base schema is missing (rare), diff from empty -> current.
#
# Notes:
# - For enterprise correctness rely on committed migration files + `prisma migrate deploy` in CI/CD.
# - This preview is meant to help you eyeball the intended changes before generating/applying migrations.
generate_pending_sql() {
  local base_ref=$1
  local schema_file=$2
  local pending_sql_path=$3

  # Ensure parent dir exists
  mkdir -p "$(dirname "$pending_sql_path")"

  if command -v npx >/dev/null 2>&1; then
    if npx prisma migrate diff --help >/dev/null 2>&1; then
      local tmp_from
      tmp_from=$(mktemp)
      if git show "${base_ref}:${schema_file}" > "${tmp_from}" 2>/dev/null; then
        npx prisma migrate diff \
          --from-schema-datamodel "${tmp_from}" \
          --to-schema-datamodel "${schema_file}" \
          --script > "${pending_sql_path}" 2>/dev/null || true
      else
        # schema file didn't exist at base_ref
        npx prisma migrate diff \
          --from-empty \
          --to-schema-datamodel "${schema_file}" \
          --script > "${pending_sql_path}" 2>/dev/null || true
      fi
      rm -f "${tmp_from}"
    fi
  fi

  if [ ! -s "$pending_sql_path" ]; then
    cat > "$pending_sql_path" <<'SQL'
-- Pending migration SQL preview
--
-- This tool did not generate SQL automatically.
--
-- Requirements:
-- - Prisma CLI available (npx prisma ...)
-- - Valid prisma/schema.prisma
--
-- For enterprise correctness rely on:
-- - committed migration files under prisma/migrations/
-- - prisma migrate deploy in CI/CD
SQL
  fi
}

write_schema_explanation() {
  local base_ref=$1
  local schema_file=$2
  local out_path=$3

  {
    echo "# Schema change summary"
    echo ""
    echo "This run modified: ${schema_file}"
    echo ""
    echo "## Diff (schema)"
    echo "```diff"
    git diff "${base_ref}...HEAD" -- "${schema_file}" || true
    echo "```"
    echo ""
    echo "## What you must decide"
    echo "- Is this schema change intended?"
    echo "- Have you generated and committed migration files?"
    echo "- Apply locally for dev only (never auto-applied by this tool)."
  } > "$out_path"
}

run_schema_drift_check() {
  local drift_cmd=$1
  local log_file=$2

  echo -e "\n$ $drift_cmd" | tee -a "$log_file"
  set +e
  bash -lc "$drift_cmd" 2>&1 | tee -a "$log_file"
  local rc=${PIPESTATUS[0]}
  set -e
  return $rc
}
