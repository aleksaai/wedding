update public.wedding_invitations
set card_generated_at = coalesce(card_generated_at, now())
where is_backup = false;

