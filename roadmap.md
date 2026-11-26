# Connect onboarding
- [x] Implement MoodleProvider with cached-row fallback and bounded background sync.
- [x] Add shell-only demo toggle and non-blocking cached-data notice; leave views unchanged.
- [x] Verify provider selection, failure recovery, and demo switching with tests (110 passed).
- [x] Build Get started, progress rail, connection form, token help, and detection placeholder.
- [x] Open Connect from the top-bar pill and default to it without a saved connection.
- [x] Verify token clearing, inline failures, and success progression with focused tests (6 passed); check isolated desktop/mobile layout.
- [x] Sync Moodle automatically and persist this week's detected work with signals and editable estimates.
- [x] Decompose detected work, compute buffers, and confirm into the real Map.
- [x] Test automatic progression, persistence, retries, manual editing, and the detection panel (55 checks passed).
- [ ] Live Moodle verification — blocked by external unmanaged authentication; no authenticated browser session is available.

# Map planning & sync
- [x] Map button that deterministically plans every assignment without steps (plus per-assignment button).
- [x] Saved progress stays in the database across reloads.
- [x] Background Moodle sync refreshes the Map when done; manual "Sync with Moodle" button.
- [x] Reset progress and steps when a Moodle due date changes.

# Assignment-specific planning
- [x] AI generates every plan from the assignment's own instructions (no template steps); videos become one "Watch" step.
- [x] Stop assignments showing more than once (duplicate saved courses/rows from earlier syncs).

# Security test programme (phase 1)
- [x] Add six security cases and a JSON-producing runner; never call AI or live Moodle.
- [x] Run the attack pass, apply only minimal fixes, and verify fixes with a second run (4 BLOCKED, 2 MANUAL, 0 VULNERABLE).
- [x] Add the owner-only /test-report evidence page and check it against the JSON with no console errors.
- [x] Build but do not run the PDF generator; document exact public/evidence filenames.
- [x] Run all 170 tests and verify fixture sign-in, demo Map, Execute, and Settings.
- [ ] S2 authenticated second-user probe — blocked: the owner is the only authorised tester and no second authorised account/session is available.
- [ ] S5 managed Auth 429 observation — blocked: 20 failed sign-ins returned 400, so the managed threshold was not reached; no ad-hoc rate limit will be added.
