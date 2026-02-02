#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "${ROOT_DIR}" ]; then
  echo "ERROR: tools/ai must be run inside a git repository." >&2
  exit 1
fi

AI_DIR="${ROOT_DIR}/tools/ai"
CONFIG_FILE="${AI_DIR}/ai.config.json"

# shellcheck source=tools/ai/lib/git.sh
source "${AI_DIR}/lib/git.sh"
# shellcheck source=tools/ai/lib/context.sh
source "${AI_DIR}/lib/context.sh"
# shellcheck source=tools/ai/lib/checks.sh
source "${AI_DIR}/lib/checks.sh"
# shellcheck source=tools/ai/lib/prisma.sh
source "${AI_DIR}/lib/prisma.sh"
# shellcheck source=tools/ai/lib/summary.sh
source "${AI_DIR}/lib/summary.sh"

py() {
  python3 - "$@"
}

cfg_get() {
  local key=$1
  py <<PY
import json
from pathlib import Path
cfg=json.loads(Path("${CONFIG_FILE}").read_text())
parts="${key}".split(".")
cur=cfg
for p in parts:
    cur=cur[p]
print(cur)
PY
}

slugify() {
  local text=$1
  py "$text" <<'PY'
import re, sys
s=sys.argv[1].strip().lower()
s=re.sub(r"[^a-z0-9]+","-",s)
s=re.sub(r"-+","-",s).strip("-")
print(s or "feature")
PY
}

utc_run_id() {
  local slug=$1
  py "$slug" <<'PY'
from datetime import datetime, timezone
import sys
slug=sys.argv[1]
now=datetime.now(timezone.utc)
print(now.strftime("%Y-%m-%dT%H%MZ") + "__feat__" + slug)
PY
}

run_dir() { cfg_get run_dir; }
current_run_pointer() { cfg_get current_run_pointer; }

ensure_ai_gitignored() {
  local ignore_file="${ROOT_DIR}/.gitignore"
  if [ ! -f "$ignore_file" ]; then
    cat > "$ignore_file" <<'TXT'
# AI run artifacts (local-only)
.ai/runs/
.ai/current-run
TXT
    return
  fi

  if ! grep -q "^\.ai/runs/" "$ignore_file"; then
    echo "" >> "$ignore_file"
    echo "# AI run artifacts (local-only)" >> "$ignore_file"
    echo ".ai/runs/" >> "$ignore_file"
  fi
  if ! grep -q "^\.ai/current-run" "$ignore_file"; then
    echo ".ai/current-run" >> "$ignore_file"
  fi
}

meta_path_for_run() {
  local run_id=$1
  echo "${ROOT_DIR}/$(run_dir)/${run_id}/meta.json"
}

read_json_field() {
  local path=$1
  local field=$2
  py "$path" "$field" <<'PY'
import json, sys
from pathlib import Path
path=sys.argv[1]
field=sys.argv[2]
obj=json.loads(Path(path).read_text())
parts=field.split(".")
cur=obj
for p in parts:
    cur=cur[p]
print(cur)
PY
}

find_run_for_branch() {
  local branch=$1
  local rdir="${ROOT_DIR}/$(run_dir)"
  if [ ! -d "$rdir" ]; then
    echo ""
    return
  fi
  py "$branch" "$rdir" <<'PY'
import json, sys
from pathlib import Path
branch=sys.argv[1]
rdir=Path(sys.argv[2])
candidates=[]
for meta in rdir.glob("*/meta.json"):
    try:
        obj=json.loads(meta.read_text())
    except Exception:
        continue
    if obj.get("feature_branch") == branch:
        candidates.append(obj.get("run_id"))
        continue
    ab=obj.get("agent_branches",{})
    if branch in ab.values():
        candidates.append(obj.get("run_id"))
if candidates:
    print(sorted(candidates)[-1])
else:
    print("")
PY
}

