# NextStep reproducibility audit

Reviewed 28 November 2026 (UTC). This is packaging evidence, not certification of a clean hosted deployment.

## Completed packaging

- Replaced `README.md` with the actual Node requirement, complete hosted/local instructions, credential acquisition, environment reference, demo limits, troubleshooting and an acceptance checklist.
- Added root `.env.example` with empty `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the browser client now reads exactly those variables, without a project fallback.
- Added `.nvmrc` for Node 22.23.5. Installed TanStack Start requires at least 22.12; direct TypeScript tooling uses the pinned version.
- Appended migration `supabase/migrations/20261128150405_45b79ea7-6843-4425-b7c5-e2e55b56e16c.sql` through the migration tool. It adds the missing calibration inclusion/exclusion fields, detected-item details, existing live assignment uniqueness and weekly user/week index. Applied successfully to the connected project without changing rows or ownership rules.
- Added `supabase/seed.sql`: four courses, eleven assignments with a 2-video/2-reading/2-quiz/4-paper/1-post mix, 31 steps, detections, weekly allocations, calibration samples/multipliers and activity. Stable IDs prevent duplicate inserts and preserve progress on repeat execution.
- Expanded the existing `supabase/config.toml` with local ports, Auth defaults, enabled seed and gateway verification settings. Local name is independent of the original hosted reference.
- Added `scripts/audit-reproducibility.mjs`, a read-only text scan that prints paths/line numbers/categories, not matched values.
- Added isolated database and existing-function contract tests. No AI or Moodle endpoint was called.

## Verification performed

```text
Test Files  23 passed (23)
Tests       184 passed (184)
```

The full `bunx vitest run` suite passed. It includes:

- Empty isolated PGlite PostgreSQL database: all ordered migrations apply, all ten application tables have RLS and authenticated CRUD grants.
- Required schema drift fields, assignment uniqueness and invalid step-status rejection.
- Seed counts/mix, one urgent 360-minute assignment within twelve hours, one red/one amber/nine green fixture states, steps for every assignment, calibration samples and no duplicate rows on repeat load.
- Fixture owner can read 31 steps; another authenticated fixture identity reads none. Supabase roles, schema usage and `auth.uid()` are stubbed for this isolated test; the real Auth service is not running.
- All three existing function handlers reject anonymous calls with HTTP 401 and CORS.
- Missing model key returns HTTP 200 typed `NOT_CONFIGURED`; missing Moodle encryption key returns a typed error before external access.
- Existing provider/estimation/refinement tests verify mock selection, cached-data handling and deterministic estimation failure recovery.

Automatic editor build log: **build OK**, latest observed 15:12:01 UTC. The agent did not manually run `npm run build`, per platform restrictions; the actual preview build succeeded.

Playwright opened `/`, reached `/auth`, showed the sign-in form and observed **zero runtime errors**; screenshot visually inspected. A real signed-in session was unavailable: the session tool refuses to mint sessions for this user-managed Supabase project. Map/Execute/Settings/Connect end-to-end against a real account were therefore **not verified in this turn**. Existing fixture/component tests are not a substitute for that.

TOML parses, the configured seed file exists, and dev/build/preview/test scripts all exist in `package.json`. `.nvmrc` matches the available tested Node version. npm install/build/preview were not walked on a separate machine; npm has no lockfile, while the repository has `bun.lock`.

## Credential and project-binding inventory

Current tracked text scan reports four value-bearing matching lines, all in platform-managed `.env`:

| Location | Classification | Action |
| --- | --- | --- |
| `.env:1` | Original project reference (`SUPABASE_PROJECT_ID`) | Managed tracked file; removal blocked. Not a secret. |
| `.env:2` | Public anon-role JWT (`SUPABASE_PUBLISHABLE_KEY`) | Removal blocked; never printed in audit output. |
| `.env:3` | Original Supabase project URL (`SUPABASE_URL`) | Removal blocked. |
| `.env:4` | Public Vite project reference | Managed tracked file; app does not read this variable. |
| `.env:5` | Public anon-role JWT (`VITE_SUPABASE_PUBLISHABLE_KEY`) | Removal blocked; now read from environment rather than source. |
| `.env:6` | Original Supabase project URL (`VITE_SUPABASE_URL`) | Removal blocked; a reviewer must replace their local value. |
| Former `src/integrations/supabase/client.ts:6–7` | Literal project URL and public anon key | Replaced with environment reads. |
| Former `src/security/checks.ts:53` | Original-project fallback URL | Removed; runner uses caller environment/front-end public values, and skips network cases as MANUAL when absent. Historical results were not rerun/overwritten. |
| Former `supabase/config.toml:1` | Original hosted project reference | Replaced by local project name; hosted CLI uses `supabase link`. |

Public anon JWT claims were checked locally for classification; no private value or session token was echoed. The scan found no matching private API key/private-key pattern in current tracked text. Seven tracked PDF/image evidence artifacts were inspected via extracted text/OCR and had no matching credential/project-URL patterns. OCR/regex are heuristic; **absence of a match is not proof that no secret ever existed**, and old Git history was not rewritten or exhaustively certified. Vendor/API URLs and fake `.example`/`.invalid` fixture URLs remain because they are not bindings to the owner's project. The generated helpers contain only key-prefix detection and environment reads, not private credentials.

The platform refused these exact operations:

1. `.gitignore` edit: **“The file '.gitignore' was not changed: the platform manages it, and it decides which files are saved with the project. It must not be edited by hand with any tool, shell commands included; when it needs a change, ask the user to make it.”** No changes from that patch were applied.
2. Untracking `.env`: **“error: 'git rm --cached' on .env is not allowed. Published builds only include committed files, so .env must stay tracked; leave it as it is and keep it out of .gitignore. Do not attempt to circumvent this.”** The local file was not deleted or changed.
3. Creating `supabase/functions/.env.example`: **“New Supabase Edge Functions are not created in this TanStack project. Blocked paths: supabase/functions/.env.example.”** No file was created and no alternative write attempted. The exact empty template is in README for independent-clone creation.

Consequently `.env` and `supabase/functions/.env` are **not confirmed ignored**, the required function-secret template **does not exist**, and the request to have no original project value committed **is not met**. This cannot be silently called complete. Do not add private secrets until the independent clone's ignore rules are in place.

## Function completeness audit

All three `index.ts` files exist. Connect's shared `validation.ts` dependency also exists. Secrets are read with `Deno.env.get`, CORS is present, expected failures use typed bodies, and missing/invalid user authentication is rejected. Fixture tests cover these contracts without network access.

Deployed-source download was attempted into `/tmp/nextstep-deployed`, not the working tree. It failed: **“Access token not provided. Supply an access token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable.”** Therefore deployed parity is unverified. No function was provisioned/deployed or moved to another runtime.

Existing robustness gaps remain: connect encryption can throw for a malformed key; auth initialisation and unexpected upstream JSON can escape typed-error paths. The configured seven Moodle permissions include activity completion, but the checked-in sync calls six and does not fetch activity-completion data. Sync's item response lacks rich description/word-count/rubric fields. These are findings, not silently changed product behaviour.

## Why full acceptance remains blocked

| Requirement | Status / blocker |
| --- | --- |
| `supabase db reset` against an empty service | **Unverified.** `supabase start` failed: “docker: command not found (podman also not found)”. SQL replay passed independently; Auth and containers were not tested. |
| Seed visible immediately after a new signup | **Not met.** Seed belongs to a known public fixture UUID with no Auth account. RLS correctly hides it from other users, and MockProvider does not read database fixture assignments. No known password/Auth-schema write was added. |
| All-features credential-free persisted demo | **Not met.** Existing toggle activates mock coursework but does not seed calibration/database state. New users initially see Connect; demo is not automatically enabled. |
| Every ordinary assignment decomposes without model key | **Not met by current planning rules.** Lower-level `planAssignment` returns labelled local fallback, but `tailoredSteps` intentionally refuses it; ordinary AI-only rebuilding leaves work unplanned. Local video/empty-announcement paths and deterministic minutes still work. |
| Local `http://localhost:8080` Moodle works | **Not met.** Current validator intentionally refuses HTTP/private/local hosts. Container localhost is not the host computer either. Public HTTPS is required; security rules were not weakened. |
| Both examples/ignored secrets/no project binding | **Blocked by platform restrictions** above; root example exists and source binding is removed. |
| Functions deployable and matching live | **Present, not certified.** No management access/source parity or fresh deployment verification available. |
| Build and regression tests | **Verified through automatic build + 184 passing tests.** No manual npm build performed. |
| Design, five tabs, math/thresholds unchanged | **Preserved.** No view, CSS, planning, estimation, calibration or buffer-engine edits. |

The connected project's migration tool also reported four **pre-existing** advisor warnings: three authenticated SECURITY DEFINER completion functions and disabled leaked-password protection. The completion functions check ownership; none were changed by this migration. No paid protection setting was enabled or newly claimed.

This audit completes the feasible packaging work and names the remaining limitations instead of claiming a clean-clone certification.