create or replace function public.is_wedding_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_wedding_admin();
$$;

revoke all on function public.is_wedding_admin() from public, anon;
grant execute on function public.is_wedding_admin() to authenticated;
