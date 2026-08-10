-- The automatic RLS event trigger must be callable by PostgreSQL itself,
-- not through the public Data API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

