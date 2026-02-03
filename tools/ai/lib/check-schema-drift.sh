#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "${ROOT_DIR}" ]; then
  echo "ERROR: Must be run inside a git repository." >&2
  exit 1
fi

CFG="${ROOT_DIR}/tools/ai/ai.config.json"

py() {
  python3 - "$@"
}

cfg_get() {
  local key=$1
  py <<PY
import json
from pathlib import Path
cfg=json.loads(Path("${CFG}").read_text())
parts="${key}".split(".")
cur=cfg
for p in parts:
    cur=cur[p]
print(cur)
PY
}

SCHEMA_FILE=$(cfg_get migration.schema_file)

# Prefer prisma/migrations if present; otherwise fall back to first configured dir that exists.
MIGRATION_DIRS=$(cfg_get migration.migration_dirs | python3 -c 'import ast,sys; print(" ".join(ast.literal_eval(sys.stdin.read())))')
MIGR_DIR=""
for d in $MIGRATION_DIRS; do
  if [ -d "${ROOT_DIR}/${d}" ]; then
    MIGR_DIR="${d}"
    break
  fi
done

if [ -z "${MIGR_DIR}" ]; then
  echo "ERROR: No migration directory found. Expected one of: ${MIGRATION_DIRS}" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx not found. Install Node.js tooling to run Prisma CLI." >&2
  exit 1
fi

run_diff() {
  set +e
  npx "${DIFF_ARGS[@]}"
  rc=$?
  set -e

  if [ "${rc}" -eq 0 ]; then
    echo "✅ Schema drift check: OK (migrations match schema)"
    exit 0
  fi

  if [ "${rc}" -eq 2 ]; then
    echo "❌ Schema drift detected (migrations do not match schema). SQL diff:"
    npx "${SCRIPT_ARGS[@]}" || true
    exit 2
  fi

  echo "ERROR: Schema drift check failed to run (exit code ${rc})." >&2
  echo "Hints:" >&2
  echo "- Ensure prisma/schema.prisma is valid and prisma CLI is installed." >&2
  exit "${rc}"
}

MIGR_LOCK="${ROOT_DIR}/${MIGR_DIR}/migration_lock.toml"

if [ -f "${MIGR_LOCK}" ]; then
  SHADOW_URL="${SHADOW_DATABASE_URL:-${PRISMA_MIGRATE_SHADOW_DATABASE_URL:-}}"
  if [ -n "${SHADOW_URL}" ] && [ -n "${DATABASE_URL:-}" ] && [ "${SHADOW_URL}" = "${DATABASE_URL}" ]; then
    echo "ERROR: SHADOW_DATABASE_URL must NOT equal DATABASE_URL." >&2
    echo "Provide a separate, empty shadow database for migration diff checks." >&2
    exit 1
  fi

  DIFF_ARGS=(prisma migrate diff --from-migrations "${MIGR_DIR}" --to-schema-datamodel "${SCHEMA_FILE}" --exit-code)
  SCRIPT_ARGS=(prisma migrate diff --from-migrations "${MIGR_DIR}" --to-schema-datamodel "${SCHEMA_FILE}" --script)
  if [ -n "${SHADOW_URL}" ]; then
    DIFF_ARGS+=(--shadow-database-url "${SHADOW_URL}")
    SCRIPT_ARGS+=(--shadow-database-url "${SHADOW_URL}")
  fi

  run_diff
else
  echo "WARN: migration_lock.toml not found in ${MIGR_DIR}; falling back to schema-vs-DB diff."

  DB_URL="${DATABASE_URL:-${SHADOW_DATABASE_URL:-${PRISMA_MIGRATE_SHADOW_DATABASE_URL:-}}}"
  if [ -z "${DB_URL}" ]; then
    echo "ERROR: DATABASE_URL (or SHADOW_DATABASE_URL) is required for drift checks when migrations are not managed by Prisma." >&2
    exit 1
  fi

  TMP_SCHEMA="$(mktemp)"
  trap 'rm -f "${TMP_SCHEMA}"' EXIT
  cp "${SCHEMA_FILE}" "${TMP_SCHEMA}"

  DATABASE_URL="${DB_URL}" npx prisma db pull --schema="${TMP_SCHEMA}" >/dev/null

  DIFF_ARGS=(prisma migrate diff --from-schema-datamodel "${TMP_SCHEMA}" --to-schema-datamodel "${SCHEMA_FILE}" --exit-code)
  SCRIPT_ARGS=(prisma migrate diff --from-schema-datamodel "${TMP_SCHEMA}" --to-schema-datamodel "${SCHEMA_FILE}" --script)

  run_diff
fi
