CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.users_settings (
  user_id uuid PRIMARY KEY,
  weekly_available_hours numeric NOT NULL DEFAULT 20,
  study_window_start time NOT NULL DEFAULT '09:00',
  study_window_end time NOT NULL DEFAULT '21:00',
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users_settings TO authenticated;
GRANT ALL ON public.users_settings TO service_role;
ALTER TABLE public.users_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own users_settings" ON public.users_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.lms_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  provider text NOT NULL CHECK (provider IN ('moodle','canvas','mock')),
  site_url text,
  token_encrypted text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lms_connections TO authenticated;
GRANT ALL ON public.lms_connections TO service_role;
ALTER TABLE public.lms_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lms_connections" ON public.lms_connections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  lms_course_id text,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lms_course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own courses" ON public.courses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  lms_assignment_id text,
  title text NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  estimated_minutes integer,
  estimated_is_manual boolean NOT NULL DEFAULT false,
  actual_minutes integer NOT NULL DEFAULT 0,
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  buffer_state text NOT NULL DEFAULT 'green' CHECK (buffer_state IN ('green','amber','red')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.assignments(user_id);
CREATE INDEX ON public.assignments(course_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assignments" ON public.assignments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.owns_assignment(_assignment_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.assignments WHERE id = _assignment_id AND user_id = auth.uid())
$$;

CREATE TABLE public.steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  title text NOT NULL,
  timebox_minutes integer NOT NULL DEFAULT 25,
  done_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done','blocked','stopped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.steps(assignment_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.steps TO authenticated;
GRANT ALL ON public.steps TO service_role;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own steps" ON public.steps FOR ALL TO authenticated USING (public.owns_assignment(assignment_id)) WITH CHECK (public.owns_assignment(assignment_id));

CREATE TABLE public.estimate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  estimated_minutes integer NOT NULL,
  actual_minutes integer,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.estimate_events(assignment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_events TO authenticated;
GRANT ALL ON public.estimate_events TO service_role;
ALTER TABLE public.estimate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own estimate_events" ON public.estimate_events FOR ALL TO authenticated USING (public.owns_assignment(assignment_id)) WITH CHECK (public.owns_assignment(assignment_id));

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('sync','estimate','replan','calibrate')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.activity_log(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity_log" ON public.activity_log FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.detected_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  item_type text NOT NULL CHECK (item_type IN ('video','read','quiz','paper','post')),
  title text NOT NULL,
  source_course text,
  signal_value text,
  estimated_minutes integer,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.detected_items(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.detected_items TO authenticated;
GRANT ALL ON public.detected_items TO service_role;
ALTER TABLE public.detected_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own detected_items" ON public.detected_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER t_users_settings BEFORE UPDATE ON public.users_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_lms_connections BEFORE UPDATE ON public.lms_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_courses BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_assignments BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_steps BEFORE UPDATE ON public.steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_detected_items BEFORE UPDATE ON public.detected_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();