# Design QA — Final Responsive Wedding Hero

## Evidence

- Mobile source visual truth: `/Users/aleksaspalevic/Downloads/FINAL Wedding Images - No Text/wedding-image-no-text-1080x2340.png` (1080 × 2340 px).
- Desktop source visual truth: `/Users/aleksaspalevic/Downloads/FINAL Wedding Images - No Text/wedding-image-no-text-2560x1440.png` (2560 × 1440 px).
- Browser-rendered mobile implementation: `qa/final-hero-mobile-390x844.png` (390 × 844 px).
- Browser-rendered desktop implementation: `qa/final-hero-desktop-1440x900.png` (1440 × 900 px).
- Same-input comparison evidence: `qa/final-hero-mobile-comparison.png` and `qa/final-hero-desktop-comparison.jpg`.
- Updated Budapest photo source: `/Users/aleksaspalevic/Downloads/COVER-norbert-lepsik.webp` (1024 × 768 px).
- Updated browser evidence: `qa/hero-wide-anchor-2048x974.png`, `qa/budapest-photo-mobile-390x844.png`, and `qa/budapest-photo-desktop-1440x900.png`.
- Updated same-input comparisons: `qa/hero-wide-anchor-comparison.jpg` and `qa/budapest-photo-comparison.jpg`.
- Implementation URL: `http://127.0.0.1:5173/?lang=de`.
- CSS viewports: 390 × 844 mobile and 1440 × 900 desktop, device scale factor 1.
- Density normalization: the mobile source was downsampled and center-fitted to 390 × 844; the desktop source was center-cropped with the same `cover` behavior as the implementation and downsampled to 1440 × 900.
- State: German hero, RSVP closed.

## Full-view comparison evidence

Both source artworks were placed directly beside their matching browser captures before review. Mobile retains the intended portrait composition, with both faces, clothing, and the skyline unobstructed. Desktop now uses the dedicated landscape artwork across the complete viewport rather than a portrait crop or framed card. In both views, the localized RSVP action is visible inside the first viewport.

## Focused region comparison evidence

No separate detail crop was necessary: both same-input comparisons render the faces, navigation, image crop, CTA, and bottom transition large enough to inspect. The mobile comparison specifically verifies that no hero copy covers the couple; the desktop comparison verifies the 16:9 panorama and above-the-fold RSVP treatment.

## Required fidelity surfaces

- Fonts and typography: the hero intentionally keeps only the small personal-invitation line, primary RSVP label, and discovery cue. Display copy that previously obscured the couple remains removed. Type hierarchy and letter spacing are consistent across mobile and desktop.
- Spacing and layout rhythm: the hero is exactly one viewport high at both breakpoints. Navigation has clear edge spacing, faces remain in uninterrupted negative space, and the complete RSVP group fits above the fold.
- Colors and visual tokens: navy controls, ivory CTA, antique-gold monogram accent, and the dark lower contrast treatment remain aligned with the invitation artwork.
- Image quality and asset fidelity: the exact final source artworks are used as optimized WebP files (mobile 270.6 KB; desktop 452.3 KB). Mobile uses its native portrait composition; desktop uses the true landscape composition with its vertical anchor shifted to 20% for ultrawide screens. The supplied Budapest photo is preserved as a 138 KB WebP and displayed in a 16:9 framed container.
- Copy and content: German labels are correct in the captured state; the same localized hero strings remain wired for German, Hungarian, Serbian Latin, and English.

## Findings

- No actionable P0, P1, or P2 findings.
- [P3] Google Fonts can be self-hosted before production to remove the external font dependency.

## Comparison history

### Pass 1 — user feedback

- [P1] Mobile names, title, verse, and reference covered both faces.
- [P1] Desktop used portrait artwork as a narrow centered card, while the RSVP action fell below the 900 px viewport.
- Fixes: removed the upper hero copy, made the image full bleed, set the hero to `100svh`, and kept the RSVP action above the fold.

### Pass 2 — interim portrait assets

- Mobile faces were fully unobstructed and the CTA fit inside the viewport.
- Desktop full bleed and CTA placement were resolved, but the portrait source still required an intentional crop.

### Pass 3 — final responsive assets

- Replaced both interim files with the final no-text artworks.
- Added the dedicated 2560 × 1440 landscape source for desktop and centered its crop.
- Browser evidence confirms the correct responsive source loads at each breakpoint, viewport widths do not overflow, the CTA remains fully visible, and the console contains no warnings or errors.
- Post-fix evidence: `qa/final-hero-mobile-comparison.png` and `qa/final-hero-desktop-comparison.jpg`.

### Pass 4 — ultrawide crop and documentary photo

- [P1] At the user's ultrawide desktop ratio, the previously centered vertical crop cut through Aleksa's head.
- [P2] The previous full-height illustrated scene and its overlaid “Budapest im Winter” caption did not match the requested documentary-photo treatment.
- Fixes: moved the desktop hero's vertical anchor from 50% to 20%; replaced the illustrated scene with the supplied Fisherman's Bastion photo; removed all visible caption copy; and placed the photo inside a restrained 16:9 ivory/gold frame.
- Post-fix evidence: `qa/hero-wide-anchor-comparison.jpg` at 2048 × 974 and `qa/budapest-photo-comparison.jpg`, plus browser captures at 390 × 844 and 1440 × 900.
- No remaining P0/P1/P2 issue. Both image containers have zero horizontal overflow, and browser logs contain no warnings or errors.

## Primary interactions tested

- Responsive `<picture>` source selection at 390 px and 1440 px.
- Ultrawide desktop hero crop at 2048 × 974.
- Horizontal Budapest photo card at 390 × 844 and 1440 × 900.
- Header language/RSVP controls visible and unobstructed.
- Bottom RSVP button and discovery link visible in the closed state.
- Browser console checked after both responsive reloads; no application errors or warnings.

## Implementation checklist

- [x] Use the final 1080 × 2340 mobile artwork.
- [x] Use the final 2560 × 1440 desktop artwork.
- [x] Keep faces and upper composition free of copy.
- [x] Keep the complete RSVP action above the fold.
- [x] Verify correct source selection and no horizontal overflow.
- [x] Run production build and Sites packaging tests.
- [x] Keep both heads visible in the ultrawide desktop hero.
- [x] Replace the illustrated captioned scene with the supplied horizontal photo card.

final result: passed
