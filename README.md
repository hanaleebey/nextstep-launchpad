# NextStep

An executive-function coach for college students with ADHD. NextStep pulls real coursework from **Moodle**, estimates how long each piece of material will take without asking the student, breaks assignments into tiny timeboxed steps, and re-plans the moment the student falls behind.

It is **not** a scheduler. Two ideas define it:

1. **Decision offloading** — the app decides the order and hands over a single next action, so the student never faces _"what should I do next?"_
2. **Timeboxing by construction** — every step has a fixed budget. _"Stop at 25 minutes, done or not"_ defeats Parkinson's law and perfectionism.

---

## Contents

- [What you get](#what-you-get)
- [Before you start: accounts and keys](#before-you-start-accounts-and-keys)
- [Quick start](#quick-start)
- [1. Get the code](#1-get-the-code)
- [2. Create the Supabase backend](#2-create-the-supabase-backend)
- [3. Configure environment variables](#3-configure-environment-variables)
- [4. Create the database schema](#4-create-the-database-schema)
- [5. Deploy the Edge Functions](#5-deploy-the-edge-functions)
- [6. Set the Edge Function secrets](#6-set-the-edge-function-secrets)
- [7. Get an AI model key](#7-get-an-ai-model-key)
- [8. Get a YouTube Data API key](#8-get-a-youtube-data-api-key)
- [9. Set up a Moodle site](#9-set-up-a-moodle-site)
- [10. Run the app](#10-run-the-app)
- [11. First-run walkthrough](#11-first-run-walkthrough)
- [Using it without Moodle (demo mode)](#using-it-without-moodle-demo-mode)
- [Running the backend entirely on your machine](#running-the-backend-entirely-on-your-machine)
- [Environment variable reference](#environment-variable-reference)
- [Project structure](#project-structure)
- [Verifying your install](#verifying-your-install)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [How the estimation and buffer logic works](#how-the-estimation-and-buffer-logic-works)

---

## What you get

Five tabs, one agent:

| Tab                | What it does                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Map**            | Semester overview: every assignment, deadline, decomposed step, progress, a buffer badge per assignment, a 7-day auto-scheduled timeline, and an activity feed. |
| **Execute**        | One next-action card: the step, a "good-enough done" checklist, a countdown timer, and three buttons — **Done / Blocked / Stopped at timebox**.                 |
| **Running behind** | Red alert when an assignment's buffer is exhausted, one recommended re-plan, the impact on every deadline, and a log of what the system did.                    |
| **Connect**        | Three-step onboarding: connect your LMS → auto-detect work → confirm the plan.                                                                                  |
| **Settings**       | Moodle connection, weekly available hours, timezone, manual estimate overrides, demo data and calibration toggles.                                              |

**Stack:** React + TypeScript + Tailwind CSS + shadcn/ui · Supabase Postgres + Edge Functions (Deno) · Moodle Web Services REST (read-only) · YouTube Data API v3 · any OpenAI-compatible LLM.

**The app never breaks if the AI is unavailable.** Every estimate has a deterministic fallback path, and step decomposition has a built-in planner. A missing model key degrades output quality; it does not produce a broken app.

---

## Before you start: accounts and keys

| You need                                           | Why                                         | Strictly required?                                  | Cost                                             | Time      |
| -------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------ | --------- |
| **Node.js 20 LTS** (18 minimum)                    | Run and build the front end                 | Yes                                                 | Free                                             | 5 min     |
| **Git**                                            | Clone the repo                              | Yes                                                 | Free                                             | —         |
| **Supabase account + project**                     | Database, auth, Edge Functions              | Yes                                                 | Free tier is enough                              | 10 min    |
| **An AI provider API key**                         | AI-backed estimation and step decomposition | No — app works without it                           | Free tiers exist (Groq, Google AI Studio)        | 5 min     |
| **Google Cloud project + YouTube Data API v3 key** | Real video durations for video assignments  | No — falls back to a 20-min low-confidence estimate | Free (10,000 units/day)                          | 15 min    |
| **A Moodle site where you are admin**              | The LMS the app reads from                  | No — demo mode covers evaluation                    | Free (Gnomio / MoodleCloud trial / local Docker) | 20–40 min |

Everything below is free-tier friendly. No paid services are required to run NextStep locally.

> **A note on scope.** This is a single-user capstone application, not a commercial multi-tenant product. It is designed to run against **your own** Supabase project and **your own** Moodle site. Multi-user accounts, LTI 1.3, calendar sync, mobile, and a Canvas provider are explicitly future work.

---

## Quick start

If you already have Supabase, an AI key, and Moodle configured, this is the whole thing:

    git clone <your-repo-url> nextstep
    cd nextstep
    npm install
    cp .env.example .env          # then fill in the two Supabase values
    npx supabase link --project-ref <your-project-ref>
    npx supabase db push
    npx supabase functions deploy agent-estimate moodle-connect moodle-sync
    npx supabase secrets set MODEL_API_KEY=... YOUTUBE_API_KEY=...
    npm run dev

Otherwise, work through sections 1–10 in order.

---

## 1. Get the code

    git clone <your-repo-url> nextstep
    cd nextstep
    npm install

> **Script names.** This README uses `npm run dev`, `npm run build`, and `npm run preview`. If your fork defines different names, use whatever is in the `scripts` block of `package.json`. The install command is unchanged.

---

## 2. Create the Supabase backend

You have two options. Pick one.

### Option A — Hosted Supabase project (simplest)

1. Sign up at **supabase.com** and create a new project.
2. Pick a region close to you and save the database password somewhere safe.
3. Wait ~2 minutes for provisioning.
4. Go to **Project Settings → General** and copy the **Reference ID** (looks like `abcdefghijklmnop`).
5. Go to **Project Settings → API** and copy:
   - the **Project URL** (looks like `https://abcdefghijklmnop.supabase.co`)
   - the **anon / publishable** key (NOT the service_role key — never put that in the front end)

### Option B — Fully local Supabase (Docker)

Requires **Docker Desktop** running.

    npx supabase start

This boots Postgres, Auth, Storage, and the Edge Function runtime on your machine and prints the local API URL, anon key, and service key. Keep that output — you need it in section 3. Stop it later with `npx supabase stop`.

> Increasingly, Lovable-generated projects are configured against a specific Supabase project ID. If you run into a client that ignores your `.env`, check `src/integrations/supabase/client.ts` — some builds hardcode the URL and key as fallbacks. Replace them with the `import.meta.env` variables shown in section 3.

---

## 3. Configure environment variables

Copy the example file and fill it in:

    cp .env.example .env

    VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
    VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...

For **Option B**, use the values `supabase start` printed instead:

    VITE_SUPABASE_URL=http://127.0.0.1:54321
    VITE_SUPABASE_ANON_KEY=<local anon key printed by supabase start>

**Rules that matter:**

- Only variables prefixed `VITE_` reach the browser. They are **public** by design — the anon key is meant to be visible. Row Level Security is what protects the data.
- **Never** prefix a secret with `VITE_`. The Moodle token, model key, and YouTube key live only in Supabase Edge Function secrets (section 6).
- `.env` is git-ignored. `.env.example` is committed with empty values.

---

## 4. Create the database schema

The schema lives in `supabase/migrations/`.

**Hosted:**

    npx supabase link --project-ref <your-project-ref>
    npx supabase db push

**Local:**

    npx supabase db reset

`db reset` recreates the database, applies every migration in order, and loads `supabase/seed.sql` if one exists.

This creates nine tables, all with Row Level Security scoped to `auth.uid()`:

| Table                | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `users_settings`     | Weekly available hours, timezone                                                    |
| `lms_connections`    | Provider, site URL, encrypted token, connected at                                   |
| `courses`            | LMS course id, name, code                                                           |
| `assignments`        | Due date, status, estimated/actual minutes, estimate source, progress, buffer state |
| `steps`              | Order, title, timebox, done criteria, status (`todo`/`done`/`blocked`/`stopped`)    |
| `estimate_events`    | Estimated vs actual minutes per item type — feeds calibration                       |
| `detected_items`     | Auto-detected work items with signal value and confidence                           |
| `weekly_allocations` | Per-item, per-week capacity slice for open-ended work                               |
| `activity_log`       | Timestamped record of syncs, estimates, re-plans, calibrations                      |

Verify in the Supabase dashboard under **Table Editor** — all nine should be listed, and every one should show RLS enabled.

---

## 5. Deploy the Edge Functions

Three functions, all in `supabase/functions/`:

| Function         | Responsibility                                                                     |
| ---------------- | ---------------------------------------------------------------------------------- |
| `agent-estimate` | The only path to the LLM. Generates or refines timeboxed steps.                    |
| `moodle-connect` | Validates a Moodle site URL + token, encrypts and stores the token.                |
| `moodle-sync`    | Pulls courses, assignments, module items, quiz time limits, and YouTube durations. |

**Hosted:**

    npx supabase functions deploy agent-estimate
    npx supabase functions deploy moodle-connect
    npx supabase functions deploy moodle-sync

**Local:**

    npx supabase functions serve --env-file supabase/functions/.env

Check what is live:

    npx supabase functions list

> Supabase verifies the caller's JWT by default on every function. **Keep that on.** The client calls functions via `supabase.functions.invoke(...)`, which attaches the session token automatically. Only add `--no-verify-jwt` if you have deliberately implemented your own auth.

> **If the function folders are missing from your clone:** Lovable will not create new files under `supabase/functions/` in some project types. The functions are still deployable — the CLI deploys whatever is in the repo, regardless of who wrote it. Create the folder and `index.ts`, commit, and deploy.

---

## 6. Set the Edge Function secrets

Secrets are read server-side with `Deno.env.get(...)` and never reach the browser.

    npx supabase secrets set MODEL_API_KEY=sk-... YOUTUBE_API_KEY=AIza...

| Secret                | Required             | Purpose                                                              |
| --------------------- | -------------------- | -------------------------------------------------------------------- |
| `MODEL_API_KEY`       | For AI features      | Your model provider's API key                                        |
| `MODEL_BASE_URL`      | No                   | Any OpenAI-compatible endpoint. Default `https://api.openai.com/v1`  |
| `MODEL_NAME`          | No                   | Default `gpt-4o-mini`                                                |
| `MODEL_NAME_FALLBACK` | Strongly recommended | Tried when the primary model is retired, overloaded, or rate-limited |
| `YOUTUBE_API_KEY`     | For video estimates  | YouTube Data API v3 key                                              |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase — do not set them yourself.

> **Token encryption.** `moodle-connect` encrypts the Moodle token before storing it. If your build requires a dedicated encryption secret, its exact name is documented in the header comment of `supabase/functions/moodle-connect/index.ts` — read that file and set it the same way.

Confirm what is set (names only, values are never printed):

    npx supabase secrets list

---

## 7. Get an AI model key

Any **OpenAI-compatible** provider works. Set the key, and point `MODEL_BASE_URL` / `MODEL_NAME` at your provider.

| Provider         | `MODEL_BASE_URL`                                          | Example `MODEL_NAME`      | Free tier   |
| ---------------- | --------------------------------------------------------- | ------------------------- | ----------- |
| OpenAI           | `https://api.openai.com/v1` (default)                     | `gpt-4o-mini`             | No          |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash`        | Yes         |
| Groq             | `https://api.groq.com/openai/v1`                          | `llama-3.3-70b-versatile` | Yes         |
| OpenRouter       | `https://openrouter.ai/api/v1`                            | `openai/gpt-4o-mini`      | Some models |

Example (Google AI Studio):

    npx supabase secrets set \
      MODEL_API_KEY=<your-key> \
      MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
      MODEL_NAME=gemini-2.0-flash

**If you skip this entirely**, NextStep still runs: estimation falls back to the deterministic engine and decomposition falls back to the built-in planner. You lose narrative-quality step titles and low-confidence refinement, nothing else.

> Set `MODEL_NAME_FALLBACK` to a second model. Providers retire model names and shed load without notice, and a retired name is the most common reason AI planning silently starts failing.

---

## 8. Get a YouTube Data API key

Needed only for accurate video duration estimates.

1. Go to **console.cloud.google.com** and create (or select) a project.
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Copy the key.
5. Recommended: click **Restrict key** → API restrictions → limit it to **YouTube Data API v3**.

Then:

    npx supabase secrets set YOUTUBE_API_KEY=<your-key>

`videos.list` costs 1 quota unit per call and the default quota is 10,000 units/day — far more than a single user will ever need. Requests are batched up to 50 video IDs at a time.

> YouTube's **oEmbed** endpoint does not return duration, which is why the Data API is used and why this call happens server-side during sync. Without the key, video items get a 20-minute low-confidence estimate.

---

## 9. Set up a Moodle site

Moodle web services require an **administrator**. You need a site you control. **There is no need to touch a university Moodle** — and you should not, since the institution gates this exactly the way it gated Canvas.

### 9.1 Pick a site

| Option                    | Cost          | Notes                                                                                                                                                                    |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gnomio** (`gnomio.com`) | Free          | Full admin, **web services included on the free plan**, 500 users / 50 courses, publicly reachable. Shows ads. Signup is sometimes temporarily closed — try again later. |
| **MoodleCloud trial**     | Free, 28 days | No ads, reliable, zero setup. Good for a demo or presentation.                                                                                                           |
| **Local Docker**          | Free          | Full control, but **not reachable by deployed Edge Functions**. See 9.5.                                                                                                 |

Avoid the moodle.org demo sandboxes: they reset hourly and give you no admin rights, so you cannot enable web services or mint tokens.

> **Gnomio housekeeping:** it deactivates sites with no valid access for a month and empty sites after a week. Log in regularly once your courses exist.

### 9.2 Admin configuration (nine steps)

`moodle-connect` and `moodle-sync` run in Supabase's cloud, so your Moodle needs a **public HTTPS URL**. Menu paths below are for Moodle 4.x and 5.x.

1. **Enable web services** — Site administration → Advanced features → tick _Enable web services_ → Save.
2. **Enable the REST protocol** — Plugins → Web services → Manage protocols → click the eye next to **REST**.
3. **Enable completion tracking** — Advanced features → tick _Enable completion tracking_ → Save. Needed for the progress function.
4. **Create the external service** — Server → Web services → External services → Add. Name `nextstep`, short name `nextstep`, Enabled ✓.
5. **Add the seven functions** — open `nextstep` → Functions tab → Add functions → search and add each one listed in 9.3.
6. **Create a role that may use REST** — Users → Permissions → Define roles → Add a new role. Name `NextStep service`, short name `nextstepservice`, archetype **No archetype**, filter for `webservice/rest:use` → **Allow**.
7. **Grant that role to your student user** — Users → Permissions → Assign system roles → `NextStep service` → add the student.
8. **Generate the student token** — Server → Web services → Manage tokens → Add → user = your **student**, service = `nextstep`. **Copy the token — Moodle shows it once.**
9. _(Optional, for seeding only)_ Generate an **admin token** the same way, with an administrator as the user.

> **Step 7 is the single most common setup failure.** Without the role, the token is created successfully and then every call fails with `Access control exception`. This looks like a broken app and is not.

### 9.3 The seven read functions

| #   | Function                                           | What it supplies                                             |
| --- | -------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `core_webservice_get_site_info`                    | Validates the connection; used by `moodle-connect`           |
| 2   | `core_enrol_get_users_courses`                     | The student's enrolled courses                               |
| 3   | `core_course_get_contents`                         | Sections and modules — where video/reading signals come from |
| 4   | `mod_assign_get_assignments`                       | Assignments with `duedate`, `intro`, attachments             |
| 5   | `core_calendar_get_action_events_by_timesort`      | Upcoming deadlines across courses                            |
| 6   | `mod_quiz_get_quizzes_by_courses`                  | Quizzes including `timelimit` (seconds)                      |
| 7   | `core_completion_get_activities_completion_status` | Per-activity progress                                        |

### 9.4 Two tokens, and they are not interchangeable

| Token             | Belongs to           | Used for                                                      |
| ----------------- | -------------------- | ------------------------------------------------------------- |
| **Student token** | The enrolled student | What the app uses. This is the real use case.                 |
| **Admin token**   | An administrator     | Creating courses/users/enrolments. **The app never sees it.** |

Use the **student** token in NextStep. An admin token would appear to work while quietly returning admin-scoped data — which hides exactly the bugs worth catching.

### 9.5 Local Moodle and the tunnel caveat

Deployed Edge Functions **cannot reach `http://localhost:8080`**. If you want a local Moodle with a deployed backend, expose it:

    cloudflared tunnel --url http://localhost:8080

Then set Moodle's `wwwroot` to that public URL — Moodle redirects to its own stored URL, and a mismatch breaks every call. Free tunnel URLs change, so you will redo this often.

If you are running everything locally (§ _Running the backend entirely on your machine_), skip the tunnel: `localhost` is reachable from locally served functions.

### 9.6 Test content worth seeding

Create a **student** account, a **teacher** account, and two to four courses with a deliberate mix:

- a **YouTube URL** activity → exercises the duration lookup (use a real, public video)
- a **quiz with a time limit** → the high-confidence path (`timelimit` is authoritative)
- a **file with real text** → drives the reading estimate (empty files give a zero word count)
- an **assignment with description only** → the open-ended path, handled by capacity allocation
- **one item due within 12 hours with large effort** → this is what makes the "Running no room to be behind" state actually visible

Without that last item, the buffer engine has nothing red to show and the demo looks broken when it is not.

### 9.7 Verify the token before blaming the app

Replace the placeholders and run:

    curl -s "https://<your-moodle-site>/webservice/rest/server.php?wstoken=<STUDENT_TOKEN>&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json"

A JSON object with `sitename` and `userid` means the wiring is correct. An `exception` field means the Moodle side is not configured — go back to 9.2.

---

## 10. Run the app

    npm run dev

Open the URL it prints (typically `http://localhost:8080` or `http://localhost:5173`).

Production build, to confirm it compiles cleanly:

    npm run build
    npm run preview

---

## 11. First-run walkthrough

1. **Sign up** with an email and password. Every table's RLS is scoped to the signed-in user, so nothing is readable before this.
   - On **hosted** Supabase, sign-up may ask you to confirm your email. Either click the link, or disable confirmation under **Authentication → Providers → Email → Confirm email**.
   - On **local** Supabase, confirmation is off by default and you are signed in immediately.
2. **Settings** — set your **weekly available hours** and **timezone**. This is the capacity budget the allocation engine spends; without it, open-ended work has no budget to draw from.
3. **Connect** — paste your Moodle site URL (with `https://`, no trailing slash) and the **student** token. Click test/connect. You should see the site name and your Moodle user name come back.
4. **Auto-detect** — the sync pulls courses, assignments, module items, quiz time limits, and video durations. Each detected item carries a confidence level.
5. **Confirm plan** — steps are generated. Review, adjust anything, confirm.
6. **Map** — check the buffer badge per assignment. Green means comfortable, amber means under a day of slack, red means _no room to be behind_.
7. **Execute** — work the single card. Report **Done**, **Blocked**, or **Stopped at timebox**. Blocked triggers the re-planner; actual times feed calibration.
8. **Running behind** — after a few cycles, this tab shows real re-plans and recomputed deadlines.

---

## Using it without Moodle (demo mode)

You can evaluate the entire product with **zero external accounts**.

1. Sign up (Supabase only — no Moodle, no AI key, no YouTube key needed).
2. In **Settings**, enable **demo data**.
3. The app seeds realistic courses, assignments, steps, and progress, and every view works: Map, Execute, Running behind, buffer states, timers, calibration.

This is the fastest way for a reviewer to see NextStep working, and it is deliberately dependency-free. Live Moodle ingestion is the only thing that ever requires a real credential, because it is by nature scoped to a real student's account.

**Test the fallbacks explicitly.** With `MODEL_API_KEY` unset, estimation still runs deterministically and decomposition still produces steps. If the app breaks when the key is missing, something is wrong.

---

## Running the backend entirely on your machine

The optional fully-offline path. Requires Docker Desktop.

    npx supabase start
    npx supabase db reset
    npx supabase functions serve --env-file supabase/functions/.env

Create `supabase/functions/.env`:

    MODEL_API_KEY=sk-...
    MODEL_BASE_URL=https://api.openai.com/v1
    MODEL_NAME=gpt-4o-mini
    YOUTUBE_API_KEY=AIza...

Then point `.env` at the local API URL and anon key printed by `supabase start`. With this setup a **local Moodle at `http://localhost:8080` works** — no tunnel needed, because the functions run on your machine.

Stop everything:

    npx supabase stop

---

## Environment variable reference

### Front end (`.env`) — public, shipped to the browser

| Variable                 | Required | Where used                                                                                                      |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Yes      | `src/integrations/supabase/client.ts`                                                                           |
| `VITE_SUPABASE_ANON_KEY` | Yes      | Same. Newer Lovable projects may name it `VITE_SUPABASE_PUBLISHABLE_KEY` — use whatever your `client.ts` reads. |

### Edge Functions (Supabase secrets) — server only, never `VITE_`

| Variable                            | Required            | Read by          |
| ----------------------------------- | ------------------- | ---------------- |
| `MODEL_API_KEY`                     | For AI features     | `agent-estimate` |
| `MODEL_BASE_URL`                    | No                  | `agent-estimate` |
| `MODEL_NAME`                        | No                  | `agent-estimate` |
| `MODEL_NAME_FALLBACK`               | Recommended         | `agent-estimate` |
| `YOUTUBE_API_KEY`                   | For video estimates | `moodle-sync`    |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Auto-injected       | All functions    |

---

## Project structure

    nextstep/
    ├── src/
    │   ├── components/              UI — Map, Execute, Running behind, Connect, Settings
    │   ├── lib/
    │   │   ├── db/                  Typed repository layer over Supabase
    │   │   ├── agent/               Deterministic estimation, decomposition,
    │   │   │                        AI-step sanitising, agent client
    │   │   └── lms/                 LmsProvider interface + implementations
    │   │       ├── moodleProvider.ts
    │   │       ├── moodle-connect.ts
    │   │       ├── moodle-sync.ts
    │   │       └── types.ts
    │   ├── integrations/supabase/   Generated Supabase client
    │   └── types/                   Shared TypeScript types
    ├── supabase/
    │   ├── functions/
    │   │   ├── agent-estimate/      The only model path
    │   │   ├── moodle-connect/      Validates and encrypts the token
    │   │   └── moodle-sync/         Pulls and measures course material
    │   ├── migrations/              Schema, RLS policies
    │   └── seed.sql                 Demo data
    ├── .env.example
    └── README.md

**One architectural rule governs everything:** the LMS is behind a provider interface.

    interface LmsProvider {
      validateConnection(siteUrl, token): Promise<SiteInfo>
      getCourses(): Promise<Course[]>
      getAssignments(courseId): Promise<Assignment[]>
      getCourseContents(courseId): Promise<CourseModule[]>
    }

`MoodleProvider` implements it today. `MockProvider` backs demo mode. A `CanvasProvider` could be added without touching a single view. **Components must never call Moodle, Canvas, or any external API directly** — all external calls happen in Edge Functions, which is what keeps the token server-side and avoids browser CORS entirely.

---

## Verifying your install

A reviewer can treat this as an acceptance checklist.

| #   | Check                                     | Expected                                               |
| --- | ----------------------------------------- | ------------------------------------------------------ |
| 1   | `npm install` on a clean clone            | Completes with no missing peer dependency errors       |
| 2   | `npm run build`                           | Succeeds; no TypeScript errors                         |
| 3   | `.env` filled, `npm run dev`              | App loads and shows the sign-in screen                 |
| 4   | Sign up                                   | Account created; you land in the app                   |
| 5   | `npx supabase functions list`             | All three functions listed as active                   |
| 6   | `npx supabase secrets list`               | `MODEL_API_KEY` and `YOUTUBE_API_KEY` present          |
| 7   | Settings → enable demo data               | Courses, assignments, steps and buffers populate       |
| 8   | Execute tab                               | One action card with a running timer and three buttons |
| 9   | Map tab                                   | Buffer badges in green / amber / red; at least one red |
| 10  | Unset `MODEL_API_KEY`, re-run an estimate | Still produces steps via the deterministic fallback    |
| 11  | Moodle connect with a valid student token | Site name and user returned, then sync populates data  |
| 12  | Moodle connect with a bad token           | A clear error message, not a crash                     |

Checks 1–10 need no external accounts beyond Supabase. That is the reproducible core.

---

## Troubleshooting

| Symptom                                                                 | Cause and fix                                                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| App loads but every read returns nothing                                | RLS is doing its job. You are signed out, or the rows belong to another `user_id`. Sign in.     |
| `VITE_` variable is `undefined`                                         | Restart the dev server after editing `.env`. Vite reads `.env` at boot.                         |
| Functions return 401                                                    | JWT verification is on and the caller is not signed in. Sign in first.                          |
| `NOT_CONFIGURED` from `agent-estimate`                                  | `MODEL_API_KEY` is not set on the project. `npx supabase secrets set ...`.                      |
| `The model "<name>" is not available`                                   | `MODEL_NAME` is wrong or retired. Set a live model, and set `MODEL_NAME_FALLBACK` too.          |
| AI silently falls back to the built-in planner                          | Expected. Every failure path degrades to the deterministic plan rather than breaking the view.  |
| `Access control exception` / `nopermissions` from Moodle                | The token's user lacks `webservice/rest:use`. Redo §9.2 steps 6–7.                              |
| `Invalid token - token not found`                                       | Token regenerated, or copied with a trailing space.                                             |
| `Web services must be enabled`                                          | §9.2 step 1.                                                                                    |
| `Unsupported protocol`                                                  | §9.2 step 2 — REST is not enabled.                                                              |
| A Moodle function returns `[]`                                          | User is not enrolled, the course has no content of that type, or completion tracking is off.    |
| Video shows a 20-minute estimate                                        | `YOUTUBE_API_KEY` missing, or the URL is not a real public YouTube video.                       |
| `core_enrol_get_users_courses` returns `[]` despite a correct enrolment | Known issue on some managed Moodle hosts. See _Known limitations_.                              |
| Edge Functions cannot reach Moodle                                      | Your Moodle is not publicly reachable over HTTPS, or `wwwroot` does not match the URL you used. |
| Redirected to a different hostname during sync                          | `wwwroot` mismatch. Fix Moodle's site URL.                                                      |

---

## Known limitations

Stated plainly, because they are real.

- **Moodle web services are an administrator decision.** Fine on a site you host. On an institutional Moodle you may be blocked at the same policy layer that blocked Canvas for this project. The blocker is institutional, not technical.
- **`core_enrol_get_users_courses` can return an empty array on managed Moodle hosts** even when the enrolment is provably correct — verified on MoodleCloud with Moodle 5.3. The workaround is to derive the enrolled course set from `core_calendar_get_action_events_by_timesort`, whose events carry a `courseid`. This is exactly the class of variation the provider adapter exists to absorb.
- **Tokens are bearer credentials.** Anyone holding a Moodle token can read that student's courses. NextStep stores it encrypted, server-side only, and never displays or logs it after submission.
- **Paywalled content and unwatchable video cannot be measured.** Estimates derived from partial signals are flagged with a confidence level, and low confidence is shown to the user rather than hidden.
- **Rubrics are not available.** `mod_assign_get_assignments` returns the description and attachments but not the rubric, so AI plans can only ground themselves in what the instructor wrote.
- **Credential-free demo mode does not exercise live ingestion.** By definition, connecting to a real LMS requires a real token.
- **Single-user by design.** No multi-tenant onboarding, no LTI 1.3, no calendar sync, no mobile client, no Canvas provider. All future work.

---

## How the estimation and buffer logic works

Worth understanding before you debug it.

**Estimation is deterministic first, AI second.**

| Item type | Rule                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Video     | duration in seconds ÷ 60, resolved server-side via the YouTube Data API. 20 min at low confidence if unknown. |
| Reading   | word count ÷ 200 wpm                                                                                          |
| Quiz      | the quiz's own `timelimit` when present; otherwise questions × 1.5 min                                        |
| Writing   | target words ÷ 250 wpm + 20% editing overhead                                                                 |
| Fallback  | 30 min                                                                                                        |

The result is `{ minutes, confidence, signals[] }`, where confidence depends on how many signals were actually available. The LLM is consulted only to refine weak estimates and to write better step titles — and every AI response is strictly validated, with anything malformed rejected in favour of the deterministic planner.

**Open-ended work is allocated, not guessed.** A paper has no measurable signal, so guessing produces the exact anxiety the product exists to remove. Instead:

    C = weekly_available_hours × 60          // capacity this week
    H = sum of signal estimates due this week // hard work
    R = max(0, C − H)                         // remainder
    allocate R across open-ended items by urgency,
    clamped to [30 min floor, time before deadline]

If `H ≥ C`, the app raises an **over-capacity** warning — the week is not physically possible — and moves the student into the running-behind flow. Allocation is weekly and per item, so a three-week project receives only this week's slice.

**The buffer engine.** For each assignment:

    slack = (days until deadline) − (remaining estimated minutes ÷ daily free minutes)
    daily free minutes = weekly_available_hours ÷ 7

| slack             | State                            |
| ----------------- | -------------------------------- |
| > 1 day           | Green                            |
| 0 < slack ≤ 1 day | Amber                            |
| ≤ 0               | Red — **"No room to be behind"** |

**Calibration** compares estimated against actual per item type. Untimed completions, sub-minute completions, and running-timer outliers (over 3× the estimate or over 180 minutes) are rejected rather than trusted. After three usable samples, a per-type multiplier moves toward the **median** observed ratio, blended and clamped to 0.6–1.8.

**Accessibility is a hard requirement, not a nicety:** status is conveyed by label _and_ icon, never colour alone; WCAG AA contrast; full keyboard navigation; visible focus rings; `prefers-reduced-motion` respected; no decorative animation on the Execute view.

---

## Project context

Built as an IST 440W capstone. The designer is a member of the target segment, which is why the scope is deliberately narrow: one user, one LMS, one job — hand the student the next action and protect them from their own time estimates.
