#!/usr/bin/env bash
set -euo pipefail

# Generates context bundles for AI agents (lightweight, text-only).

write_context_bundle() {
  local out_file="$1"
  local base_ref="$2"

  {
    echo "# Context bundle"
    echo ""
    echo "## Git status"
    git status --short
    echo ""
    echo "## Diff vs ${base_ref} (stat)"
    git diff --stat "${base_ref}...HEAD"
    echo ""
    echo "## Changed files"
    git diff --name-only "${base_ref}...HEAD"
    echo ""
    echo "## Recent commits"
    git log -5 --oneline
  } > "$out_file"
}