get_current_run_id() {
  local pointer="${ROOT_DIR}/$(current_run_pointer)"
  if [ -f "$pointer" ]; then
    tr -d '\n' < "$pointer"
    return
  fi
  local branch
  branch=$(current_branch)
  find_run_for_branch "$branch"
}

write_current_run_id() {
  local run_id=$1
  local pointer="${ROOT_DIR}/$(current_run_pointer)"
  mkdir -p "$(dirname "$pointer")"
  echo "$run_id" > "$pointer"
}

require_run() {
  local run_id
  run_id=$(get_current_run_id)
  if [ -z "$run_id" ]; then
    echo "ERROR: No active run found. Use: tools/ai/run.sh start \"...\"" >&2
    exit 1
  fi
  local meta
  meta=$(meta_path_for_run "$run_id")
  if [ ! -f "$meta" ]; then
    echo "ERROR: Active run pointer exists but meta.json missing: $meta" >&2
    exit 1
  fi
  echo "$run_id"
}

verify_branch_matches_run() {
  local run_id=$1
  local meta
  meta=$(meta_path_for_run "$run_id")
  local branch
  branch=$(current_branch)
  local feature_branch
  feature_branch=$(read_json_field "$meta" feature_branch)

  if [ "$branch" == "$feature_branch" ]; then
    return 0
  fi

  local ok
  ok=$(py "$meta" "$branch" <<'PY'
import json, sys
from pathlib import Path
meta_path=sys.argv[1]
branch=sys.argv[2]
meta=json.loads(Path(meta_path).read_text())
ab=meta.get("agent_branches",{})
print("yes" if branch in ab.values() else "no")
PY
)
  if [ "$ok" == "yes" ]; then
    return 0
  fi

  echo "ERROR: Branch mismatch for run." >&2
  echo "  current:  $branch" >&2
  echo "  expected feature branch: $feature_branch" >&2
  echo "  (or one of this run's agent branches)" >&2
  exit 1
}

allowed_agents() {
  cfg_get agent_branch_suffixes | py -c 'import ast,sys; print(" ".join(ast.literal_eval(sys.stdin.read())))'
}

# Baseline for diffs:
# - Prefer the merge-base between HEAD and origin/<base_branch> (robust across rebases / base moving)
# - Fallback to the stored meta.base_commit
baseline_ref_for_meta() {
  local meta_path=$1
  local base_branch
  base_branch=$(read_json_field "$meta_path" base_branch)
  local stored
  stored=$(read_json_field "$meta_path" base_commit)

  if git show-ref --verify --quiet "refs/remotes/origin/${base_branch}"; then
    git merge-base HEAD "origin/${base_branch}" || echo "$stored"
  else
    echo "$stored"
  fi
}

