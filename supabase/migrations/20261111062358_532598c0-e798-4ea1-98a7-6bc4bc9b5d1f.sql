REVOKE EXECUTE ON FUNCTION public.complete_step(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_assignment_done(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reopen_assignment(uuid) FROM anon, public;