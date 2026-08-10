create schema if not exists private;

create table private.wedding_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

insert into private.wedding_admins (email)
values
  ('aleksa.spalevic2000@gmail.com'),
  ('szildebora@gmail.com')
on conflict (email) do nothing;

create table public.wedding_invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  display_name text not null check (char_length(display_name) between 1 and 160),
  category text not null check (category in ('debi_family', 'debi_friends', 'aleksa_family', 'aleksa_friends', 'common')),
  default_language text not null check (default_language in ('de', 'hu', 'sr', 'en')),
  max_adults smallint not null default 1 check (max_adults between 1 and 12),
  max_children smallint not null default 0 check (max_children between 0 and 12),
  internal_notes text,
  card_generated_at timestamptz,
  sent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0 check (open_count >= 0),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wedding_invitations_code_format check (code ~ '^[A-Z0-9]{6,12}$')
);

create table public.wedding_guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.wedding_invitations(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 160),
  guest_type text not null default 'adult' check (guest_type in ('adult', 'child')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index wedding_guests_invitation_id_idx on public.wedding_guests (invitation_id);
create index wedding_invitations_category_created_idx on public.wedding_invitations (category, created_at desc);
create index wedding_invitations_responded_at_idx on public.wedding_invitations (responded_at) where responded_at is not null;

create table public.wedding_rsvps (
  invitation_id uuid primary key references public.wedding_invitations(id) on delete cascade,
  attending boolean not null,
  partner_count smallint not null default 0 check (partner_count between 0 and 11),
  children_count smallint not null default 0 check (children_count between 0 and 12),
  dietary_notes text check (dietary_notes is null or char_length(dietary_notes) <= 1000),
  message text check (message is null or char_length(message) <= 2000),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.is_wedding_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from private.wedding_admins admin
      where admin.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    );
$$;

revoke all on function private.is_wedding_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_wedding_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger wedding_invitations_set_updated_at
before update on public.wedding_invitations
for each row execute function private.set_updated_at();

create trigger wedding_rsvps_set_updated_at
before update on public.wedding_rsvps
for each row execute function private.set_updated_at();

alter table public.wedding_invitations enable row level security;
alter table public.wedding_guests enable row level security;
alter table public.wedding_rsvps enable row level security;

create policy wedding_invitations_admin_all
on public.wedding_invitations
for all
to authenticated
using ((select private.is_wedding_admin()))
with check ((select private.is_wedding_admin()));

create policy wedding_guests_admin_all
on public.wedding_guests
for all
to authenticated
using ((select private.is_wedding_admin()))
with check ((select private.is_wedding_admin()));

create policy wedding_rsvps_admin_all
on public.wedding_rsvps
for all
to authenticated
using ((select private.is_wedding_admin()))
with check ((select private.is_wedding_admin()));

revoke all on public.wedding_invitations, public.wedding_guests, public.wedding_rsvps from anon;
grant select, insert, update, delete on public.wedding_invitations, public.wedding_guests, public.wedding_rsvps to authenticated;

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
  invitation public.wedding_invitations%rowtype;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_partner_count integer := case when p_attending then coalesce(p_partner_count, 0) else 0 end;
  normalized_children_count integer := case when p_attending then coalesce(p_children_count, 0) else 0 end;
  saved public.wedding_rsvps%rowtype;
begin
  if normalized_code !~ '^[A-Z0-9]{6,12}$' or p_attending is null then
    raise exception 'Invalid invitation response';
  end if;

  select * into invitation
  from public.wedding_invitations
  where code = normalized_code
  for update;

  if invitation.id is null then
    raise exception 'Invitation not found';
  end if;

  if normalized_partner_count < 0
     or normalized_partner_count > greatest(invitation.max_adults - 1, 0)
     or normalized_children_count < 0
     or normalized_children_count > invitation.max_children then
    raise exception 'Guest count exceeds invitation allowance';
  end if;

  if char_length(coalesce(p_dietary_notes, '')) > 1000
     or char_length(coalesce(p_message, '')) > 2000 then
    raise exception 'Response text is too long';
  end if;

  insert into public.wedding_rsvps (
    invitation_id,
    attending,
    partner_count,
    children_count,
    dietary_notes,
    message,
    submitted_at
  ) values (
    invitation.id,
    p_attending,
    normalized_partner_count,
    normalized_children_count,
    nullif(trim(coalesce(p_dietary_notes, '')), ''),
    nullif(trim(coalesce(p_message, '')), ''),
    now()
  )
  on conflict (invitation_id) do update set
    attending = excluded.attending,
    partner_count = excluded.partner_count,
    children_count = excluded.children_count,
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

revoke all on function public.open_wedding_invitation(text) from public, authenticated;
revoke all on function public.submit_wedding_rsvp(text, boolean, integer, integer, text, text) from public, authenticated;
grant execute on function public.open_wedding_invitation(text) to anon, authenticated;
grant execute on function public.submit_wedding_rsvp(text, boolean, integer, integer, text, text) to anon, authenticated;
