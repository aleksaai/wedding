alter function public.open_wedding_invitation(text)
rename to open_wedding_invitation_unchecked;
alter function public.open_wedding_invitation_unchecked(text)
set schema private;

alter function public.submit_wedding_rsvp(text, boolean, integer, integer, text, text)
rename to submit_wedding_rsvp_unchecked;
alter function public.submit_wedding_rsvp_unchecked(text, boolean, integer, integer, text, text)
set schema private;

revoke all on function private.open_wedding_invitation_unchecked(text) from public, anon, authenticated;
revoke all on function private.submit_wedding_rsvp_unchecked(text, boolean, integer, integer, text, text) from public, anon, authenticated;

create or replace function public.open_wedding_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(coalesce(p_code, '')));
begin
  if normalized_code !~ '^[A-Z0-9]{6,12}$'
     or not exists (
       select 1 from public.wedding_invitations
       where code = normalized_code and is_backup = false
     ) then
    return null;
  end if;

  return private.open_wedding_invitation_unchecked(normalized_code);
end;
$$;

create or replace function public.submit_wedding_rsvp(
  p_code text,
  p_attending boolean,
  p_partner_count integer default 0,
  p_children_count integer default 0,
  p_dietary_notes text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(coalesce(p_code, '')));
begin
  if normalized_code !~ '^[A-Z0-9]{6,12}$'
     or not exists (
       select 1 from public.wedding_invitations
       where code = normalized_code and is_backup = false
     ) then
    raise exception 'Invitation not found';
  end if;

  return private.submit_wedding_rsvp_unchecked(
    normalized_code,
    p_attending,
    p_partner_count,
    p_children_count,
    p_dietary_notes,
    p_message
  );
end;
$$;

revoke all on function public.open_wedding_invitation(text) from public, authenticated;
revoke all on function public.submit_wedding_rsvp(text, boolean, integer, integer, text, text) from public, authenticated;
grant execute on function public.open_wedding_invitation(text) to anon, authenticated;
grant execute on function public.submit_wedding_rsvp(text, boolean, integer, integer, text, text) to anon, authenticated;
