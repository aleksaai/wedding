# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product direction

- This is a mobile-first wedding invitation website for Aleksa and Debóra, not a generic wedding template.
- The final text-free hero artworks `public/assets/wedding-hero-mobile.webp` (1080 × 2340 source) and `public/assets/wedding-hero-desktop.webp` (2560 × 1440 source) are the visual source of truth: warm ivory paper, antique gold details, winter Budapest, and restrained motion. The hero deliberately has no names, invitation title, or verse because those obscured the couple. Keep only navigation plus the lower localized RSVP action. Mobile uses the portrait artwork and desktop uses the dedicated landscape artwork.
- The documentary Budapest image below the details section uses `public/assets/wedding-budapest-photo.webp`. Present it as a horizontal 16:9 image card with a restrained ivory/gold frame on both mobile and desktop; do not add a caption or text overlay.
- The personal invitation link should open directly without login or code entry. RSVP is a short progressive flow rather than one long form.
- The website supports four complete languages: German (`de`), Hungarian (`hu`), Serbian in Latin script (`sr`), and English (`en`). Personal invitation links select the language through `?lang=`; keep the manual language switch available as a fallback.
- Until final event details are confirmed, keep all placeholder content centralized by language in `src/i18n.js`.

## Local credentials

- The Wedding Supabase Management API access token is stored locally in macOS Keychain, account `wedding-project`, service `supabase-wedding-access-token`. Retrieve it only at runtime with `security find-generic-password -w -a wedding-project -s supabase-wedding-access-token`; never copy the value into Markdown, source code, frontend environment variables, or Git.
