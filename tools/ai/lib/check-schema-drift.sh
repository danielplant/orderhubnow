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
MIGRATION_DIRS=$(cfg_get migration.migration_dirs | py -c 'import ast,sys; print(" ".join(ast.literal_eval(sys.stdin.read())))')
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

SHADOW_URL="${SHADOW_DATABASE_URL:-${PRISMA_MIGRATE_SHADOW_DATABASE_URL:-}}"
if [ -n "${SHADOW_URL}" ] && [ -n "${DATABASE_URL:-}" ] && [ "${SHADOW_URL}" = "${DATABASE_URL}" ]; then
  echo "ERROR: SHADOW_DATABASE_URL must NOT equal DATABASE_URL." >&2
  echo "Provide a separate, empty shadow database for migration diff checks." >&2
  exit 1
fi

args=(prisma migrate diff --from-migrations "${MIGR_DIR}" --to-schema-datamodel "${SCHEMA_FILE}" --exit-code)
if [ -n "${SHADOW_URL}" ]; then
  args+=(--shadow-database-url "${SHADOW_URL}")
fi

set +e
npx "${args[@]}"
rc=$?
set -e

if [ "${rc}" -eq 0 ]; then
  echo "✅ Schema drift check: OK (migrations match schema)"
  exit 0
fi

if [ "${rc}" -eq 2 ]; then
  echo "❌ Schema drift detected (migrations do not match schema). SQL diff:"
  args2=(prisma migrate diff --from-migrations "${MIGR_DIR}" --to-schema-datamodel "${SCHEMA_FILE}" --script)
  if [ -n "${SHADOW_URL}" ]; then
    args2+=(--shadow-database-url "${SHADOW_URL}")
  fi
  npx "${args2[@]}" || true
  exit 2
fi

echo "ERROR: Schema drift check failed to run (exit code ${rc})." >&2
echo "Hints:" >&2
echo "- If using --from-migrations, you may need a shadow database: set SHADOW_DATABASE_URL." >&2
echo "- Ensure prisma/schema.prisma is valid and prisma CLI is installed." >&2
exit "${rc}"
