# Design — 1English quiz

The design is the reference itself: `index.html` is the published Tilda page https://1eng.kz/quiznew (quiz block t1040, record 4059127803) with Tilda's own CSS/JS from static.tildacdn.pro. Do not restyle it: the client asked for an identical copy.

Additions keep Tilda's native look:
- Age step = Tilda radio group (`t-input-group_rd`) at step 0; labels min-height 48px so every answer is a 44px+ tap target.
- `thanks.html` matches the quiz: white, TildaSans, text `#313f53`, title `#0f4a92`, progress-bar blue `#7eb3ff`, button gradient `#7eb3ff → #4f85d4`, radius 40px.
