#!/usr/bin/env bash
set -euo pipefail

# Git helpers used by tools/ai/run.sh

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

ensure_clean_worktree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: Working tree has uncommitted changes. Commit or stash first." >&2
    git status --porcelain >&2
    exit 1
  fi
}

git_require_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    echo "ERROR: Not in a git repository." >&2
    exit 1
  }
}

fetch_origin() {
  git fetch origin --prune
}

update_base_branch() {
  local base_branch="$1"
  fetch_origin
  git switch "$base_branch" >/dev/null 2>&1 || git checkout "$base_branch"
  git pull --ff-only origin "$base_branch"
}

create_branch_from() {
  local new_branch="$1"
  local base_branch="$2"
  git show-ref --verify --quiet "refs/heads/${new_branch}" && {
    echo "ERROR: Branch already exists locally: ${new_branch}" >&2
    exit 1
  }
  git checkout -b "$new_branch" "$base_branch"
}

switch_to_branch() {
  local branch="$1"
  git switch "$branch" >/dev/null 2>&1 || git checkout "$branch"
}

push_branch_set_upstream() {
  local branch="$1"
  git push -u origin "$branch"
}

merge_branch_no_ff() {
  local branch="$1"
  git merge --no-ff --no-edit "$branch"
}
