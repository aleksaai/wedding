alter table public.wedding_invitations
add column is_backup boolean not null default false;

create index wedding_invitations_backup_category_idx
on public.wedding_invitations (is_backup, category, created_at desc);

insert into public.wedding_invitations
  (display_name, category, default_language, max_adults, max_children, internal_notes, is_backup)
values
  ('Atty', 'debi_friends', 'hu', 2, 0, 'Yellow backup row', true),
  ('Adri', 'debi_friends', 'hu', 1, 0, 'Yellow backup row', true),
  ('Tanya', 'debi_friends', 'hu', 1, 0, 'Yellow backup row', true),
  ('Didi', 'debi_friends', 'hu', 1, 0, 'Yellow backup row', true),
  ('Mama''s Cousine', 'aleksa_family', 'sr', 1, 0, 'Yellow backup row', true),
  ('Jonas', 'aleksa_friends', 'de', 2, 2, 'Yellow backup row · 2 half price', true),
  ('Common backup guest', 'common', 'en', 4, 0, 'Yellow common-friends row · replace with final name before inviting', true)
on conflict (category, display_name) do update set
  default_language = excluded.default_language,
  max_adults = excluded.max_adults,
  max_children = excluded.max_children,
  internal_notes = excluded.internal_notes,
  is_backup = true;
