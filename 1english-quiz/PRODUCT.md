# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Kazakh-speaking adults 18–50 who tapped a Meta (Instagram/Facebook) ad for 1English on their phone. They are deciding, in under a minute, whether to leave a number for a free placement / trial lesson.

## Product Purpose
A 5-question quiz (age + the 4 reference questions) that qualifies and captures leads for 1English online English courses. Success = a qualified visitor (18–50) leaves name + phone, the row lands in Google Sheets with every answer, and Meta Pixel fires `Lead`.

## Positioning
1English promises concrete English results in 2 months, taught in Kazakh. The quiz asks why (income, work abroad, travel), current level (A0–B1) and readiness, then offers a level-check trial lesson.

## Operating Context
- Traffic: Meta ads, mobile first; desktop must also work.
- Prototype on GitHub Pages (`youngfuture-games/1english-quiz`), production = one HTML block pasted into Tilda (T123) on 1eng.kz.
- Leads go to Google Sheets through a Google Apps Script web app (that sheet is the "CRM").
- Reference of the current quiz: https://1eng.kz/quiznew

## Capabilities and Constraints
- Identical copy of https://1eng.kz/quiznew (client's words: «абсолютную копию сайта референса, идентично»), plus: Q1 age — under 18 or over 50 closes the page (window.close, else about:blank), nothing sent, no Pixel Lead; after a lead → thanks.html with a button to Instagram @1eng.kz.
- All answers travel with the lead.
- Pixel 2168758820343543: PageView on load, Lead only after the sheet confirms the write.
- The page runs on Tilda's CSS/JS from static.tildacdn.pro (that is what makes it identical); our code only adds the age stop and the send to the sheet.
- Copy is Kazakh, verbatim from the client brief.

## Brand Commitments
- Logo: `~/1english-platform/assets/logo.png` (navy stem + crimson dot «i»).
- Palette from the logo: navy `#0A3161`, crimson `#B31942`; font Golos Text (as on the 1English platform).

## Evidence on Hand
No testimonials, prices or student numbers were provided — do not invent them.

## Product Principles
- One question per screen, one tap per answer.
- Qualify before asking for a phone number.
- Never lose a lead: a failed send must be visible and retryable.
