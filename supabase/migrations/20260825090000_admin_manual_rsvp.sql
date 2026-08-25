-- Antworten kommen nicht nur ueber die Website: Gaeste sagen auch am Telefon,
-- per Mail oder muendlich zu. Der Admin soll dieselben Felder selbst erfassen
-- koennen. Zwei Dinge dafuer:
--   1. source haelt fest, ob die Antwort vom Gast kam oder manuell gebucht wurde
--   2. zwei Admin-RPCs, damit rsvp-Zeile und responded_at atomar zusammenpassen
-- Der Admin ist bewusst NICHT an max_adults / max_children gebunden, er weiss
-- es besser als der Plan. Nur eine grobe Obergrenze gegen Tippfehler.

alter table public.wedding_rsvps
  add column if not exists source text not null default 'guest';

alter table public.wedding_rsvps
  drop constraint if exists wedding_rsvps_source_check;

alter table public.wedding_rsvps
  add constraint wedding_rsvps_source_check check (source in ('guest', 'admin'));

create or replace function public.admin_upsert_wedding_rsvp(
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
  adults integer := case when p_attending then coalesce(p_partner_count, 0) else 0 end;
  under_3 integer := case when p_attending then coalesce(p_kids_under_3, 0) else 0 end;
  mid integer := case when p_attending then coalesce(p_kids_3_to_17, 0) else 0 end;
  grown integer := case when p_attending then coalesce(p_kids_18_plus, 0) else 0 end;
  saved public.wedding_rsvps%rowtype;
begin
  if not public.is_wedding_admin() then
    raise exception 'Not allowed';
  end if;

  if p_attending is null then
    raise exception 'Attendance is required';
  end if;

  select * into invitation
  from public.wedding_invitations
  where code = normalized_code
  for update;

  if invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if invitation.is_backup then
    raise exception 'Move this household to the guest list before recording a response';
  end if;

  if adults < 0 or adults > 20
     or under_3 < 0 or under_3 > 20
     or mid < 0 or mid > 20
     or grown < 0 or grown > 20 then
    raise exception 'Guest count looks wrong';
  end if;

  if char_length(coalesce(p_dietary_notes, '')) > 1000
     or char_length(coalesce(p_message, '')) > 2000 then
    raise exception 'Response text is too long';
  end if;

  insert into public.wedding_rsvps (
    invitation_id, attending, partner_count, children_count,
    kids_under_3, kids_3_to_17, kids_18_plus,
    dietary_notes, message, source, submitted_at
  ) values (
    invitation.id, p_attending, adults, under_3 + mid + grown,
    under_3, mid, grown,
    nullif(trim(coalesce(p_dietary_notes, '')), ''),
    nullif(trim(coalesce(p_message, '')), ''),
    'admin', now()
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
    source = 'admin',
    submitted_at = excluded.submitted_at
  returning * into saved;

  update public.wedding_invitations
  set responded_at = saved.submitted_at
  where id = invitation.id;

  return jsonb_build_object(
    'saved', true,
    'attending', saved.attending,
    'source', saved.source,
    'submitted_at', saved.submitted_at
  );
end;
$$;

-- Falsch verbucht: Antwort wieder entfernen, Einladung faellt zurueck auf ihren
-- vorherigen Status (Card ready / Sent / Opened).
create or replace function public.admin_clear_wedding_rsvp(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.wedding_invitations%rowtype;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  removed integer;
begin
  if not public.is_wedding_admin() then
    raise exception 'Not allowed';
  end if;

  select * into invitation
  from public.wedding_invitations
  where code = normalized_code
  for update;

  if invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  delete from public.wedding_rsvps where invitation_id = invitation.id;
  get diagnostics removed = row_count;

  update public.wedding_invitations
  set responded_at = null
  where id = invitation.id;

  return jsonb_build_object('cleared', removed > 0);
end;
$$;

revoke all on function public.admin_upsert_wedding_rsvp(text, boolean, integer, integer, integer, integer, text, text) from public, anon;
revoke all on function public.admin_clear_wedding_rsvp(text) from public, anon;
grant execute on function public.admin_upsert_wedding_rsvp(text, boolean, integer, integer, integer, integer, text, text) to authenticated;
grant execute on function public.admin_clear_wedding_rsvp(text) to authenticated;
