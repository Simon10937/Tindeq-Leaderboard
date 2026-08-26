---
title: "refactor: Clean dirty worktree"
date: "2026-08-26 12:04"
type: refactor
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

- **Objective:** Return the repository to an intentional, reviewable state now that the personal Tindeq tracker changes have landed, generated/local artifacts are ignored or removed, and future feature work starts from a clean baseline.
- **Means:** Audit the current dirty tree, split it into keeper/source changes versus local noise, commit or discard each class deliberately, and add guardrails for package-manager/cache artifacts.
- **Authority:** User request to clean up the dirty tree after the tracker rebuild; current `git status`; existing branch `codex/feat-tindeq-leaderboard` at `origin/main`; production now includes tracker work through `56d40c8`.
- **Stop conditions:** Stop before destructive cleanup if any file cannot be confidently classified, or if the audit shows unpushed user work unrelated to the tracker app.
- **Execution profile:** Cleanup/refactor with high caution around user work. No broad reset commands unless explicitly approved after backup.

---

## Product Contract

### Summary

The repo currently has a large dirty tree after the tracker rebuild. The cleanup should preserve the already-committed personal tracker application and peak-force support, while removing or isolating unrelated generated artifacts, stale legacy app changes, documentation/config drift, and package-manager leftovers.

### Problem Frame

`HEAD` currently matches `origin/main` at `56d40c8`, but `git status --short` shows many modified/deleted legacy leaderboard files, docs, Supabase migrations, and untracked local package artifacts. This makes every future commit risky because staging by habit could mix generated cache files, old app removal, package-manager changes, and documentation changes.

### Requirements

- R1. Produce a current-state inventory that classifies every dirty path as keep, discard, ignore, or requires user decision.
- R2. Preserve deliberate tracker work already committed to `main`, including the active personal tracker implementation, peak-force CSV support, single-finger grip support, chart fixes, and mobile navigation fix.
- R3. Remove local/generated artifacts such as `.pnpm-store/` from the worktree and prevent them recurring in git status.
- R4. Avoid reverting user-authored or intentional app-replacement changes without an explicit checkpoint and user approval.
- R5. End with a clean or near-clean `git status`, where any remaining dirty paths are intentionally documented.
- R6. Keep production deploy safety: do not push a cleanup commit that accidentally restores the old app or drops the tracker app.

### Scope Boundaries

- **In scope:** Git hygiene, staging strategy, artifact ignore rules, source-change classification, local validation after cleanup.
- **Out of scope:** Redesigning tracker UX, changing Supabase schema behavior, deploying to Vercel, or rewriting old leaderboard features.
- **Deferred to follow-up work:** Squashing/rebasing historical commits can be considered later if the branch history becomes hard to understand. The immediate goal is a safe clean tree.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Use a non-destructive safety snapshot before cleanup. The first implementation step should create a local branch or patch snapshot of the dirty tree so accidental cleanup can be recovered without relying on memory.
- KTD2. Classify before staging. The implementer should not use `git add .`; each path class should be reviewed and staged or removed by category.
- KTD3. Treat `.pnpm-store/` as local package-manager cache. It should be removed locally and added to ignore rules if not already covered.
- KTD4. Preserve the shipped tracker app as the intended source baseline unless the audit finds evidence that a dirty file belongs only to stale leaderboard code.
- KTD5. Do not treat tracker or peak-force implementation as part of this cleanup commit stream; those feature changes have already shipped. Cleanup commits should separate generated artifacts, package-manager decisions, documentation, legacy app removal, and Supabase migration/test cleanup.
- KTD6. Resolve package-manager ownership explicitly. `package-lock.json` is tracked, while `pnpm-lock.yaml` and `pnpm-workspace.yaml` are currently untracked; do not commit pnpm files unless the audit confirms the repo is intentionally moving to pnpm.

### Current Dirty Tree Groups

