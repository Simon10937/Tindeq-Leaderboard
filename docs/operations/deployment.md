# Deployment runbook

Use separate Supabase projects and Vercel environment values for Preview and Production. Never attach a preview deployment to production Supabase.

## Required secrets

Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, and a random `CRON_SECRET` of at least 32 characters. Only the two `NEXT_PUBLIC_` values may enter the browser bundle.

In Supabase, configure production custom SMTP, accepted auth redirect URLs, CAPTCHA, signup quotas, and rate limits. In Resend, point the webhook at `/api/webhooks/resend` and use its signing secret. Vercel invokes `/api/cron/lifecycle` daily with `Authorization: Bearer $CRON_SECRET`.

## Release order

1. Build and test the exact lockfile commit in Preview.
2. Run `supabase db reset` and database tests in CI.
3. Review migrations, then apply additive migrations to Production with the Supabase CLI.
4. Run Supabase security and performance advisors and resolve or document every finding.
5. Build the same commit for Production, smoke-test sign-in, group switching, RFD upload, comparison privacy, evidence denial, and invalidation, then assign traffic.
6. If application behavior regresses, restore the prior compatible Vercel deployment. Do not reverse destructive migrations; keep source evidence and metric history intact.

RFD protocol publication must remain disabled until the independent oracle is approved. Maximum pull, critical force, and repeaters remain disabled until their own fixture, oracle, malformed-input, replay, and privacy gates pass.
