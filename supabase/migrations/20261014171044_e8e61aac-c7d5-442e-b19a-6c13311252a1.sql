CREATE TABLE public.calibration_multipliers (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  item_type text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1.0,
  sample_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_multipliers TO authenticated;
GRANT ALL ON public.calibration_multipliers TO service_role;
ALTER TABLE public.calibration_multipliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own calibration_multipliers" ON public.calibration_multipliers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_calibration_multipliers_updated_at BEFORE UPDATE ON public.calibration_multipliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();