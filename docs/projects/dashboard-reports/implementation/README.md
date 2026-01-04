# Dashboard & Reports Implementation Bundle

## Status: WIP - Still Being Validated

**Snapshot Date:** December 31, 2025  
**Moved to this location:** January 2, 2026  
**Snapshot Provenance:** Pre-merge snapshot (commit/PR unknown - created during initial implementation)  
**Compare divergence:** Run `diff -r code/ ../../../../src/` from this folder

---

> **WARNING: CODE IS ALREADY MERGED**
>
> The Dashboard+Reports feature code has **already been copied** to `05_myorderhub-v2/src/`.  
> The `code/` directory in this bundle is a **historical snapshot** that may be outdated.
>
> **DO NOT run `install.sh`** unless you are:
> - Setting up a fresh environment from scratch, OR
> - Intentionally restoring to the Dec 31, 2025 snapshot state
>
> Running `install.sh` on an existing installation **will overwrite current code**.

---

## What This Contains

This is a **snapshot bundle** containing:

| File | Purpose | Safe to Use? |
|------|---------|--------------|
| `01-schema-changes.sql` | SQL for FK backfills, analytics columns, RepTargets table | YES - Schema scripts are primary |
| `02-schema-changes.prisma` | Prisma model updates (reference only) | YES - Reference only |
| `03-alias-signals.sql` | AliasSignals table for filter pattern learning | YES - Schema script |
| `INSTALL.md` | Step-by-step installation runbook | YES - Read for guidance |
| `install.sh` | Automated file copy script | **DANGER** - See warning above |
| `00-IMPLEMENTATION-TRACKER.md` | Phase completion status and validation results | YES - Reference |
| `code/` | Source code snapshot (Dec 31, 2025) | **SNAPSHOT ONLY** - May differ from src/ |

---

## When Should I Run `install.sh`?

### DO Run `install.sh` If:
- You are setting up a **completely fresh** environment with no existing Dashboard+Reports code
- You are **intentionally restoring** to the Dec 31, 2025 snapshot (and accept losing newer changes)
- You have verified that `src/app/admin/reports/` does **not** exist

### DO NOT Run `install.sh` If:
- Dashboard+Reports is **already present** in `src/` (it is!)
- You want to **update** existing code (use git instead)
- You're unsure (when in doubt, don't run it)

---

## What's Already in `src/`

The following from `code/` have been copied to `../../../../src/`:

- Dashboard page updates (`app/admin/page.tsx`)
- Reports page and components (`app/admin/reports/`, `components/admin/*`)
- API routes (`app/api/reports/`, `app/api/alias-signals/`)
- Type definitions and queries

**The `code/` directory is a snapshot and may have diverged from current `src/`.**

---

## What Remains Schema-Dependent

These features require database schema changes to function fully:

| Feature | Blocker | Status |
|---------|---------|--------|
| Full Exception Report accuracy | FK match rate needs improvement | Partial |
| AliasSignals learning system | Requires `03-alias-signals.sql` run by DBA | Pending |
| Rep Scorecard normalization | Needs RepTargets data populated | Pending |
| EstimatedPotential coverage | Only 35.8% of customers have calculated potential | Partial |

---

## Primary Use: Schema Migration

The **primary purpose** of this bundle is schema migration, not code deployment.

**For schema work, see [INSTALL.md](./INSTALL.md)** - specifically Part 1.

---

## Validation Results (as of Dec 31, 2025)

| Test | Result |
|------|--------|
| TypeScript build | PASS |
| Schema columns exist | PASS (8 columns verified) |
| Categories loaded | 25 categories |
| Customer segments | 1,479 customers segmented |
| AliasSignals table | Created (0 records) |
| FK match rates | 75% (below 95% target) |
| Dev server start | PASS |

---

## Previous Location

This bundle was moved from:
```
10_system-plans/project-dec17/02_master-plan/20251231-admin-UIUX-reports-dashboard/implementation/
```

A forwarding notice (`MOVED.md`) was left at the old location.
