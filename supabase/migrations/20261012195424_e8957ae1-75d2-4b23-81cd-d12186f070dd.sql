ALTER FUNCTION public.owns_assignment(uuid) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.owns_assignment(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.owns_assignment(uuid) TO authenticated;