cmd_start() {
  local description=${1:-}
  if [ -z "$description" ]; then
    echo "Usage: tools/ai/run.sh start \"feature description\"" >&2
    exit 1
  fi

  git_require_repo
  ensure_ai_gitignored
  ensure_clean_worktree

  local base_branch
  base_branch=$(cfg_get default_base_branch)

  echo "Updating base branch: ${base_branch}"
  update_base_branch "$base_branch"

  local slug
  slug=$(slugify "$description")
  local feature_branch_prefix
  feature_branch_prefix=$(cfg_get feature_branch_prefix)
  local feature_branch="${feature_branch_prefix}${slug}"

  echo "Switching to feature branch: ${feature_branch}"
  if git show-ref --verify --quiet "refs/heads/${feature_branch}"; then
    switch_to_branch "$feature_branch"
  else
    create_branch_from "$feature_branch" "$base_branch"
  fi

  fetch_origin

  local base_commit
  if git show-ref --verify --quiet "refs/remotes/origin/${base_branch}"; then
    base_commit=$(git merge-base HEAD "origin/${base_branch}")
  else
    base_commit=$(git rev-parse "$base_branch")
  fi

  local run_id
  run_id=$(utc_run_id "$slug")

  local rdir="${ROOT_DIR}/$(run_dir)/${run_id}"
  mkdir -p "$rdir"/{tasks,logs,migrations,pr,snapshots}

  local meta_path="$rdir/meta.json"
  py "$run_id" "$description" "$slug" "$base_branch" "$base_commit" "$feature_branch" "$meta_path" <<'PY'
import json, sys
from pathlib import Path

run_id=sys.argv[1]
description=sys.argv[2]
slug=sys.argv[3]
base_branch=sys.argv[4]
base_commit=sys.argv[5]
feature_branch=sys.argv[6]
meta_path=sys.argv[7]

meta={
  "run_id": run_id,
  "created_at_utc": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
  "description": description,
  "feature_slug": slug,
  "base_branch": base_branch,
  "base_commit": base_commit,
  "feature_branch": feature_branch,
  "agent_branches": {}
}
Path(meta_path).write_text(json.dumps(meta, indent=2)+"\n")
PY

  cat > "$rdir/spec.md" <<MD
# Feature spec

## Title
${slug}

## Description
${description}

## Acceptance criteria
- (fill in)

## Notes
- This run is local-only. Do not commit anything under .ai/runs/.
MD

  cat > "$rdir/plan.md" <<'MD'
# Plan

(Generate using tools/ai/prompts/10_plan.md)

- Milestones:
  - ...

- Tasks (agent branches):
  - ui
  - db
  - api
  - infra

- Tests:
  - ...
MD

  write_current_run_id "$run_id"

  echo ""
  echo "✅ Started run: $run_id"
  echo "   branch: $(current_branch)"
  echo "   run folder: $rdir"
  echo ""
  echo "Next: tools/ai/run.sh dispatch ui|db|infra|api"
}

cmd_status() {
  git_require_repo
  local branch
  branch=$(current_branch)
  echo "branch: $branch"

  local run_id
  run_id=$(get_current_run_id)

  if [ -z "$run_id" ]; then
    echo "runId: (none)"
    echo "run folder exists: no"
    echo "run/branch match: n/a"
    return 0
  fi

  local meta
  meta=$(meta_path_for_run "$run_id")
  local rdir="${ROOT_DIR}/$(run_dir)/${run_id}"
  echo "runId: $run_id"
  echo "run folder exists: $([ -d "$rdir" ] && echo yes || echo no)"

  if [ ! -f "$meta" ]; then
    echo "run/branch match: meta missing"
    return 0
  fi

  local feature_branch base_branch base_commit
  feature_branch=$(read_json_field "$meta" feature_branch)
  base_branch=$(read_json_field "$meta" base_branch)
  base_commit=$(read_json_field "$meta" base_commit)

  local match="no"
  if [ "$branch" == "$feature_branch" ]; then
    match="yes (feature)"
  else
    local ok
    ok=$(py "$meta" "$branch" <<'PY'
import json, sys
from pathlib import Path
meta=json.loads(Path(sys.argv[1]).read_text())
branch=sys.argv[2]
ab=meta.get("agent_branches",{})
print("yes" if branch in ab.values() else "no")
PY
)
    if [ "$ok" == "yes" ]; then
      match="yes (agent)"
    fi
  fi

  echo "run/branch match: $match"
  echo "feature_branch: $feature_branch"
  echo "base_branch: $base_branch"
  echo "stored base_commit: $base_commit"

  fetch_origin >/dev/null 2>&1 || true
  if git show-ref --verify --quiet "refs/remotes/origin/${base_branch}"; then
    local origin_commit
    origin_commit=$(git rev-parse "origin/${base_branch}")
    echo "origin/${base_branch}: $origin_commit"
    echo "current merge-base(HEAD, origin/${base_branch}): $(git merge-base HEAD "origin/${base_branch}")"
  else
    echo "origin/${base_branch}: (missing)"
  fi
}

