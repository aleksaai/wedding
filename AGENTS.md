# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product direction

- This is a mobile-first wedding invitation website for Aleksa and Debóra, not a generic wedding template.
- The final text-free hero artworks `public/assets/wedding-hero-mobile.webp` (1080 × 2340 source) and `public/assets/wedding-hero-desktop.webp` (2560 × 1440 source) are the visual source of truth: warm ivory paper, antique gold details, winter Budapest, and restrained motion. The hero deliberately has no names, invitation title, or verse because those obscured the couple. Keep only navigation plus the lower localized RSVP action. Mobile uses the portrait artwork and desktop uses the dedicated landscape artwork.
- The Fisherman's Bastion image below the details section uses `public/assets/wedding-budapest-photo.webp`. Present it as a horizontal 16:9 image card without caption or text overlay. Its current visual treatment is a modern rounded glass frame: translucent white surface, real backdrop blur, soft image-derived colour confined inside the frame, and restrained depth on mobile and desktop. The surrounding section must retain the same beige paper background as adjacent sections.
- The personal invitation link opens directly at `/<CODE>` (also accept `/i/<CODE>`) without login or code entry. Codes are random, non-sequential, 6–12 character uppercase alphanumeric values. RSVP is a short progressive flow rather than one long form.
- Guests who open only the root website can still complete RSVP. In that generic flow, the final step requires the invitation code printed on the card; validate it through `open_wedding_invitation` before submitting through the same `submit_wedding_rsvp` RPC. Personal subpages continue to supply the code invisibly.
- The website supports four complete languages: German (`de`), Hungarian (`hu`), Serbian in Latin script (`sr`), and English (`en`). Each invitation stores its default language in Supabase; `?lang=` overrides it and the manual switch remains available as a fallback.
- Supabase project `hazvuskpuyudotqqdtoy` is the production source of truth. Public visitors never receive direct table grants: the personal page uses the narrow `open_wedding_invitation` RPC and RSVP uses `submit_wedding_rsvp`. RLS restricts table CRUD to the approved admin allowlist. Never put a service-role key or management PAT in frontend code.
- The private guest workspace lives in the same application at `/admin`. It uses Supabase email magic-link authentication and supports invitation creation/editing, category/language/status filters, card/sent/opened tracking, direct-link copy, and response review. Approved emails are `info@aleksa.ai` and `szildebora@gmail.com`. Auth signups are disabled; both accounts must be pre-provisioned, `signInWithOtp` must use `shouldCreateUser: false`, and the UI must verify `is_wedding_admin()` before loading the dashboard.
- Invitation category defaults are canonical: Debi family/friends → Hungarian, Aleksa family → Serbian, Aleksa friends → German, common friends → English.
- Yellow spreadsheet rows are reserve guests, not active invitees. Store them as `is_backup = true` and show them only in the admin Backup list. They do not count toward active invitation/people totals, their links and RSVP RPC access stay disabled, and they become normal invitees only after an admin explicitly moves them to the Guest list.
- Canonical event details live in `src/i18n.js`: Aleksa Spalevic & Debora Szilagyi; wedding 23.01.2027; church at Wesselényi utca 53, 1077 Budapest from 14:00; reception at Pollack Mihály tér 3, 1088 Budapest from 17:00; RSVP deadline 31.10.2026; contact `szildebora@gmail.com` / `+36 20 346 7329`. Keep shared addresses, map URLs, website, email, and phone centralized in `eventDetails`; keep user-facing copy localized in all four translation objects.

## Local credentials

- The Wedding Supabase Management API access token is stored locally in macOS Keychain, account `wedding-project`, service `supabase-wedding-access-token`. Retrieve it only at runtime with `security find-generic-password -w -a wedding-project -s supabase-wedding-access-token`; never copy the value into Markdown, source code, frontend environment variables, or Git.
