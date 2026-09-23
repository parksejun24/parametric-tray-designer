# Formfield repository guide

## New-session reading order

1. Read `README.md` for the product contract, geometry model, architecture, and verification commands.
2. Read `docs/HANDOFF.md` for the current verified state, known limitations, and next work.
3. Read the newest file in `docs/worklog/` for the latest decisions and evidence.
4. Read relevant records in `docs/adr/` before changing geometry semantics.

`.omx/` contains machine-local runtime state and raw logs. It is not a durable project record and is intentionally ignored by Git.

## Required close-out

For every material code change:

- add or update a regression test;
- run the smallest proving test, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` as appropriate;
- append a dated entry to `docs/worklog/YYYY-MM-DD.md` with the problem, root cause, changed files, verification, and remaining risks;
- update `docs/HANDOFF.md` when current status, known limitations, or the next recommended task changes.

Do not claim that arbitrary input is supported. The supported outline contract is a finite, simple, closed 2D ring whose configured negative offsets leave one hole-free usable component. Self-intersections, open contours, and geometrically infeasible margin/web settings must fail with an explicit reason code.