cmd_dispatch() {
  local agent=${1:-}
  if [ -z "$agent" ]; then
    echo "Usage: tools/ai/run.sh dispatch ui|db|infra|api" >&2
    exit 1
  fi

  local allowed
  allowed=$(allowed_agents)
  if ! echo " $allowed " | grep -qw " ${agent} "; then
    echo "ERROR: Unknown agent '${agent}'." >&2
    echo "Allowed agents: ${allowed}" >&2
    exit 1
  fi

  local run_id
  run_id=$(require_run)
  verify_branch_matches_run "$run_id"

  local meta
  meta=$(meta_path_for_run "$run_id")
  local feature_branch
  feature_branch=$(read_json_field "$meta" feature_branch)

  if [ "$(current_branch)" != "$feature_branch" ]; then
    echo "ERROR: dispatch must be run from the feature branch: $feature_branch" >&2
    exit 1
  fi

  local slug
  slug=$(read_json_field "$meta" feature_slug)
  local agent_branch="${feature_branch}--${agent}"

  echo "Creating agent branch: $agent_branch (from $feature_branch)"
  if git show-ref --verify --quiet "refs/heads/${agent_branch}"; then
    echo "Agent branch already exists locally."
  else
    git branch "$agent_branch" "$feature_branch"
  fi

  local rdir="${ROOT_DIR}/$(run_dir)/${run_id}"
  local task_id
  task_id=$(py "$rdir" "$agent" <<'PY'
from pathlib import Path
import sys
rdir=Path(sys.argv[1])
agent=sys.argv[2]
tasks=sorted((rdir/"tasks").glob("*.json"))
print(f"{len(tasks)+1:03d}-{agent.lower()}")
PY
)

  local task_path="$rdir/tasks/${task_id}.json"
  py "$task_id" "$agent" "$slug" "$task_path" <<'PY'
import json, sys
from pathlib import Path
task_id, agent, slug, task_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
obj={
  "id": task_id,
  "title": f"{agent} task for {slug}",
  "owner": agent,
  "branchSuffix": agent,
  "status": "todo",
  "scope": f"Fill in task scope for {agent}",
  "filesLikelyTouched": [],
  "notes": ""
}
Path(task_path).write_text(json.dumps(obj, indent=2)+"\n")
PY

  local log_path="$rdir/logs/agent-${agent}.log"
  touch "$log_path"

  py "$meta" "$agent" "$agent_branch" <<'PY'
import json, sys
from pathlib import Path
meta_path, agent, agent_branch = sys.argv[1], sys.argv[2], sys.argv[3]
p=Path(meta_path)
obj=json.loads(p.read_text())
obj.setdefault("agent_branches",{})[agent]=agent_branch
p.write_text(json.dumps(obj, indent=2)+"\n")
PY

  echo "✅ Task created: $task_path"
  echo "✅ Log file:     $log_path"
  echo ""
  echo "Sub-agent branch:"
  echo "  git switch ${agent_branch}"
  echo "  (work, commit, push)"
  echo "  git push -u origin ${agent_branch}"
  echo ""

  if [ -t 0 ]; then
    read -r -p "Checkout agent branch now? (y/n): " ans
    if [[ "${ans:-n}" =~ ^[Yy]$ ]]; then
      switch_to_branch "$agent_branch"
      echo "Now on: $(current_branch)"
    fi
  fi
}

