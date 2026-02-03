#!/usr/bin/env bash
# dev-ensure.sh - Fast guard to ensure dev environment is ready
# Runs before `npm run dev` to catch missing setup early
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

ERRORS=()

# ─────────────────────────────────────────────────────────────────────────────
# 1. Ensure .env exists (auto-link from main repo if available)
# ─────────────────────────────────────────────────────────────────────────────
ENV_SOURCE="${ENV_SOURCE:-$ROOT/../ohn/.env}"

if [[ ! -f .env && -f "$ENV_SOURCE" ]]; then
  ln -s "$ENV_SOURCE" .env
  echo "✓ Linked .env -> $ENV_SOURCE"
fi

if [[ ! -f .env ]]; then
  ERRORS+=("Missing .env file. Either:")
  ERRORS+=("  • Copy from main repo: cp ../ohn/.env .")
  ERRORS+=("  • Or set ENV_SOURCE: ENV_SOURCE=/path/to/.env npm run dev")
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Check required env vars (if .env exists)
# ─────────────────────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  if ! grep -q "DATABASE_URL" .env; then
    ERRORS+=("Missing DATABASE_URL in .env")
  fi

  if ! grep -qE "NEXTAUTH_SECRET|AUTH_SECRET" .env; then
    ERRORS+=("Missing NEXTAUTH_SECRET or AUTH_SECRET in .env")
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Check node_modules
# ─────────────────────────────────────────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  ERRORS+=("Missing node_modules. Run: npm install")
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Check Prisma client
# ─────────────────────────────────────────────────────────────────────────────
if [[ ! -d node_modules/.prisma/client ]]; then
  ERRORS+=("Missing Prisma client. Run: npx prisma generate")
fi

# ─────────────────────────────────────────────────────────────────────────────
# Report errors or success
# ─────────────────────────────────────────────────────────────────────────────
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "╭─────────────────────────────────────────────────────────────────╮"
  echo "│  Dev environment not ready                                      │"
  echo "╰─────────────────────────────────────────────────────────────────╯"
  echo ""
  for err in "${ERRORS[@]}"; do
    echo "  ✗ $err"
  done
  echo ""
  echo "Quick fix (copy env + install):"
  echo "  cp ../ohn/.env . && npm install && npx prisma generate"
  echo ""
  exit 1
fi

echo "✓ Dev environment ready"
