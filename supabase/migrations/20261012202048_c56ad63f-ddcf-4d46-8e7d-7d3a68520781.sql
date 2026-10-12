ALTER TABLE public.assignments ADD COLUMN estimate_source text;

CREATE TABLE public.weekly_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  allocated_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_allocations TO authenticated;
GRANT ALL ON public.weekly_allocations TO service_role;

ALTER TABLE public.weekly_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own weekly_allocations" ON public.weekly_allocations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_weekly_allocations_updated_at
  BEFORE UPDATE ON public.weekly_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();