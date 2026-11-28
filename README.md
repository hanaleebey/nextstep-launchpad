# NextStep

NextStep is an executive-function coach for college students with ADHD, built by Audrie Hana Lee Bey. It reduces the repeated decision of what to do next by presenting one actionable, timeboxed step from a student's coursework. It combines Moodle ingestion, effort estimates, capacity allocation, progress tracking and re-planning, rather than acting as a conventional calendar or task list.

## The five tabs

| Tab | Purpose |
| --- | --- |
| **Map** | Assignments, deadlines, steps, progress, buffer badges, a seven-day timeline and activity. |
| **Execute** | One next action, completion criteria, timer and Done / Blocked / Stopped controls. |
| **Running behind** | At-risk work, a recommended re-plan, deadline impact and recorded actions. |
| **Connect** | Connect Moodle, detect work, then confirm a plan. |
| **Settings** | Account, weekly capacity, timezone, planning preferences, calibration, connection and demo controls. |

**Actual stack:** React 19, TypeScript, TanStack Start/Router, Vite, Tailwind CSS and shadcn/ui; Supabase Postgres/Auth and three existing Deno Edge Functions. The browser does not call Moodle or the model provider directly.

> **Reproducibility status:** this guide distinguishes working paths from outstanding limitations. The browser previously hardcoded the original Supabase project; it now reads your environment. Missing live-schema changes have an appended migration. A local SQL seed has been added. Docker-backed reset, deployment/source parity and a fully populated credential-free **database-backed** demo are not certified; see [verification status](#verification-status-and-clean-clone-audit). No product rules or presentation have been changed to hide those limitations.

## Prerequisites

Supabase is a service that supplies a PostgreSQL database, sign-in and a place to run server-side functions. You can use its hosted free tier or run its services locally with Docker.

| Item | Required? | Cost | Typical setup time |
| --- | --- | --- | --- |
| Git | Yes, to clone | Free | 5 minutes |
| Node.js **22.23.5** and npm | Yes | Free | 5–10 minutes |
| Supabase CLI | Yes, for schema/functions | Free; `npx` can run it | 5 minutes |
| Supabase account + new project | Required for hosted setup; not for fully local services | Free tier available; paid plans optional | 10 minutes |
| Docker Desktop or compatible Docker engine | Only for local Supabase/reset/functions | Personal-use options available; business licensing varies | 10–20 minutes plus image downloads |
| Model provider account/API key | Optional for the app; required for AI-only assignment planning/rebuilding | Groq/Gemini have quota-limited free options; paid usage varies | 5–15 minutes |
| Google Cloud project + YouTube Data API v3 key | Optional | API quota applies; check current Google terms | 10–20 minutes |
| Moodle site with administrator-authorised REST web services | Optional for mock evaluation; required for live ingestion | Self-hosted Moodle software is free; hosting/site plans vary | 30–60 minutes if you control the site; institution approval can take longer |
| Moodle enrolled student + service-bound token | Only for live ingestion | Usually no separate key fee | 10–20 minutes after admin setup |

Use `nvm use` if you have nvm; `.nvmrc` pins the tested Node version. TanStack Start requires Node ≥22.12; use the pinned version because the security/report scripts import TypeScript directly using Node's type stripping. Node 18 and Node 20 are **not** supported for this checkout.

## Quick start — already-configured hosted Supabase

Use a **new or explicitly disposable project** when evaluating migrations. Do not reset someone else's project.

```bash
git clone <your-repo-url> nextstep
cd nextstep
nvm use                     # optional, if nvm is installed
npm install
cp .env.example .env
# Fill in .env with YOUR Supabase URL and public key, as described below.
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npm run dev
```

For live Moodle/AI, complete the secret setup before deploying:

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy agent-estimate
npx supabase functions deploy moodle-connect
npx supabase functions deploy moodle-sync
```

For mock evaluation, functions and external keys are not needed. Sign up and use **Settings → Connection and data → Use demo data**. See the exact demo limits below.

## Step-by-step hosted setup

### 1. Create your Supabase project

1. Open [Supabase](https://supabase.com), sign in, select an organisation and choose **New project**.
2. Choose a project name, database password and region. Keep the password in a password manager.
3. After provisioning, open **Project Settings → Data API** for the Project URL. In some dashboard versions the URL is under **API**.
4. Open **Project Settings → API Keys** and copy the publishable key or legacy `anon` key. **Do not use a secret or service-role key in the browser.**
5. Copy the project reference from **Project Settings → General** for `supabase link`.
6. Open **Authentication → URL Configuration** and set the Site URL and redirect allow-list to the exact local URL Vite prints. Add your deployment URL when you host the app.
7. Hosted email confirmation may be enabled: confirm the signup email before signing in. For a disposable local evaluation only, confirmation can be disabled under **Authentication → Sign In / Providers → Email** (older dashboards: **Providers → Email**).

### 2. Configure the front end

```bash
cp .env.example .env
```

Edit the two values in `.env`:

```dotenv
VITE_SUPABASE_URL=<your-project-api-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-public-publishable-or-anon-key>
```

These are exactly the names read by `src/integrations/supabase/client.ts`. `VITE_SUPABASE_ANON_KEY` is **not** read. There is no hardcoded project fallback. Restart your local Vite process after changing `.env`.

**Every `VITE_` value is public and visible in the browser. Secrets must never have that prefix.** RLS protects rows; hiding a public API key does not replace RLS.

**Platform restriction:** this Lovable checkout requires its `.env` to remain tracked and blocks edits to `.gitignore`. Its public configuration is therefore still present in repository history/current tracked `.env`; an empty example does not remove that. In your independent GitHub clone, before adding private configuration, add the following ignore rules and remove `.env` from the index while keeping your local copy. This step cannot be performed inside this editor.

```gitignore
.env
.env.*
!.env.example
supabase/functions/.env
supabase/functions/.env.*
!supabase/functions/.env.example
supabase/.temp/
supabase/.branches/
```

```bash
# Independent clone only; this platform refuses the equivalent operation.
git rm --cached -- .env
```

Never put model, Moodle or encryption credentials in `.env` with a `VITE_` name. Do not commit an actual credential. Old commits retain previously tracked values; if a **private** credential was ever committed, revoke/rotate it. Do not rewrite the shared Lovable repository history.

### 3. Apply the database schema

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Ordered migrations create **ten** tables, not nine: calibration needs `calibration_multipliers` as well.

| Table | Data |
| --- | --- |
| `users_settings` | Weekly hours, timezone, display name, default timebox and automatic planning preference. |
| `lms_connections` | Provider, site URL and encrypted token. |
| `courses` | Course names/codes and Moodle IDs. |
| `assignments` | Title, deadline, status, estimates/source/manual flag, actual time, progress and buffer. |
| `steps` | Assignment reference, order, instruction, timebox, JSON completion criteria, status and scheduled date. |
| `estimate_events` | Estimate/actual samples, confidence, AI-refined flag and calibration inclusion/exclusion. |
| `detected_items` | Detected type, signals, estimate, confidence, assignment reference, manual flag and details. |
| `weekly_allocations` | Owner, assignment, Monday week start and allocated minutes. |
| `activity_log` | Sync, estimate, re-plan, calibration and completion messages. |
| `calibration_multipliers` | Per-owner, per-type learned multiplier and sample count. |

Each table has explicit Data API grants and RLS. Parent rows are scoped to `auth.uid() = user_id`; `steps` and `estimate_events` inherit ownership through `owns_assignment(assignment_id)` because they do **not** have a `user_id` column. A `FOR ALL` owner policy covers reading, creation, editing and deletion. Completion RPCs check assignment ownership too.

Migrations include the course `(user_id, lms_course_id)` uniqueness, assignment `(user_id, lms_assignment_id)` uniqueness, step assignment/order index and weekly user/week index. The appended migration restores the previously missing `detected_items.details`, `estimate_events.calibration_used` and `estimate_events.excluded_reason`; old migration files were not rewritten.

In **Table Editor**, confirm all ten tables exist. `supabase db push` applies schema migrations, **not** the local seed. `supabase db reset` is the disposable-local reset path below, not an instruction to destroy a hosted database.

### 4. Prepare server-side secrets

The editor blocked creation of `supabase/functions/.env.example`, reporting: **“New Supabase Edge Functions are not created in this TanStack project. Blocked paths: supabase/functions/.env.example.”** Existing functions are present, but the required template is still missing. Create it in your own clone using this exact template, then copy it to the ignored `.env` file:

```dotenv
# Server-only secrets. NEVER prefix these with VITE_.
# Optional AI provider key; required for AI-only rebuild/planning.
MODEL_API_KEY=
# OpenAI-compatible API root; omit the variable to use the OpenAI default.
MODEL_BASE_URL=
# Primary model ID; omit the variable to use gpt-4o-mini.
MODEL_NAME=
# Optional second model ID on the SAME provider.
MODEL_NAME_FALLBACK=
# Optional YouTube Data API v3 key for public video durations.
YOUTUBE_API_KEY=
# Moodle token encryption: base64 of exactly 32 random bytes, shared by connect/sync.
MOODLE_TOKEN_KEY=
```

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Fill only the settings you use. **Remove unused blank optional model-setting lines** from the real `.env`: defaults use `??`, so an empty `MODEL_BASE_URL=` or `MODEL_NAME=` is not the same as an absent variable. `MODEL_API_KEY=` empty is treated as unconfigured.

Generate the encryption secret **on your machine**:

```bash
openssl rand -base64 32
```

Copy that result into `MOODLE_TOKEN_KEY` in the ignored function `.env`. Do not reuse a model API key as an encryption key. Both Moodle functions read **only `MOODLE_TOKEN_KEY`**, not `TOKEN_ENCRYPTION_KEY`. If you already have an encryption key, it must decode from base64 to exactly 32 bytes; a 64-character hex string is not the expected format. Changing the key makes saved tokens unreadable; reconnect Moodle after rotation.

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase secrets list
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` inside its functions. Do not overwrite them with another project's values. No custom `SUPABASE_SERVICE_ROLE_KEY` is needed by these three functions: they use the authenticated user's client/RLS.

### 5. Deploy the three existing functions

```bash
npx supabase functions deploy agent-estimate
npx supabase functions deploy moodle-connect
npx supabase functions deploy moodle-sync
npx supabase functions list
```

| Function | Input | Returned data |
| --- | --- | --- |
| `agent-estimate` | `{ mode: 'plan' \| 'refine', assignment }` | `{ minutes, confidence, steps }` or `{ error: { code, message } }`. Model failures use HTTP 200. Missing/invalid user authentication uses HTTP 401. |
| `moodle-connect` | `{ siteUrl, token }` | Site/user identity on success; otherwise `{ ok: false, error: { code, message } }`. Stores AES-GCM ciphertext. |
| `moodle-sync` | `{}` | `{ ok, partial, summary, warnings, items }` or `{ ok: false, partial: true, error }`. Reads the saved connection. |

All three read secrets through `Deno.env.get`, return CORS headers and check the caller with Supabase Auth `getUser()`. The config keeps gateway JWT verification enabled. If an authenticated request using a newer signing-key format is rejected by the **gateway** before reaching a handler, investigate the gateway verification mode; the handler's `getUser()` check must remain enabled. Do not treat disabling authentication as a fix.

**Known robustness gaps, unchanged:** the connect handler's encryption operation has no error boundary for malformed keys; shared auth initialisation and some malformed upstream payloads can also throw outside the typed-error paths. Missing encryption keys do return `NOT_CONFIGURED`. Source parity with the currently deployed functions could not be checked because CLI download required a management access token. No function was deployed during this packaging review.

## Obtain each external credential

### OpenAI-compatible model providers

`agent-estimate` posts to `<MODEL_BASE_URL>/chat/completions` with a Bearer API key. Pick a model currently available to your account; these example IDs are configuration examples, not promises of future availability. A fallback model must be available on the same API root.

| Provider | Click path | API root (`MODEL_BASE_URL`) | Example model ID |
| --- | --- | --- | --- |
| Groq | [Groq Console](https://console.groq.com) → **API Keys → Create API Key** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Gemini | [Google AI Studio](https://aistudio.google.com) → **Get API key / API keys → Create API key**, choose a Cloud project | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| OpenRouter | [OpenRouter](https://openrouter.ai) → profile → **Keys → Create Key** | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| OpenAI | [OpenAI Platform](https://platform.openai.com) → select project → **API keys → Create new secret key**; configure billing if needed | `https://api.openai.com/v1` | `gpt-4o-mini` |

The project owner currently uses **Groq**. The code does not default to Groq: configure the base URL and model explicitly in the ignored function `.env`.

```dotenv
MODEL_API_KEY=<your-provider-key>
MODEL_BASE_URL=https://api.groq.com/openai/v1
MODEL_NAME=llama-3.3-70b-versatile
```

### YouTube Data API v3

1. Open [Google Cloud Console](https://console.cloud.google.com) and create/select a project.
2. **APIs & Services → Library → YouTube Data API v3 → Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Open the key → **API restrictions → Restrict key → YouTube Data API v3 → Save**.
5. Server functions have no fixed browser referrer and usually no fixed outbound IP: do not apply a browser referrer restriction. Use an IP restriction only if your server actually has a fixed egress IP.
6. Save the key as `YOUTUBE_API_KEY` in the ignored function `.env`, then upload secrets again.

The sync batches `videos.list` requests at up to 50 IDs. Missing keys or lookup failures leave duration null; the estimator uses 20 minutes at low confidence **if no usable stated duration is available**. YouTube oEmbed does not provide duration. Private, unavailable or paywalled material cannot reliably be measured.

### Moodle administrator setup

Paths vary by Moodle version; the following are Moodle 4/5 administration paths. An institutional administrator must approve this access. A correct token cannot override site policy.

1. **Site administration → Advanced features → Enable web services**: enable and save.
2. **Site administration → Server → Web services → Manage protocols** (some versions: **Plugins → Web services**) → enable **REST**.
3. **Server → Web services → External services → Add**: create an enabled service named/shortnamed `nextstep`.
4. Open that service → **Functions → Add functions** and add the seven read functions below.
5. **Users → Permissions → Define roles → Add a new role**: create a service role with system context allowed, and allow `webservice/rest:use`.
6. **Users → Permissions → Assign system roles**: assign that role to the **student** account. Keep the student's normal course enrolment/permissions too.
7. If the service uses **Authorised users only**, add the student to that service's authorised users and check dates/IP restrictions.
8. Enrol the student in the test courses; make the needed activities visible to that student.
9. **Server → Web services → Manage tokens → Add**: choose the **student** and the `nextstep` service. Copy the token securely and check any expiry/IP restrictions.
10. Enable completion tracking if testing Moodle activity completion, but do not assume NextStep's local step progress is the same as Moodle completion.

| Read function | Purpose |
| --- | --- |
| `core_webservice_get_site_info` | Validate token and identify its user/site. |
| `core_enrol_get_users_courses` | Read the user's enrolled courses. |
| `core_course_get_contents` | Read sections and modules. |
| `mod_assign_get_assignments` | Read assignment metadata/deadlines. |
| `core_calendar_get_action_events_by_timesort` | Read calendar deadlines. |
| `mod_quiz_get_quizzes_by_courses` | Read quiz deadlines and time limits. |
| `core_completion_get_activities_completion_status` | Service permission for activity-completion experiments; the checked-in sync does **not** currently call this function. |

### The two Moodle tokens

| Token | Identity | Use |
| --- | --- | --- |
| **Student token** | Enrolled student authorised for `nextstep` | The token entered into NextStep; returns only coursework that student can access. |
| **Admin token** | Administrator | Optional manual test-course creation/seeding with suitable separate services/tools; **not** the token used in the app. The seven-read-function service itself does not create courses. |

An admin token can hide permission/enrolment bugs by seeing more data. A student-generated personal token may belong to a different service and lack these functions; it is not interchangeable with a student token bound to `nextstep`.

### Test the student token before blaming the app

On your own terminal, set `MOODLE_SITE_URL` to the site root and read the token without echoing it. Do not paste credentials into chat or screenshots.

```bash
export MOODLE_SITE_URL="https://<your-moodle-site>"
read -rs -p 'Student Moodle token: ' MOODLE_STUDENT_TOKEN; printf '\n'
```

Then one curl command sends the token in the POST body, not a logged query-string URL:

```bash
curl --silent --show-error --request POST \
  "$MOODLE_SITE_URL/webservice/rest/server.php" \
  --data-urlencode "wstoken=$MOODLE_STUDENT_TOKEN" \
  --data-urlencode 'wsfunction=core_webservice_get_site_info' \
  --data-urlencode 'moodlewsrestformat=json'
```

```bash
unset MOODLE_STUDENT_TOKEN
```

Expected: JSON containing `sitename` and `userid`. An `exception`/`errorcode` points to Moodle configuration, not NextStep. Avoid saving terminal output containing personal information.

## First-run walkthrough

1. Start `npm run dev`, open the URL it prints, and sign up with email/password.
2. Confirm email if your hosted Supabase requires it, then sign in. A default `users_settings` row is created by the app.
3. **Settings → Study capacity**: set weekly available hours and timezone; edits autosave.
4. **Connect**: enter the public HTTPS Moodle site root and student token. The token is cleared after submission.
5. Successful connection runs **Auto-detect**; review detected signals, estimates and confidence. Inline estimate edits are marked manual.
6. **Confirm plan → Build my plan**: creates/summarises planned work and takes you to Map. AI-only planning can remain unplanned when no model is configured; see demo/fallback limits.
7. **Map → Open**: inspect an assignment's step breakdown and criteria; work on it in Execute.
8. **Execute**: use the timer, then Done, Blocked or Stopped. Saved real-assignment progress survives reloads; a changed Moodle due date resets the affected plan/progress.
9. **Running behind**: inspect the recommendation and accept it when appropriate. Actual timed work supplies calibration samples.

## Demo mode — no Moodle, model or YouTube credentials

1. Configure **your Supabase public URL/key**, apply migrations and sign up.
2. **Settings → Connection and data → Use demo data** (the shell has the same toggle).
3. Visit Map, Execute and Running behind. `MockProvider` supplies four courses, eleven assignments and prebuilt steps without calling Moodle or AI.

**Exact current behaviour:** without a connection, the first screen is **Connect**, not an automatically enabled demo. Selecting Map still resolves MockProvider. Demo uses browser/session mock data, **not** a SQL seeding action. Its existing mix is one video, one reading, two quizzes, five papers and two posts; the new SQL seed has the requested two/two/two/four/one mix. The toggle does not create calibration records, and Settings reads calibration from Supabase, so a brand-new user's calibration is empty. Mock progress is not a substitute for database-backed persistence. These differences are intentionally documented rather than changing product behaviour during packaging.

### Database seed

`supabase db reset` loads `supabase/seed.sql` when run locally. It contains four courses, eleven assignments, 31 specific steps, eleven detected items, four weekly slices, six calibration samples, two multipliers and three activity entries. Dates are relative to reset/seed time; exactly one assignment is due within twelve hours with 360 minutes of remaining allocated work. Initial fixture badges are one red, one amber and nine green. Every insert uses stable IDs and `ON CONFLICT DO NOTHING`; rerunning the seed does not duplicate or reset existing rows.

The public rows belong to the **fixture UUID** `00000000-0000-4000-8000-00000000d001`. There is **no built-in password, no automatically created Auth user and no Auth-schema modification**. Other signed-up users cannot read these rows through RLS. The seed is a database test fixture, not a completed UI demo integration.

If you want its settings/calibration/history attached to a disposable local test account, sign up using `demo@nextstep.example`, then run this once in **local Studio → SQL Editor**. This transfers only fixture-owned public rows; it does not create an LMS connection or change provider selection.

```sql
DO $$
DECLARE
  target uuid;
  fixture constant uuid := '00000000-0000-4000-8000-00000000d001';
BEGIN
  SELECT id INTO target FROM auth.users WHERE email = 'demo@nextstep.example';
  IF target IS NULL THEN RAISE EXCEPTION 'Create the local demo account first'; END IF;
  UPDATE public.users_settings dst
    SET weekly_available_hours = src.weekly_available_hours, timezone = src.timezone
    FROM public.users_settings src WHERE src.user_id = fixture AND dst.user_id = target;
  INSERT INTO public.users_settings (user_id, weekly_available_hours, timezone)
    SELECT target, weekly_available_hours, timezone FROM public.users_settings WHERE user_id = fixture
    ON CONFLICT (user_id) DO NOTHING;
  DELETE FROM public.users_settings WHERE user_id = fixture;
  UPDATE public.courses SET user_id = target WHERE user_id = fixture;
  UPDATE public.assignments SET user_id = target WHERE user_id = fixture;
  UPDATE public.detected_items SET user_id = target WHERE user_id = fixture;
  UPDATE public.weekly_allocations SET user_id = target WHERE user_id = fixture;
  UPDATE public.activity_log SET user_id = target WHERE user_id = fixture;
  UPDATE public.calibration_multipliers SET user_id = target WHERE user_id = fixture;
END $$;
```

Do not run this against a real student's database. The transfer is optional and is not part of an automatic first-run demo. Since MockProvider does not read these assignments, Map still displays its own mock semester; a fully database-backed no-LMS provider would be a separate product change.

### Verified degradation contracts and limits

| Missing dependency | Current result |
| --- | --- |
| `MODEL_API_KEY` | Pure estimation still returns deterministic minutes. The low-confidence refinement path keeps them when AI fails. `planAssignment()` can return local steps marked `source: 'fallback'` with a note, **but `tailoredSteps()` rejects that fallback for ordinary assignments**, so Map AI rebuilding/AI-only planning leaves them unplanned and reports AI unavailable. Videos without extra instructions and empty announcements have local plans. |
| `YOUTUBE_API_KEY` | Sync leaves durations null; a video with no stated duration gets 20 minutes, low confidence. A usable stated duration is honoured instead. |
| Moodle connection | Connect prompt appears; MockProvider is available and no live sync is required. |
| Moodle unreachable | Saved rows remain readable; provider reports cached data rather than swapping in fake Moodle rows. |

Therefore “every assignment always gets built-in steps when AI is missing” is **not** an accurate claim for the current product. No generic templates were reintroduced during this work.

## Entirely local backend (Docker required)

The config uses local project name `nextstep-local`, API port 54321, database 54322 and Studio 54323. Hosted project binding comes from `supabase link`, not a hardcoded project reference.

```bash
npx supabase start
npx supabase db reset
```

Use the API URL and public key shown by `supabase start` in front-end `.env`. Get them again with `npx supabase status`. Keep service-role keys out of browser configuration and screenshots.

Create the function template/file as described above. For mock evaluation, it may contain just a comment and no external credentials. For Moodle, set a valid `MOODLE_TOKEN_KEY`. In separate terminals:

```bash
npx supabase functions serve --env-file supabase/functions/.env
```

```bash
npm run dev
```

This is the requested command sequence, but it was **not executed successfully in this sandbox**: Docker and Podman are unavailable. The migration/seed SQL is tested independently in PostgreSQL via PGlite; that does not verify Auth, gateway behaviour, container networking or the full CLI reset.

**Local Moodle correction:** the current connection validator rejects HTTP, localhost, private IPs and `.local` hosts even when functions are served locally. Also, inside a function container, `localhost` means that container, not the host machine. Consequently a Moodle at `http://localhost:8080` does **not** currently connect. Use an explicitly public HTTPS endpoint/tunnel with Moodle's configured site root matching it, or treat private-local Moodle support as a separate security-reviewed change. Deployed functions also require a reachable public HTTPS Moodle URL. This guide does not weaken the existing SSRF guard to claim otherwise.

If Moodle occupies port 8080, run the front end at another port and add its exact URL to Auth redirect settings:

```bash
npm run dev -- --port 5173
```

```bash
npx supabase stop
```

## Complete environment reference

### Browser (`.env`, public)

| Name | Required / effect if missing |
| --- | --- |
| `VITE_SUPABASE_URL` | Required. Client cannot initialise without your API URL; setup error names the missing configuration. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Required. Public publishable or legacy anon key. Client cannot initialise without it. |

`VITE_SUPABASE_PROJECT_ID` may be supplied by the editor, but this app does not read it. `VITE_SUPABASE_ANON_KEY` is not an alias.

### Edge Function secrets (never `VITE_`)

| Name | Reader | Effect if absent |
| --- | --- | --- |
| `MODEL_API_KEY` | `agent-estimate` | HTTP 200 typed `NOT_CONFIGURED`; no model request. Deterministic estimates survive; AI-only plans may remain unplanned. |
| `MODEL_BASE_URL` | `agent-estimate` | Defaults to `https://api.openai.com/v1`; must be explicitly set for Groq/Gemini/OpenRouter. Blank is not absent. |
| `MODEL_NAME` | `agent-estimate` | Defaults to `gpt-4o-mini`; configure an available model for your provider. Blank is not absent. |
| `MODEL_NAME_FALLBACK` | `agent-estimate` | No second-model retry. |
| `YOUTUBE_API_KEY` | `moodle-sync` | Video duration lookup skipped; deterministic fallback/stated length used. |
| `MOODLE_TOKEN_KEY` | Both Moodle functions | Typed `NOT_CONFIGURED`. Invalid key formatting can still throw in connect; sync reports unreadable token. |
| `SUPABASE_URL` | All three functions; provided by Supabase | Auth client cannot initialise correctly. |
| `SUPABASE_ANON_KEY` | All three functions; provided by Supabase | User authentication cannot be checked correctly. |

`TOKEN_ENCRYPTION_KEY`, `MODEL_API_KEY` and `MOODLE_TOKEN_KEY` are not interchangeable. The checked-in Moodle functions do not implement a `TOKEN_ENCRYPTION_KEY` alias.

### Optional tooling / unused generated server helpers

The current screen flows use the browser repository and the existing functions. Generated server helpers also read the following, but they are not needed to view the app in mock mode; do not configure them “just in case”.

| Name | Reader / effect |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Generated authenticated server middleware; required only if that helper is called. |
| `SUPABASE_SERVICE_ROLE_KEY` | Generated privileged server client; only for verified privileged operations. Not used by the three existing functions. Never expose to a browser. |
| `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS` | Generated cron-auth helper; no documented NextStep cron setup is required. |
| `SECURITY_TEST_ACCESS_TOKEN` | Optional authorised second-account security probe; a user session, not an admin key. Do not log it. |
| `SECURITY_TEST_OTHER_USER_ID`, `SECURITY_TEST_OTHER_ASSIGNMENT_ID` | IDs of fixtures belonging to the other account for the RLS probe. |
| `SECURITY_BUILD_COMMIT` | Optional security-report commit label; otherwise reads Git HEAD. |

The security runner reads `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` or falls back to the two documented `VITE_` values from `.env`; it no longer defaults to the original project. Running it overwrites `public/security-results.json` and contacts Supabase Auth with deliberate invalid requests; run only against your authorised test project. The historical report/evidence is not proof about your installation.

## Project structure

```text
src/
  components/             Shell, five surfaces and shared UI controls
  routes/                 TanStack file routes; authenticated screens and sign-in
  integrations/supabase/  Public client, generated schema types and server helpers
  lib/db/                 Repository for application table reads/writes
  lib/lms/                Provider interface, mock/live providers, connect/sync clients
  lib/agent/              Estimates, allocation, decomposition, buffers, re-planning, calibration
  lib/session/            Session timer/Execute state
  types/                  Domain types
  security/               Fixture/authorised security cases and report configuration
  test/                   Test setup and cross-cutting tests, including isolated migration replay
supabase/
  config.toml             Local service defaults and function gateway configuration
  migrations/             Ordered schema changes, grants, RLS and completion functions
  seed.sql                Idempotent public-table local test fixture; no Auth account
  functions/
    agent-estimate/       OpenAI-compatible model planning/refinement
    moodle-connect/       Token validation, encryption and connection storage
    moodle-sync/          Read-only Moodle ingestion and YouTube duration lookup
scripts/                  Security runner, PDF generator and read-only packaging audit
public/                   Static assets, historical security JSON/PDF/evidence
.lovable/                 Editor metadata, not needed as an end-user feature
README.md                 Setup and limitations
.env.example              Empty browser configuration template
.nvmrc                    Tested Node version
```

`src/integrations/supabase/types.ts` is generated and must not be manually edited. The domain types/repositories also cover app-specific fields. The missing function-secret template is intentionally not shown as an existing file.

## Reviewer verification checklist

```bash
npm run test
npm run build
npm run preview
```

| Check | Expected result / qualification |
| --- | --- |
| `npm install` with pinned Node | Dependencies install; npm scripts exist. Bun users can use the committed `bun.lock`. No npm lockfile is provided, so npm dependency resolution is not fully frozen. |
| `npx supabase start` then `db reset` | With Docker: migrations apply and seed loads; needs verification on a Docker machine. Destructive only to the selected local database. |
| `npm run test` | Unit/fixture tests, including fresh migration replay and seed duplication checks, pass without AI or live Moodle. |
| Sign up/sign in | Requires correctly configured Supabase URL/key, Auth redirects and confirmation if enabled. |
| No LMS connection | Connect prompt, not a crash. |
| Settings → Use demo data | Mock courses and prebuilt actions load without Moodle/model/YouTube keys; fresh calibration remains empty. |
| Map → Open; Execute | Assignment criteria/action/timer visible. Mock interaction is not a database-persistence test. |
| Running behind | Mock urgent assignment exercises the risk presentation. |
| Database fixture queries | Four courses, eleven assignments, 31 steps; red/amber/green counts 1/1/9 for fixture owner. |
| Missing model key | Deterministic minutes survive; ordinary AI-only rebuild reports unavailable rather than silently claiming an AI plan. |
| Missing YouTube key | Unknown-duration video gets 20 minutes/low confidence; stated duration can override that fallback. |
| Valid student Moodle token | Site identity then detected work, subject to Moodle permissions and external availability. Not tested by fixture tests. |
| Real assignment completion/reload | Status/progress are stored by completion RPCs; confirm on your own signed-in project with real saved assignment IDs. |
| `node scripts/audit-reproducibility.mjs` | Lists matching tracked project URLs/credential patterns without printing values. Remaining tracked `.env` is a documented blocker. |

`npm run build` is a build, not a TypeScript checking command or a complete security assessment. `npm run preview` serves the generated preview using the existing Vite/TanStack setup; deployment target is configured by the existing Lovable Vite integration.

## Troubleshooting

| Symptom | Check / remedy |
| --- | --- |
| RLS returns no rows | Sign in; verify row ownership and explicit table grants. Seed fixture rows are owned by the fixture UUID, not your new account. Child rows require an owned assignment. Do not disable RLS. |
| Functions return 401 | Verify the session is signed in, not expired, and belongs to the same Supabase URL/key as the function deployment. Distinguish gateway rejection from handler `UNAUTHENTICATED`; check JWT signing/verification compatibility. |
| `NOT_CONFIGURED` from `agent-estimate` | Set `MODEL_API_KEY` for that function project. Deterministic estimation is still available; AI-only step rebuilding is not. |
| Model 404/unavailable | Set an available `MODEL_NAME` and correct compatible API root. Optional fallback model must exist on the same provider. |
| Model URL/model unexpectedly empty | Remove blank optional settings from the real function `.env`; absent variables trigger defaults, empty strings do not. |
| Moodle `Access control exception` | Service enabled? Student authorised? `webservice/rest:use` at system context? Required functions added? Token IP/expiry restrictions correct? |
| Moodle function returns empty arrays | Check student's enrolment, visibility, function permissions and actual content. A successful site-info call alone does not prove course access. |
| `core_enrol_get_users_courses` empty despite enrolment | Some managed sites have this limitation. This sync does **not** implement a calendar-derived course fallback; ask the site administrator to investigate service behaviour. |
| Unreachable Moodle | Public HTTPS root must match Moodle `wwwroot`, be reachable from the function runtime, and not redirect. HTTP/local/private hosts are deliberately rejected. |
| Missing video durations | Check YouTube API enabled/key restriction/quota and a public video ID. URL activities that expose only a Moodle wrapper may not reveal the underlying YouTube URL. |
| Invalid encryption key / AES key-length error | Use base64 of 32 bytes, not hex. Keep connect and sync on the same key. Reconnect after rotation. Connect can currently expose an unhandled failure for a malformed key. |
| “No steps planned yet” or AI unavailable | Ordinary tailored plans need a reachable model. Rebuild preserves existing finished steps; missing AI is not a guarantee of saved local decomposition. |
| Fresh demo calibration empty | Expected: toggle activates mocks but does not insert samples/multipliers. SQL fixtures require explicit ownership and are not automatic demo integration. |
| Missing public environment variables | Copy `.env.example`, fill the exact names and restart the local app. No original-project fallback exists. |

## Known limitations

- Single-user capstone scope; no production multi-tenant onboarding, Canvas, LTI, calendar sync or native mobile app.
- Moodle web services are an **administrator decision**. The app cannot bypass an institution's policy.
- Managed Moodle hosts may return empty course arrays despite correct enrolment. No alternative course-discovery path is implemented in this checkout.
- Paywalled, private, scanned or inaccessible content cannot reliably supply word counts/durations. Partial signals must not be mistaken for measured effort.
- Moodle rubrics are not generally supplied by these endpoints. Plans can only use instructions actually returned; the current sync item response omits rich description/rubric/word-count fields, so the app may not receive all instructor requirements.
- The checked-in sync uses six of the seven configured read functions; it does not fetch Moodle activity completion. Local step progress is its own system.
- No-Moodle mock evaluation works for the main surfaces, but the all-features, persisted, automatically enabled demo requested in the packaging brief is not implemented.
- Ordinary tailored planning requires AI even though the client has a lower-level deterministic fallback. Reintroducing generic templates would conflict with the existing assignment-specific planning behaviour.
- Local HTTP/private Moodle is blocked by the existing security validator. Container networking alone cannot fix that.
- Typed errors cover expected failures, not every exception in the existing function code. Complete robustness would need a separate minimal repair, not an undocumented packaging change.
- Leaked-password protection is disabled on the current free-tier project. Three existing SECURITY DEFINER completion functions are also flagged by the advisor; they are authenticated and check ownership. This review did not change those settings/functions.
- Historical security evidence remains associated with the original authorised test run. `/test-report` is restricted to the existing configured owner email; a new reviewer account is not automatically its owner.

## Estimation, capacity, buffers and calibration

These descriptions follow the checked-in engines; packaging did not change them.

| Work | Estimate |
| --- | --- |
| Video | Seconds ÷ 60, nearest minute, minimum one minute; unknown duration defaults to 20 minutes at low confidence unless a stated length is usable. |
| Reading | Words ÷ 200, rounded up. |
| Quiz | Its own positive time limit (seconds ÷ 60, rounded up), high confidence; otherwise question count ×1.5, rounded up. |
| Writing | Target words ÷250 ×1.2 for editing, rounded up. |
| Unknown work | 30-minute low-confidence fallback. |
| Empty announcement | Five minutes and one local “View announcement” action. |

**Capacity allocation:** weekly hours ×60 is the weekly minute budget. Fixed/signal work due in the selected Monday–Sunday week consumes that budget first; the remainder is shared among open-ended work by urgency. The engine applies floor/cap constraints and normalises to fit available capacity; if fixed work is at least the budget, it reports over capacity. Weekly slices are per assignment and week, not a promise of total project duration.

**Buffers:** the code correctly converts hours to minutes before calculating daily capacity:

```text
daily free minutes = weekly_available_hours × 60 ÷ 7
slack in days = days until deadline − remaining estimated minutes ÷ daily free minutes
```

Open-ended work uses its weekly slice; fixed/manual estimates account for saved progress. Green: slack >1 day. Amber: 0<slack≤1 day. Red: slack≤0, “No room to be behind”. A missing deadline yields infinite slack.

**Calibration:** after three usable timed samples of a type, a multiplier moves toward the median actual/estimated ratio with a 50% blend, clamped to 0.6–1.8. At five samples the highest/lowest ratios are trimmed. Untimed or sub-minute samples are excluded; actual time greater than three times the estimate or 180 minutes is treated as a possible forgotten timer, subject to the student's confirmation. These thresholds are unchanged.

## Verification status and clean-clone audit

| Acceptance item | Status |
| --- | --- |
| Empty-database `supabase db reset` succeeds | **Not certified:** no Docker/Podman in this sandbox. Ordered migrations and seed can be replayed in isolated PostgreSQL tests, but a full Supabase reset still needs a Docker verification. |
| Seed contains red/amber/green on first load | **Database fixture present:** 1/1/9 states, one urgent high-effort item. **Not automatic UI integration** with MockProvider or a newly signed-up user's UUID. |
| Demo works with no Moodle/model/YouTube | **Partial:** existing mock main surfaces do; fully populated fresh calibration, persisted demo and automatic demo default do not. |
| `npm run build` succeeds | Checked by the editor's automatic build, not manually run by this agent; see the audit notes for the actual observed result. |
| Both environment templates exist; no real value committed | **Not met:** root template exists; functions template creation and `.env` untracking/ignore changes are blocked. Source hardcoding removed, but managed tracked `.env` and historical commits retain public original-project configuration. |
| Three Edge Functions present/deployable | **Present:** all three sources plus connect validator. Deployed parity and a fresh deployment are unverified; functions were not redeployed. |
| Only Supabase needed for a populated app | **Main mock workflow available**, not a complete database-backed all-features demo. |
| No design/rule/behaviour changes | **Preserved:** no views, styles, buffer/estimate/calibration logic or AI-only planning rules changed. Only configuration, schema packaging, seed, tests and documentation were changed. |

Remaining clean-clone blockers are explicit: create the function-secret template outside this editor; stop tracking local `.env` in the independent clone; run Docker reset/serve; verify gateway signing-key compatibility; and treat persisted demo integration, local-private Moodle and unhandled-function-error repairs as separately scoped work. Every named npm script above exists. Optional external credentials have acquisition instructions; none are silently assumed for mock evaluation.

For the dated file-by-file findings, test output and exact tool refusals, see [docs/reproducibility-audit.md](docs/reproducibility-audit.md).
