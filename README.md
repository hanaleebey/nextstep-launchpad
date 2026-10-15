# NextStep

**An adaptive executive-function coach for college students with ADHD.**

Created by **Audrie Hana Lee Bey**, IST senior, sole developer, and primary tester.

NextStep is built around **one next action**, not another task list. It brings coursework in from Moodle, estimates the work, breaks assignments into concrete steps, and recommends what to do next. Each step has a timebox and a “good-enough done” checklist so the student can begin without planning the whole assignment first.

## Project status

NextStep is an actively developed, single-user academic prototype built with Lovable. The repository contains working application surfaces, planning engines, database migrations, and Supabase function source—not just the original shell.

Live Moodle and AI behavior depends on the deployed functions, service permissions, and secrets in the connected Supabase project. Source code and automated tests do not establish that every live integration is configured or verified. This is not a production-ready multi-user service or a clinical intervention.

## The student experience

| Surface | What it provides |
| --- | --- |
| **Map** | Assignment overview, deadlines, buffer status, progress, a seven-day timeline, and activity history. Open an assignment to inspect its steps and criteria; generate or rebuild plans and sync with Moodle. |
| **Execute** | One recommended action, assignment context, a good-enough checklist, a countdown timer, and **Done**, **Blocked**, and **Stopped at timebox** outcomes. Real-data step status and progress are saved to Supabase. |
| **Running behind** | Buffer alerts, a recommended re-plan, deadline impact, and a record of what the system changed. |
| **Connect** | Moodle connection, automatic work detection and estimation, optional manual estimate corrections, and plan confirmation. |
| **Settings** | Weekly available hours, timezone, weekly allocations, estimate overrides, and calibration controls. Demo-data selection is available in the shell. |

Work is planned around weekly capacity, **not fixed study windows**. Weeks run Monday–Sunday in the selected timezone. For connected Moodle data, a changed source deadline resets the assignment's saved progress and step statuses during sync; an ordinary page refresh should not reset progress.

## How planning works

1. **Ingest:** Read courses, activities, assignment details, quizzes, and upcoming deadlines from Moodle.
2. **Estimate:** Use available signals first: video duration, reading word count, quiz time limit or question count, and writing word targets. Known short tasks keep rounded-minute estimates rather than being forced into a 15-minute minimum.
3. **Allocate:** Reserve capacity for bounded work and distribute remaining weekly minutes across open-ended assignments by urgency.
4. **Decompose:** Generate assignment-specific actions and checkable criteria from the title and description, using AI when available and deterministic planning as a fallback.
5. **Schedule and buffer:** Calculate deadline slack and label assignments green, amber, or red. Red means **“No room to be behind.”** Course-sequence inference can place undated preparatory work before a later assessment, with a lead buffer of at least two hours.
6. **Execute and re-plan:** Save step outcomes, update progress, and respond to blocked work or exhausted buffers.
7. **Calibrate:** Compare usable estimated-versus-actual samples and adjust per-type estimates after enough observations.

AI output is validated before use. Model failures must not break the application; fallback behavior depends on the operation, and a rebuild can retain the existing plan and report why AI generation failed.

## Architecture

```text
React views and NextStep shell
    ├── getLmsProvider() → MockProvider or MoodleProvider
    ├── Planning engines → estimates, allocations, steps, buffers, re-plans
    └── Database repositories → Supabase Postgres with owner-scoped RLS

LMS / AI client wrappers
    ├── moodle-connect → Moodle validation + encrypted token storage
    ├── moodle-sync    → Moodle import + optional YouTube duration lookup
    └── agent-estimate → Groq / OpenAI-compatible model API
```

- **Frontend:** React 19, TypeScript, TanStack Start and Router, TanStack Query, Vite, Tailwind CSS v4, and shadcn/ui with Radix primitives.
- **Data and authentication:** Supabase Postgres, email/password authentication, and owner-scoped row-level security; child rows are scoped through their assignment where applicable.
- **External integrations:** Supabase Edge Functions for read-only Moodle access and model calls. Components do not call Moodle or the model provider directly.
- **AI:** Groq is the selected provider. `agent-estimate` uses an OpenAI-compatible API and configurable model names; the repository defaults must be overridden for Groq.
- **Tests:** Vitest and Testing Library cover planning logic, persistence flows, LMS behavior, shell behavior, and routing.

### Repository layout

