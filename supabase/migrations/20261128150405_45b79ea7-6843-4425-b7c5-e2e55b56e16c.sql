-- Append missing live-schema changes; do not rewrite migration history.
ALTER TABLE public.estimate_events ADD COLUMN IF NOT EXISTS calibration_used boolean DEFAULT true;
ALTER TABLE public.estimate_events ADD COLUMN IF NOT EXISTS excluded_reason text;
ALTER TABLE public.detected_items ADD COLUMN IF NOT EXISTS details text;
CREATE UNIQUE INDEX IF NOT EXISTS assignments_user_lms_unique ON public.assignments (user_id, lms_assignment_id);
CREATE INDEX IF NOT EXISTS weekly_allocations_user_week_idx ON public.weekly_allocations (user_id, week_start);