merge_registered_agent_branches() {
  local meta=$1
  local checks_log=$2
  local feature_branch=$3

  local branches
  branches=$(py "$meta" <<'PY'
import json, sys
from pathlib import Path
meta_path=sys.argv[1]
obj=json.loads(Path(meta_path).read_text())
ab=obj.get("agent_branches",{})
for k in sorted(ab.keys()):
    print(ab[k])
PY
)

  if [ -z "$branches" ]; then
    return 0
  fi

  while IFS= read -r ab; do
    [ -z "$ab" ] && continue

    if ! git show-ref --verify --quiet "refs/heads/${ab}"; then
      if git ls-remote --exit-code --heads origin "${ab}" >/dev/null 2>&1; then
        git fetch origin "${ab}:${ab}"
      else
        echo "(skip) agent branch not found on origin: ${ab}" | tee -a "$checks_log"
        continue
      fi
    fi

    echo "Merging ${ab} into ${feature_branch}" | tee -a "$checks_log"
    merge_branch_no_ff "$ab" | tee -a "$checks_log"
  done <<< "$branches"
}

maybe_run_migration_gate() {
  local base_ref=$1
  local schema_file=$2
  local rdir=$3
  local checks_log=$4

  if ! schema_changed "$base_ref" "$schema_file"; then
    return 0
  fi

  mkdir -p "$rdir/migrations"
  local pending_sql="$rdir/migrations/pending.sql"
  local explanation="$rdir/migrations/explanation.md"

  generate_pending_sql "$base_ref" "$schema_file" "$pending_sql"
  write_schema_explanation "$base_ref" "$schema_file" "$explanation"

  echo ""
  echo "⚠️  Prisma schema change detected."
  echo "   pending SQL: $pending_sql"
  echo "   explanation: $explanation"

  if [ -t 0 ]; then
    read -r -p "Apply migration now? (yes/no): " ans
    if [[ "${ans:-no}" =~ ^[Yy][Ee][Ss]$ ]]; then
      echo "Migration apply requested (manual step)." | tee -a "$checks_log"
      local apply_cmd
      apply_cmd=$(cfg_get commands.apply_migration)
      echo "Run manually: ${apply_cmd}" | tee -a "$checks_log"
      echo "(This tool never auto-applies migrations.)" | tee -a "$checks_log"
    else
      echo "Migration not applied." | tee -a "$checks_log"
    fi
  else
    echo "Non-interactive session: migration gate generated artifacts only." | tee -a "$checks_log"
  fi
}

cmd_implement() {
  local run_id
  run_id=$(require_run)
  verify_branch_matches_run "$run_id"

  local meta
  meta=$(meta_path_for_run "$run_id")
  local rdir="${ROOT_DIR}/$(run_dir)/${run_id}"
  local feature_branch
  feature_branch=$(read_json_field "$meta" feature_branch)

  if [ "$(current_branch)" != "$feature_branch" ]; then
    echo "ERROR: implement must be run from feature branch: $feature_branch" >&2
    exit 1
  fi

  ensure_clean_worktree
  fetch_origin

  local base_ref
  base_ref=$(baseline_ref_for_meta "$meta")

  local checks_log="$rdir/logs/master.log"
  touch "$checks_log"

  merge_registered_agent_branches "$meta" "$checks_log" "$feature_branch"

  local tc lint clear build
  tc=$(cfg_get commands.type_check)
  lint=$(cfg_get commands.lint)
  clear=$(cfg_get commands.clear_next_cache)
  build=$(cfg_get commands.build)
  run_checks "$checks_log" "$tc" "$lint" "$clear" "$build"

  local schema_file
  schema_file=$(cfg_get migration.schema_file)
  maybe_run_migration_gate "$base_ref" "$schema_file" "$rdir" "$checks_log"

  echo "✅ implement complete"
}

