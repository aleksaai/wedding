# Ungarische Karten mit großer Schrift (2026-10-08)

Quelle für `public/assets/cards/HU-FRONT.png` und `HU-BACK.png`.

- `front-clean.png` / `back-clean.png`: Originalkarten mit entfernter Schrift (erzeugt von `clean.py` für die Vorderseite und `clean_back.py` für die Rückseite, Eingabe = alte `HU-*.png` aus Commit `2e3721a`).
- `front.html` / `back.html`: Textsatz, 1417 × 2126 px. Rendern mit
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1417,2126 --screenshot=out.png back.html`
  Danach mit Pillow `dpi=(300,300)` und das ICC-Profil der alten Karte setzen, Vorderseite als RGBA.
- `back.html` schreibt die Mitte des Code-Felds in den `<title>` (`--dump-dom`). Ändert sich das Layout, `codeSlots.HU` in `src/admin/AdminApp.jsx` und `cardArtworkVersion` nachziehen.
- Schriften: Bodoni 72, Avenir Next (Rückseite), Georgia (Vorderseite) — alle auf macOS vorinstalliert.
