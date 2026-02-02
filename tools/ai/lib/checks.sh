#!/usr/bin/env bash
set -euo pipefail

run_cmd_logged() {
  local log_file="$1"; shift
  local cmd="$*"
  echo -e "\n$ $cmd" | tee -a "$log_file"
  # shellcheck disable=SC2086
  bash -lc "$cmd" 2>&1 | tee -a "$log_file"
}

run_checks() {
  local log_file="$1"
  local type_check_cmd="$2"
  local lint_cmd="$3"
  local clear_next_cache_cmd="$4"
  local build_cmd="$5"

  run_cmd_logged "$log_file" "$type_check_cmd"
  run_cmd_logged "$log_file" "$lint_cmd"

  if [ -n "${clear_next_cache_cmd:-}" ] && [ "${clear_next_cache_cmd}" != "null" ]; then
    run_cmd_logged "$log_file" "$clear_next_cache_cmd"
  fi

  run_cmd_logged "$log_file" "$build_cmd"
}
