# Security TODO

Known issues to revisit. Not blockers for internal 10-user deploy.

## Open

- [ ] **Admin password compared with `!==`** (`app/api/admin/import-sales/route.ts`)
  - Risk: timing attack could leak password length/prefix
  - Severity: low (internal app, 10 users, 20-char password)
  - Fix: use `crypto.timingSafeEqual` on Buffer-wrapped strings

- [ ] **CSV parser splits on `,` naively** (`app/api/admin/import-sales/route.ts`)
  - Risk: any field containing a comma inside quotes corrupts the row
  - Severity: medium (data integrity, not security)
  - Fix: use `csv-parse` package

- [ ] **No rate limit on `/api/admin/import-sales`**
  - Risk: password brute-force
  - Severity: low (Vercel edge throttles; 20-char password is uncrackable in practice)
  - Fix: in-memory counter or Upstash ratelimit

- [ ] **No server-side file-type check**
  - Risk: non-CSV upload wastes parse time; 50MB cap already exists
  - Severity: very low
  - Fix: check `file.type` and first-line shape before parsing

- [ ] **`CRON_SECRET` is still the placeholder value in production**
  - The cron endpoints (`/api/shopify/sync`, `/api/shopify/mirror`,
    `/api/meta/sync-ads-daily`, `/api/dtdc/sync`) accept
    `change-me-to-a-random-secret` as a valid token on the live deployment
  - Risk: anyone who guesses it can trigger sync jobs
  - Severity: low — the jobs only pull from DTDC/Shopify/Meta and write to our
    own DB, so nothing leaks outward; worst case is wasted API quota
  - Fix: generate a random value, set it in Vercel env vars, and update the
    cron-job.org schedules that call these endpoints

## Done
