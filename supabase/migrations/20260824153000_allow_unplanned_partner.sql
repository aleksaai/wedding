-- Auch Erwachsene sollen keine harte Limitation sein: wer beim Verschicken der
-- Karte noch keine Partnerin oder keinen Partner hatte, soll eine Person
-- mitbringen koennen. Neue Regel: erlaubt sind die eingeplanten Begleitungen
-- (max_adults - 1) plus eine zusaetzliche Person, also insgesamt max_adults.
-- Beispiel: max_adults = 1 erlaubt jetzt 1 Begleitung statt 0.
-- Kinder bleiben wie in 20260824140000 bei 10 pro Altersgruppe.

create or replace function public.submit_wedding_rsvp(
  p_code text,
  p_attending boolean,
  p_partner_count integer default 0,
  p_kids_under_3 integer default 0,
  p_kids_3_to_17 integer default 0,
  p_kids_18_plus integer default 0,
  p_dietary_notes text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.wedding_invitations%rowtype;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_partner_count integer := case when p_attending then coalesce(p_partner_count, 0) else 0 end;
  normalized_under_3 integer := case when p_attending then coalesce(p_kids_under_3, 0) else 0 end;
  normalized_3_to_17 integer := case when p_attending then coalesce(p_kids_3_to_17, 0) else 0 end;
  normalized_18_plus integer := case when p_attending then coalesce(p_kids_18_plus, 0) else 0 end;
  partner_allowance integer;
  total_children integer;
  saved public.wedding_rsvps%rowtype;
begin
  if normalized_code !~ '^[A-Z0-9]{6,12}$' or p_attending is null then
    raise exception 'Invalid invitation response';
  end if;

  select * into invitation
  from public.wedding_invitations
  where code = normalized_code
  for update;

  if invitation.id is null or invitation.is_backup then
    raise exception 'Invitation not found';
  end if;

  -- eingeplante Begleitungen plus eine ungeplante Partnerin oder ein Partner
  partner_allowance := greatest(invitation.max_adults - 1, 0) + 1;
  total_children := normalized_under_3 + normalized_3_to_17 + normalized_18_plus;

  if normalized_partner_count < 0 or normalized_partner_count > partner_allowance then
    raise exception 'Guest count exceeds invitation allowance';
  end if;

  if normalized_under_3 < 0 or normalized_under_3 > 10
     or normalized_3_to_17 < 0 or normalized_3_to_17 > 10
     or normalized_18_plus < 0 or normalized_18_plus > 10 then
    raise exception 'Guest count exceeds invitation allowance';
  end if;

  if char_length(coalesce(p_dietary_notes, '')) > 1000
     or char_length(coalesce(p_message, '')) > 2000 then
    raise exception 'Response text is too long';
  end if;

  insert into public.wedding_rsvps (
    invitation_id, attending, partner_count, children_count,
    kids_under_3, kids_3_to_17, kids_18_plus,
    dietary_notes, message, submitted_at
  ) values (
    invitation.id, p_attending, normalized_partner_count, total_children,
    normalized_under_3, normalized_3_to_17, normalized_18_plus,
    nullif(trim(coalesce(p_dietary_notes, '')), ''),
    nullif(trim(coalesce(p_message, '')), ''),
    now()
  )
  on conflict (invitation_id) do update set
    attending = excluded.attending,
    partner_count = excluded.partner_count,
    children_count = excluded.children_count,
    kids_under_3 = excluded.kids_under_3,
    kids_3_to_17 = excluded.kids_3_to_17,
    kids_18_plus = excluded.kids_18_plus,
    dietary_notes = excluded.dietary_notes,
    message = excluded.message,
    submitted_at = excluded.submitted_at
  returning * into saved;

  update public.wedding_invitations
  set responded_at = saved.submitted_at
  where id = invitation.id;

  return jsonb_build_object(
    'saved', true,
    'attending', saved.attending,
    'submitted_at', saved.submitted_at
  );
end;
$$;

revoke all on function public.submit_wedding_rsvp(text, boolean, integer, integer, integer, integer, text, text) from public, authenticated;
grant execute on function public.submit_wedding_rsvp(text, boolean, integer, integer, integer, integer, text, text) to anon, authenticated;

-- adult_limit sagt der Oberflaeche, wie viele erwachsene Begleitungen erlaubt sind.
create or replace function public.open_wedding_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.wedding_invitations%rowtype;
  normalized_code text := upper(trim(coalesce(p_code, '')));
begin
  if normalized_code !~ '^[A-Z0-9]{6,12}$' then
    return null;
  end if;

  update public.wedding_invitations
  set
    first_opened_at = coalesce(first_opened_at, now()),
    last_opened_at = now(),
    open_count = open_count + 1
  where code = normalized_code
    and is_backup = false
  returning * into invitation;

  if invitation.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'code', invitation.code,
    'display_name', invitation.display_name,
    'default_language', invitation.default_language,
    'max_adults', invitation.max_adults,
    'max_children', invitation.max_children,
    'adult_limit', greatest(invitation.max_adults - 1, 0) + 1,
    'children_limit', 10,
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name', guest.full_name,
        'guest_type', guest.guest_type
      ) order by guest.sort_order, guest.created_at)
      from public.wedding_guests guest
      where guest.invitation_id = invitation.id
    ), '[]'::jsonb),
    'response', (
      select jsonb_build_object(
        'attending', response.attending,
        'partner_count', response.partner_count,
        'children_count', response.children_count,
        'kids_under_3', response.kids_under_3,
        'kids_3_to_17', response.kids_3_to_17,
        'kids_18_plus', response.kids_18_plus,
        'dietary_notes', response.dietary_notes,
        'message', response.message,
        'submitted_at', response.submitted_at
      )
      from public.wedding_rsvps response
      where response.invitation_id = invitation.id
    )
  );
end;
$$;
