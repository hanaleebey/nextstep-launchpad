-- Allow the 'complete' activity kind.
ALTER TABLE public.activity_log DROP CONSTRAINT activity_log_kind_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_kind_check
  CHECK (kind = ANY (ARRAY['sync'::text, 'estimate'::text, 'replan'::text, 'calibrate'::text, 'complete'::text]));

-- Save a step status and keep its assignment consistent in one transaction.
-- When the last open step is done, the assignment becomes done at 100%.
-- An assignment with zero steps is never auto-completed.
CREATE OR REPLACE FUNCTION public.complete_step(_step_id uuid, _status text)
RETURNS TABLE(assignment_id uuid, status text, progress_pct integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assignment_id uuid;
  _total integer;
  _done integer;
BEGIN
  SELECT s.assignment_id INTO _assignment_id FROM public.steps s WHERE s.id = _step_id;
  IF _assignment_id IS NULL OR NOT public.owns_assignment(_assignment_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.steps SET status = _status, updated_at = now() WHERE id = _step_id;

  SELECT count(*), count(*) FILTER (WHERE s.status = 'done')
    INTO _total, _done
    FROM public.steps s WHERE s.assignment_id = _assignment_id;

  IF _total > 0 AND _done = _total THEN
    UPDATE public.assignments a SET status = 'done', progress_pct = 100, updated_at = now()
      WHERE a.id = _assignment_id;
  ELSIF _total > 0 THEN
    UPDATE public.assignments a
      SET progress_pct = round(_done::numeric * 100 / _total),
          status = CASE WHEN a.status = 'done' THEN 'in_progress' ELSE a.status END,
          updated_at = now()
      WHERE a.id = _assignment_id;
  END IF;

  RETURN QUERY
    SELECT a.id, a.status, a.progress_pct FROM public.assignments a WHERE a.id = _assignment_id;
END;
$$;

-- Mark a whole assignment done: every open step becomes done, progress 100.
CREATE OR REPLACE FUNCTION public.mark_assignment_done(_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.owns_assignment(_assignment_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.steps SET status = 'done', updated_at = now()
    WHERE assignment_id = _assignment_id AND status IN ('todo', 'blocked', 'stopped');

  UPDATE public.assignments SET status = 'done', progress_pct = 100, updated_at = now()
    WHERE id = _assignment_id;
END;
$$;

-- Reopen a completed assignment: in progress again, final step back to to-do.
CREATE OR REPLACE FUNCTION public.reopen_assignment(_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer;
  _done integer;
BEGIN
  IF NOT public.owns_assignment(_assignment_id) THEN
    RAISE EXCEPTION 'not found';
  END IF;

  UPDATE public.steps SET status = 'todo', updated_at = now()
    WHERE id = (
      SELECT s.id FROM public.steps s
      WHERE s.assignment_id = _assignment_id
      ORDER BY s.order_index DESC
      LIMIT 1
    );

  SELECT count(*), count(*) FILTER (WHERE s.status = 'done')
    INTO _total, _done
    FROM public.steps s WHERE s.assignment_id = _assignment_id;

  UPDATE public.assignments a
    SET status = 'in_progress',
        progress_pct = CASE WHEN _total > 0 THEN round(_done::numeric * 100 / _total) ELSE 0 END,
        updated_at = now()
    WHERE a.id = _assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_step(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_assignment_done(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_assignment(uuid) TO authenticated;