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
