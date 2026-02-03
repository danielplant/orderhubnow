# tools/ai – OrderHubNow AI orchestration

This system creates a consistent workflow for feature development and bug fixing using AI agents across different tools (Codex CLI, Claude Code, Cursor). **Git branches are the source of truth**.

## What gets committed

Only real project artifacts:
- application code
- migrations
- config/docs when relevant

Everything under `.ai/runs/` is **local-only** and **must be gitignored**.

## Quickstart

From the repo root:

```bash
# start a new feature run (creates a worktree if default_worktree=true)
./tools/ai/run.sh start "<feature description>"

# or explicitly create a worktree for the run
./tools/ai/run.sh start --worktree "<feature description>"

# check that you are on the right branch + run
./tools/ai/run.sh status

# create an agent branch + task scaffold
./tools/ai/run.sh dispatch ui

# merge completed agent branches into the feature branch + run checks + handle migration gate
./tools/ai/run.sh implement

# interactive local QA (required before finalize)
./tools/ai/run.sh test

# final checks + strict drift gate + generate PR title/body + push branch
./tools/ai/run.sh finalize
```

## Worktrees (recommended/default)

When `default_worktree` is enabled, `start` creates a new worktree under `worktree_root`
and initializes the run there. This lets you run multiple features in parallel without
branch-switching conflicts.

Useful commands:

```bash
./tools/ai/run.sh worktree list
./tools/ai/run.sh worktree add "<feature description>"
```

## Workflow model

- **Master** works on `feature/<slug>`
- Each sub-agent works on `feature/<slug>--<agent>`
- Master merges agent branches → **one PR** from feature branch to `main`
- Recommended merge strategy: **squash merge**

## Branch continuity across tools (Cursor / Claude / Codex)

- Open the **same worktree path** in Cursor, Claude Code, and Codex for a given feature.
- The current Git branch is the source of truth, not the UI.
- `./tools/ai/run.sh status` prints branch + runId + whether the branch matches the active run.
- Any command that mutates state (`dispatch`, `implement`, `finalize`) refuses to run if you are on the wrong branch.
- Use `./tools/ai/run.sh worktree list` to see all active worktrees and their branches.

## Next.js build artifacts

The orchestrator clears **all** Next build output before building:

```bash
rm -rf .next
```

Reason: `.next/types` and other artifacts can cause false TypeScript failures when stale.

This is local-only behavior for determinism. In CI, runners are already clean; you can still cache `.next/cache` for speed (see below).

## Migration gate (hard requirement)

If `prisma/schema.prisma` changes, this tool will:

1. generate `.ai/runs/<runId>/migrations/pending.sql` (preview)
2. write `.ai/runs/<runId>/migrations/explanation.md`
3. prompt: **"Apply migration now? (yes/no)"**

It will **never auto-apply**.

### Migration policy (enterprise)

- Always commit migration files (e.g. `prisma/migrations/*`) with the PR.
- Apply migrations in CI/CD with `prisma migrate deploy` (never `migrate dev`) on staging/prod.

## Schema drift check (strict gate)

`finalize` runs a strict drift check via:

```bash
bash tools/ai/lib/check-schema-drift.sh
```

It uses `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --exit-code` and fails if migrations do not match `prisma/schema.prisma`.

If your workflow requires a shadow database URL, set `SHADOW_DATABASE_URL` (and ensure it is **not** your production DB).

## CI + deploy handshake (enterprise grade)

This tool **does not deploy** and refuses to deploy from feature branches.

Deployment should occur only after:
1) feature branch PR is merged (squash) and `origin/main` updates
2) CI passes on main

## Manual QA (required)

Before `finalize`, you must record a QA confirmation:

```bash
./tools/ai/run.sh test
```

This is an **interactive** step that:
- optionally opens the production DB tunnel (`npm run db:tunnel`)
- asks whether you want to run **dev** or **prod-like** testing
- records your confirmation under `.ai/runs/<runId>/qa/confirmed.md`

Default prod-like command:

```bash
rm -rf .next && npx prisma generate && npm run build && npm start
```

If you skip QA, the tool requires a reason and records it.

### Recommended GitHub Actions pattern

#### 1) Pull request CI (strict gate)

Key properties:
- runs typecheck/lint/tests/build
- runs schema drift check
- applies migrations to an **ephemeral** SQL database using `prisma migrate deploy`
- caches dependencies and (optionally) `.next/cache` for speed

**Postgres example (adjust for your DB):**

```yaml
name: PR CI

on:
  pull_request:

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: app
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/app
      SHADOW_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/app_shadow

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      # Optional Next build cache
      - uses: actions/cache@v4
        with:
          path: |
            ~/.npm
            ${{ github.workspace }}/.next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.[jt]s', '**/*.[jt]sx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('package-lock.json') }}-

      - run: npm ci

      - run: npm run type-check
      - run: npm run lint
      - run: npm test --if-present

      # Ensure migrations match schema (strict)
      - run: bash tools/ai/lib/check-schema-drift.sh

      # Ensure migrations apply cleanly (non-interactive)
      - run: npx prisma migrate deploy

      # Deterministic build
      - run: rm -rf .next
      - run: npm run build
```

**SQL Server note:** swap the service container to `mcr.microsoft.com/mssql/server` and set `DATABASE_URL` / `SHADOW_DATABASE_URL` accordingly.

#### 2) Main deploy workflow

Key properties:
- triggers only on `main`
- applies migrations with `prisma migrate deploy`
- deploys artifact
- runs smoke tests
- uses environments for approvals (staging → prod)

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

permissions:
  contents: read

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
      - run: npm run build
      - run: ./scripts/deploy-staging.sh
      - run: ./scripts/smoke-test.sh https://staging.example.com

  deploy-prod:
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
      - run: npm run build
      - run: ./scripts/deploy-prod.sh
      - run: ./scripts/smoke-test.sh https://example.com
```

## Configuration

`tools/ai/ai.config.json` contains project-specific commands and migration directories.

If your repo uses different commands or migration directories, edit that file.
