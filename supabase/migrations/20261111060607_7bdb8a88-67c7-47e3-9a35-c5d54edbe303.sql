ALTER TABLE public.users_settings
  ADD COLUMN default_timebox_minutes integer NOT NULL DEFAULT 25,
  ADD COLUMN auto_plan_new_items boolean NOT NULL DEFAULT true;