alter table public.wedding_invitations
add constraint wedding_invitations_category_display_name_key unique (category, display_name);

insert into public.wedding_invitations
  (display_name, category, default_language, max_adults, max_children, internal_notes)
values
  ('Parents', 'debi_family', 'hu', 2, 0, null),
  ('Brother', 'debi_family', 'hu', 2, 0, null),
  ('Grandma', 'debi_family', 'hu', 1, 0, null),
  ('Tibi', 'debi_family', 'hu', 3, 1, '1 half price'),
  ('Sanyi', 'debi_family', 'hu', 2, 0, null),
  ('Lilla', 'debi_family', 'hu', 2, 0, null),
  ('Tomi', 'debi_family', 'hu', 2, 0, null),
  ('Szilárd', 'debi_family', 'hu', 2, 3, '2 half price, 1 under age'),
  ('öcsi', 'debi_family', 'hu', 6, 0, null),
  ('zsiga', 'debi_family', 'hu', 2, 0, null),
  ('zsoki', 'debi_family', 'hu', 2, 0, null),
  ('dani', 'debi_family', 'hu', 2, 3, '2 half price, 1 under age'),
  ('ancsa', 'debi_family', 'hu', 2, 2, '1 half price, 1 under age'),
  ('Laci', 'debi_family', 'hu', 3, 2, '1 half price, 1 under age'),
  ('vilma', 'debi_family', 'hu', 3, 3, '1 half price, 2 under age'),
  ('brigi', 'debi_family', 'hu', 3, 0, null),
  ('gyuszi', 'debi_family', 'hu', 2, 0, null),
  ('Adina', 'debi_family', 'hu', 2, 0, null),

  ('Adel', 'debi_friends', 'hu', 1, 0, null),
  ('Petra', 'debi_friends', 'hu', 1, 0, null),
  ('Lili', 'debi_friends', 'hu', 2, 0, null),
  ('Lilla', 'debi_friends', 'hu', 2, 0, null),

  ('Mom & bro', 'aleksa_family', 'sr', 2, 0, null),
  ('Godfather', 'aleksa_family', 'sr', 2, 1, '1 half price'),
  ('Braca (Uncle)', 'aleksa_family', 'sr', 3, 1, '1 half price'),
  ('Juga (Uncle)', 'aleksa_family', 'sr', 3, 0, null),
  ('Ceca', 'aleksa_family', 'sr', 2, 0, null),
  ('Nina', 'aleksa_family', 'sr', 3, 1, '1 half price'),
  ('Goza (samo Milica)', 'aleksa_family', 'sr', 1, 0, null),
  ('Dragana', 'aleksa_family', 'sr', 3, 0, null),

  ('Selim', 'aleksa_friends', 'de', 2, 0, null),
  ('Max', 'aleksa_friends', 'de', 2, 0, null),
  ('Nicolas', 'aleksa_friends', 'de', 2, 0, null),
  ('Dimi', 'aleksa_friends', 'de', 1, 0, null),
  ('Richard', 'aleksa_friends', 'de', 2, 0, null),
  ('Kyung', 'aleksa_friends', 'de', 2, 0, null),
  ('Mehmet', 'aleksa_friends', 'de', 2, 0, null),
  ('Erol', 'aleksa_friends', 'de', 1, 0, null),
  ('Bilal', 'aleksa_friends', 'de', 1, 0, null),
  ('Markus', 'aleksa_friends', 'de', 1, 0, null),
  ('Lukas', 'aleksa_friends', 'de', 1, 0, null),
  ('Jan', 'aleksa_friends', 'de', 1, 0, null),
  ('Nico', 'aleksa_friends', 'de', 1, 0, null),
  ('Mike', 'aleksa_friends', 'de', 1, 0, null),

  ('Celly', 'common', 'en', 1, 0, null),
  ('Julia', 'common', 'en', 1, 0, null),
  ('MJ', 'common', 'en', 1, 0, null),
  ('Ed', 'common', 'en', 1, 0, null),
  ('Jason', 'common', 'en', 2, 0, null),
  ('Augustus', 'common', 'en', 4, 0, null)
on conflict (category, display_name) do update set
  default_language = excluded.default_language,
  max_adults = excluded.max_adults,
  max_children = excluded.max_children,
  internal_notes = excluded.internal_notes;