cmd_finalize() {
  local run_id
  run_id=$(require_run)
  verify_branch_matches_run "$run_id"

  local meta
  meta=$(meta_path_for_run "$run_id")
  local rdir="${ROOT_DIR}/$(run_dir)/${run_id}"
  local feature_branch
  feature_branch=$(read_json_field "$meta" feature_branch)

  if [ "$(current_branch)" != "$feature_branch" ]; then
    echo "ERROR: finalize must be run from feature branch: $feature_branch" >&2
    exit 1
  fi

  ensure_clean_worktree
  fetch_origin

  local base_ref
  base_ref=$(baseline_ref_for_meta "$meta")

  local checks_log="$rdir/logs/master.log"
  touch "$checks_log"

  local tc lint clear build
  tc=$(cfg_get commands.type_check)
  lint=$(cfg_get commands.lint)
  clear=$(cfg_get commands.clear_next_cache)
  build=$(cfg_get commands.build)
  run_checks "$checks_log" "$tc" "$lint" "$clear" "$build"

  local schema_file
  schema_file=$(cfg_get migration.schema_file)
  maybe_run_migration_gate "$base_ref" "$schema_file" "$rdir" "$checks_log"

  if schema_changed "$base_ref" "$schema_file"; then
    local mdirs
    mdirs=$(cfg_get migration.migration_dirs | py -c 'import ast,sys; print(" ".join(ast.literal_eval(sys.stdin.read())))')
    if ! migration_files_changed "$base_ref" $mdirs; then
      echo "ERROR: ${schema_file} changed but no migration files changed in expected dirs." >&2
      echo "Expected migration dirs: $mdirs" >&2
      echo "You must create and commit migrations before finalizing." >&2
      exit 1
    fi
  fi

  local drift_cmd
  drift_cmd=$(cfg_get commands.schema_drift)
  if [ -n "$drift_cmd" ] && [ "$drift_cmd" != "null" ]; then
    echo "Running schema drift check (strict gate)..." | tee -a "$checks_log"
    if ! run_schema_drift_check "$drift_cmd" "$checks_log"; then
      echo "ERROR: Schema drift detected (or drift check failed)." >&2
      echo "- Investigate logs: $checks_log" >&2
      echo "- Ensure migrations are committed and consistent with prisma/schema.prisma." >&2
      exit 1
    fi
  fi

  echo "Pushing feature branch to origin: $feature_branch" | tee -a "$checks_log"
  push_branch_set_upstream "$feature_branch" | tee -a "$checks_log"

  mkdir -p "$rdir/pr"
  local desc
  desc=$(read_json_field "$meta" description)
  write_pr_title_and_body "$feature_branch" "$desc" "$base_ref" "$schema_file" "$rdir" "$rdir/pr/title.txt" "$rdir/pr/body.md" "$checks_log"

  echo "✅ finalize complete"
  echo "PR title: $rdir/pr/title.txt"
  echo "PR body:  $rdir/pr/body.md"
  echo ""
  echo "Next steps:"
  echo "1) Open PR: ${feature_branch} -> main (recommended merge: squash)"
  if command -v gh >/dev/null 2>&1; then
    echo "   gh pr create --title \"$(cat "$rdir/pr/title.txt")\" --body-file \"$rdir/pr/body.md\" --base main --head \"${feature_branch}\""
  fi
  echo "2) CI must be green on PR before merge."
  echo "3) Merge (squash). Deploy only from origin/main after CI on main."
}

usage() {
  cat <<'TXT'
Usage: tools/ai/run.sh <command> [...]

Commands:
  start "<feature description>"   Create/switch feature branch and create .ai/runs/<runId>/ artifacts
  status                          Show current branch, runId, and consistency checks
  dispatch ui|db|infra|api         Create agent branch off feature branch + task/log scaffolding
  implement                        Merge agent branches into feature branch, run checks, generate migration gate artifacts
  finalize                         Run strict checks, enforce migration commits, push feature branch, generate PR title/body
TXT
}

main() {
  local cmd=${1:-}
  shift || true
  case "$cmd" in
    start) cmd_start "$@" ;;
    status) cmd_status ;;
    dispatch) cmd_dispatch "$@" ;;
    implement) cmd_implement ;;
    finalize) cmd_finalize ;;
    ""|help|-h|--help) usage ;;
    *) echo "Unknown command: $cmd" >&2; usage; exit 1 ;;
  esac
}

main "$@"