- **Already shipped tracker source and tests:** `src/features/tracker/**`, `src/components/charts/tracker-progress-chart.tsx`, and `src/app/globals.css` are tracked at `HEAD` and should not be part of cleanup unless a new dirty change appears.
- **App shell and demo/local mode leftovers:** `src/components/app-shell.tsx`, `src/lib/demo.ts`, `.env.example`, `README.md`, operations docs.
- **Legacy leaderboard/assessment/group removals:** deleted files under `src/features/assessments`, `src/features/dashboard`, `src/features/groups`, `src/features/protocols`, `src/features/email`, `src/features/audit`, and deleted old Supabase migrations.
- **Package manager files:** `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.pnpm-store/`, with tracked `package-lock.json` as the current baseline.
- **Plan/docs artifacts:** existing untracked plans under `docs/plans/`.
- **Deployment/config:** `vercel.json`, `playwright.config.ts`, Supabase tests/migrations.

### Assumptions

- The personal Tindeq tracker replacement is the desired direction and should not be reverted to the old leaderboard app.
- `.pnpm-store/` is a generated local cache and should not be tracked.
- The current branch matching `origin/main` at `56d40c8` means all visible changes are uncommitted local work, not merely branch divergence.
- Tracker feature work through the mobile navigation fix is already production-deployed and should be protected rather than recommitted.

---

## Implementation Units

### U1. Create a Recoverable Snapshot

- **Goal:** Ensure cleanup is reversible before any file removal or checkout.
- **Requirements:** R4, R6.
- **Dependencies:** None.
- **Files:** No planned source changes.
- **Approach:**
  1. Record `git status --short` to a temporary notes file or terminal log.
  2. Create a local safety branch from the current dirty state or save a named patch for tracked changes plus a list/archive of untracked files.
  3. Confirm that the snapshot includes untracked files such as plan/docs artifacts, `src/lib/demo.ts`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the new Supabase migration.
- **Patterns to follow:** Existing cautious workflow: no destructive `git reset` or checkout until there is a recoverable copy.
- **Test scenarios:** Test expectation: none -- this is git hygiene, verified by being able to list the safety branch/patch and untracked inventory.
- **Verification:** A recovery artifact exists and the dirty tree remains unchanged after the snapshot step.

### U2. Classify Every Dirty Path

- **Goal:** Decide which files are intentional source changes, generated artifacts, stale legacy leftovers, or require user review.
- **Requirements:** R1, R2, R4.
- **Dependencies:** U1.
- **Files:** No planned source changes.
- **Approach:**
  1. Use path-focused diffs rather than full-tree dumps.
  2. Group tracked changes into legacy removal, docs/config, Supabase, tests, deployment, and package-manager changes.
  3. For each deleted legacy file, confirm whether the shipped tracker app still references it or whether it is stale leaderboard code that should be discarded or committed as intentional removal.
  4. Mark ambiguous paths as `requires user decision` rather than reverting them.
- **Patterns to follow:** Use `rg` and targeted `git diff -- <path>` checks; avoid broad staging.
- **Test scenarios:** Test expectation: none -- classification is reviewed via the generated inventory.
- **Verification:** A short inventory exists with one classification for every dirty path from `git status --short`.

### U3. Remove and Ignore Local Artifacts

- **Goal:** Clear generated/local files that should never be committed.
- **Requirements:** R3, R5.
- **Dependencies:** U1, U2.
- **Files:** `.gitignore` if `.pnpm-store/` is not already ignored.
- **Approach:**
  1. Remove `.pnpm-store/` after the snapshot.
  2. Add `.pnpm-store/` to `.gitignore` if existing ignore rules do not already cover it.
  3. Re-run `git status --short` and confirm the cache no longer appears.
- **Patterns to follow:** Existing ignore-file style in the repo.
- **Test scenarios:** Test expectation: none -- ignore behavior is validated through `git status --short`.
- **Verification:** `.pnpm-store/` is absent from status after cleanup, and rerunning package commands does not reintroduce it as untracked source.

