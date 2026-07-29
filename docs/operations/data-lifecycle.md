# Data lifecycle runbook

Account deletion immediately tombstones the profile and ends active memberships. A persistent job then advances through `revoke`, `evidence`, `database`, and `identity` phases. The Auth identity is deleted last. Each phase has a four-minute lease; an interrupted job becomes retryable, backs off exponentially, and moves to `manual_review` after eight failures.

The daily worker claims at most five jobs. Monitor `account_deletion_jobs` for the oldest `next_run_at`, current phase, attempt count, lease expiry, and `manual_review` rows. Healthy operation has no expired leases and no due job older than 24 hours. A due job older than 24 hours or any manual-review row is an incident.

An operator can replay one manual-review job with `POST /api/cron/lifecycle`, the cron bearer secret, and JSON `{ "jobId": "…" }`. Record the reason and result in the incident log. Do not update job phases manually.

Source files are private and removed before database measurements. Personal Postgres rows are removed transactionally, audit actors become random tombstones, and Auth is then deleted. Safe audit facts are retained for 12 months and purged by the lifecycle claim transaction. Evidence downloads require a fresh, target-bound admin review and are streamed once with no-store, attachment, nosniff, and a fixed CSV type.