```text
src/
  components/             Student views and shared shell
  routes/                 TanStack routes and authentication layout
  types/                  Domain types
  lib/
    agent/                Planning engines and persistence orchestration
    db/                   Database repositories
    lms/                  Providers, connection/sync clients, import processing
    engine/               Scheduling helpers
    session/              Execute session state
    time/                 Timezone-aware week calculations
    dev/                  Development-only demo helpers
  integrations/supabase/  Generated clients, database types, auth utilities
  styles.css              Shared design tokens and styling
supabase/
  functions/              agent-estimate, moodle-connect, moodle-sync
  migrations/             Database schema and policy changes
```

## Local development

Use a current Node.js release compatible with the installed Vite version, plus [Bun](https://bun.sh/).

```sh
git clone <your-repository-url>
cd <your-repository-folder>
bun install
bun run dev
```

Available commands:

```sh
bun run test        # Run the automated tests
bun run test:watch  # Watch tests during development
bun run lint       # Check lint rules
bun run build      # Create a production build
bun run preview    # Preview the build locally
```

The browser Supabase client is generated for the connected project. Cloning the repository does **not** provision a new database or automatically repoint that client. For another Supabase project, update the integration configuration and regenerate matching clients/types before using it. Server-side auth utilities also expect `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; privileged utilities require `SUPABASE_SERVICE_ROLE_KEY` only on the server.

## Supabase and integration setup

Apply and review the migrations for the target database, configure email/password authentication and redirect URLs, and deploy all three functions to the **same project the app uses**. Existing databases may contain changes made directly in the Supabase SQL editor; reconcile the live schema with repository migrations before assuming a fresh installation is equivalent.

With the Supabase CLI linked to the intended project:

```sh
supabase db push
supabase functions deploy moodle-connect
supabase functions deploy moodle-sync
supabase functions deploy agent-estimate
```

Review pending migrations before `db push`, particularly on a database with existing data. Publishing the frontend through Lovable does not replace deploying or configuring these functions.

### Function secrets

Set private values through Supabase Secrets or the CLI; never commit them or put them in `VITE_` variables.

| Secret | Purpose |
| --- | --- |
| `MOODLE_TOKEN_KEY` | Base64-encoded 32-byte encryption key shared by `moodle-connect` and `moodle-sync`. The checked-in functions read this exact name. |
| `YOUTUBE_API_KEY` | Optional YouTube Data API v3 key for real video durations. Without it, duration lookup falls back to unknown-duration estimates. |
| `MODEL_API_KEY` | Groq API key for step generation and refinement. This is not the Moodle encryption key. |
| `MODEL_BASE_URL` | For Groq, set to `https://api.groq.com/openai/v1`. |
| `MODEL_NAME` | A currently supported Groq model available to the account. |
| `MODEL_NAME_FALLBACK` | Optional supported fallback model for provider failures. |

Supabase supplies the function runtime's `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Changing the Moodle encryption key makes previously encrypted tokens unreadable; reconnect Moodle afterward. If an existing secret is named `TOKEN_ENCRYPTION_KEY`, the checked-in functions do not read that alias automatically.

### Moodle requirements

- Enable web services and the REST protocol.
- Configure an external service with the read functions used by the app, and authorize the intended Moodle user.
- Supply a token bound to that service; a personal token for another service is not interchangeable.
- Enable the relevant course, assignment, quiz, calendar, and completion read functions. See `supabase/functions/moodle-sync/index.ts` for the calls used.

When Moodle is unavailable, the provider can keep saved coursework readable and show a non-blocking cached-data notice. It does not silently replace connected coursework with demo assignments.

## Security, accessibility, and scope

- Moodle integration is read-only; tokens are encrypted on the server and must not be logged or exposed after submission.
- Database ownership is enforced through RLS, not just hidden controls or client-side filters.
- Status uses labels and icons as well as color. The interface targets WCAG AA contrast, keyboard navigation, visible focus, and reduced-motion preferences; Execute avoids decorative animation.
- The visual system uses shared semantic tokens, a system font stack, and a low-distraction layout.
- Canvas, LTI, calendar sync, a native mobile app, content generation, clinical claims, and commercial multi-user operation are outside the current prototype scope.

## Development with Lovable

Continue working in the [NextStep Lovable project](https://lovable.dev/projects/ec10686a-52e1-40f1-82f9-1d0eef79d823). Changes on the connected branch sync with Lovable; keep that branch working and avoid rewriting published Git history.

For contributor conventions and architectural rules, read [`AGENTS.md`](./AGENTS.md). For current development tasks, see [`roadmap.md`](./roadmap.md).
