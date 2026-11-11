# Design — 1English quiz

World: an exam answer sheet (ҰБТ-style machine-read form). The sheet is the page; every answer is a filled bubble.

## Tokens
- navy `#0A3161` (header block, page surround, focus), navy-deep `#061C3A` (timing marks, registration square, button shadow), navy-soft `#173F73` (bubble letters, labels)
- crimson `#B31942` — only filled marks and the send button; crimson-lite `#E8536F` for marks on navy
- sheet `#FBFCFE`, ink `#0E1B2E`, muted `#4A5B74`, dropout ink `#6F8BB3` (printed bubbles, input borders, ≥3:1), rule `#D6E0EE`, tint `#EEF3FA` (hover)
- Golos Text 400–800. Question 24–30px/700, options 17px/500, labels 14–15px/600.
- Square corners on fields, button and number box (printed form); only bubbles are round.

## Components
- Header block: logo «i», «1English», «Жауап парағы / 4 сұрақ», mini answer grid (one group per question, current group tinted) — this is the progress indicator.
- Option row: 32px bubble with letter A–E + text on a ruled line, min-height 60px. Pick = crimson fill scaling from the centre (.42s expo-out), then the sheet feeds up to the next step.
- Level answers split «Name (A0) – description» into a bold line and a muted line.
- Fields: boxed, 56px, 2px dropout border → navy on focus, crimson on error, error text under the field.
- Send: full-width crimson slab with a 6px navy-deep offset shadow that presses down.
- Endings: one large stamped circle (crimson = lead accepted, navy = age stop) + heading + one line.

## Rules
- Timing marks on the left edge and the registration square bottom-right stay; they are the world's ornament.
- No cards, no gradients, no icons beyond the check mark.
- Hover only under `(hover:hover)`; reduced motion turns animation off.
