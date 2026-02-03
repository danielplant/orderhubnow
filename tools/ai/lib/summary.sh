#!/usr/bin/env bash
set -euo pipefail

write_pr_title_and_body() {
  local feature_branch=$1
  local description=$2
  local base_ref=$3
  local schema_file=$4
  local run_dir=$5
  local out_title=$6
  local out_body=$7
  local checks_log=$8

  local title
  title=$(echo "$description" | head -n 1 | sed 's/^\s*//;s/\s*$//')
  if [ -z "$title" ]; then
    title="$feature_branch"
  fi
  echo "$title" > "$out_title"

  local schema_changed_flag="no"
  if git diff --name-only "${base_ref}...HEAD" | grep -q "^${schema_file}$"; then
    schema_changed_flag="yes"
  fi

  {
    echo "## Summary"
    echo "- ${description}"
    echo ""
    echo "## Changes"
    git diff --stat "${base_ref}...HEAD" || true
    echo ""
    echo "## Local checks run by tools/ai"
    echo "- typecheck"
    echo "- lint"
    echo "- clear Next build artifacts: rm -rf .next"
    echo "- build"
    echo ""
    echo "## Migration"
    echo "- Prisma schema changed: **${schema_changed_flag}**"
    echo "- Tool behavior:"
    echo "  - Generates a local SQL preview + explanation under .ai/runs/ (never committed)"
    echo "  - Prompts "Apply migration now?" but never auto-applies"
    echo "  - Requires committed migration files before finalize if schema changed"
    echo ""
    echo "## CI and deployment checklist"
    echo "- PR CI must pass before merge (strict gate):"
    echo "  - typecheck / lint / tests / build"
    echo "  - schema drift check: migrations match prisma/schema.prisma"
    echo "  - apply migrations to an ephemeral DB using prisma migrate deploy"
    echo "- Merge strategy: squash merge"
    echo "- Deploy only from origin/main after merge (never from feature branches):"
    echo "  - prisma migrate deploy against staging/prod"
    echo "  - deploy app artifact"
    echo "  - smoke tests"
    echo ""
    echo "## Notes"
    echo "- Checks log (local): ${checks_log}"
  } > "$out_body"
}
