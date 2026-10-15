<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## App structure
- Keep the NextStep shell and placeholder panels in `src/components/`, with the index route composing the shell; this separates presentation from routing.
- Shell tabs are design-system Tabs with a single local `tab` state in the shell (so views like Map can jump to Execute); views fetch their own data via the LMS/db layers.
- Define visual styling and semantic tokens in `src/styles.css`; shared tokens keep the shell consistent.
- The shell uses the shared LMS-connection query to choose Connect on first run unless a tab was explicitly selected; the connection pill opens that same view so onboarding has one entry point.

## Data layer
- Domain types live in `src/types/`; all database reads/writes go through `src/lib/db/` so views never query tables directly.
- Every table is owner-scoped by RLS (child tables via their assignment), so repository functions don't filter by user themselves.

## LMS layer
- All LMS data comes from `getLmsProvider()` in `src/lib/lms/` (implements `LmsProvider`); components never fetch or call an LMS directly, so providers can be swapped.
- Settings is its own route (`/_authenticated/settings`) rendered inside NextStepShell via `children`; the other surfaces stay tabs on `/` (selected via `?tab=`).
- Dev-only helpers live in `src/lib/dev/` and are only loaded via dynamic import behind `import.meta.env.DEV`, so they never ship.
- Re-planning lives in `src/lib/agent/replan.ts` (pure simulation + one `runReplan` persistence entry point); views trigger it and read results back from activity_log, so the decision logic stays testable.
- The only model call is the `agent-estimate` Supabase Edge Function in the developer's own Supabase project (written and deployed by the developer); the app reaches it only via `src/lib/agent/agent-estimate-client.ts`, which re-sanitizes output and falls back to `decompose()` on any error, so the app never depends on AI.
- Moodle onboarding reaches the developer-deployed sync only through `src/lib/lms/moodle-sync.ts`, then `process-sync.ts` owns estimation and detected-item persistence; this keeps external access out of views.
- Connected LMS views use MoodleProvider with repository-backed UUIDs and bounded, deduplicated background sync; failures keep saved plans readable without substituting demo rows.
- Provider selection and the account-local demo preference are managed in the LMS layer; the shell owns the toggle and cached-data notice so view components remain source-agnostic.
- Detected items reference their assignment and persist manual-edit status; this avoids ambiguous title matching and preserves overrides on sync.
