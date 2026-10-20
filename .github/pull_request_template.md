<!-- One Queue: every PR serves one card on the board. The pr-body check stays red until Card, Solves and Size are filled in. -->

Card: 
<!-- The board card this PR serves, as https://app.notion.com/p/<32 hex>. No card yet? File one with /intake first. -->

Solves: 
<!-- The problem this fixes and who has it, in one line. -->

Size: 
<!-- S, M or L: S fits one session, M two, L three or more. -->

Stages / kit case: 
<!-- The user-lifecycle stages or the kit case that proves it works, or n.a. -->

Seen by Caleb: yes / no / n.a.
<!-- Keep one: yes if he has seen the UI or copy change, no if it waits on him, n.a. when nothing he sees changed. -->

## What Changed

Design check: <!-- Required when the diff touches UI files (the check lists which); delete this section otherwise. Load design-standards first. Answer each line with one of pass, fixed or n.a. plus a reason. -->
- Wait signal and no double-fire (design-standards 4): pass / fixed / n.a.
- Every state (loading, empty, error, pressed, disabled): pass / fixed / n.a.
- Light and dark: pass / fixed / n.a.
- Largest text and narrowest width: pass / fixed / n.a.
- Casing and caption rules: pass / fixed / n.a.
- Every number has a unit and a date: pass / fixed / n.a.