### U4. Resolve Package-Manager and Local Demo Leftovers

- **Goal:** Decide whether pnpm/demo leftovers are intentional source changes or local noise.
- **Requirements:** R1, R3, R5, R6.
- **Dependencies:** U2, U3.
- **Files:** `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package-lock.json`, `src/lib/demo.ts`, `.env.example`, README/docs references.
- **Approach:**
  1. Check package scripts and existing lockfiles to determine whether npm or pnpm is the intended package manager.
  2. If npm remains the intended package manager, remove or ignore pnpm artifacts after the safety snapshot.
  3. Keep `src/lib/demo.ts` only if current source imports it; otherwise classify it as stale local work.
  4. Keep docs/env changes only if they describe the shipped tracker app accurately.
- **Patterns to follow:** Path-specific diffs and reference searches before removing untracked files.
- **Test scenarios:** Test expectation: none -- classification is validated by `git status --short` and reference searches.
- **Verification:** Package-manager artifacts no longer appear as ambiguous untracked files, and docs/demo changes have a deliberate classification.

### U5. Separate Source Commits by Intent

- **Goal:** Convert the remaining intentional changes into clean, reviewable commits instead of one mixed blob.
- **Requirements:** R2, R5, R6.
- **Dependencies:** U2, U3, U4.
- **Files:** Likely includes docs, Supabase migration/test files, `vercel.json`, legacy source removals, and package files depending on classification.
- **Approach:**
  1. Do not stage already-shipped tracker implementation as a new cleanup unit.
  2. Stage package-manager files only if they are required for the app to install/build reproducibly and the package-manager decision is explicit.
  3. Stage legacy deletion/config/docs changes in separate cleanup or app-replacement commits.
  4. Leave ambiguous files unstaged until explicitly decided.
- **Patterns to follow:** Use pathspec staging (`git add -- <paths>`) and `git diff --cached` before each commit.
- **Test scenarios:** Test expectation: none -- commit correctness is validated by staged diff review and subsequent app tests.
- **Verification:** Each staged diff has a single readable intent and does not include `.pnpm-store/` or unrelated local files.

### U6. Validate the Cleaned Baseline

- **Goal:** Prove that the cleaned tree still builds and still represents the tracker app.
- **Requirements:** R2, R5, R6.
- **Dependencies:** U5.
- **Files:** No additional planned source changes unless validation reveals cleanup mistakes.
- **Approach:**
  1. Run the focused tracker parser/component tests affected by recent work.
  2. Run lint on touched tracker and chart files.
  3. Run `next build`.
  4. Inspect `git status --short` and document any intentional remaining dirty paths.
- **Patterns to follow:** Use the same bundled Node commands already proven in recent tracker work.
- **Test scenarios:**
  - Peak-force parser still detects Tindeq `max weight` summary exports.
  - Tracker import draft still parses Tindeq `YYYY-DD-MM` metadata dates correctly.
  - Progress chart still renders the tracker modes after cleanup.
- **Verification:** Tests/lint/build pass and `git status --short` is empty or contains only documented intentional leftovers.

---

## Verification Contract

- `git status --short` before and after cleanup, with every remaining path explained.
- Focused Vitest tracker suite covering parser/import/chart behavior.
- ESLint on changed tracker/chart files.
- `next build` to confirm the app still compiles after removals and config cleanup.
- Manual staged-diff review before every commit using `git diff --cached`.

---

## Definition of Done

- A safety snapshot exists or the cleanup commits are recoverable.
- `.pnpm-store/` and other generated artifacts no longer appear in git status.
- Intentional tracker app changes are committed or explicitly left staged/unstaged with a reason.
- Ambiguous legacy deletions are not silently reverted or silently committed.
- The production-relevant app still builds after cleanup.
- The final status is clean, or the remaining dirty paths are listed with their owner and next action.
