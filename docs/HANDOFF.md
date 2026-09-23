# Formfield handoff

Last updated: 2026-09-23

## Current state

- Browser application, Worker optimizer, SVG/DXF import/export, and independent DXF verification are implemented.
- Acute convex corners, sharp concave/reflex corners, and high-curvature star outlines are covered by integration regressions for both one-pocket and multi-pocket generation.
- Final pockets are clipped to the canonical usable domain after round inset, so containment is guaranteed by construction before scoring and export.
- The independent verifier treats floating-point-equivalent shared endpoints as boundary points while still rejecting measurable excursions.
- `examples/01-soft-rectangle.svg` through `examples/20-starburst.svg` provide a browser-verified outline corpus spanning convex, curved, asymmetric, concave, and acute-corner geometry.

## Supported outline contract

Formfield supports finite, simple, closed SVG/DXF outer rings when the selected outer margin and web width leave one hole-free usable component with enough area for the requested pockets. “Any outline” does not include self-intersecting/open contours or cases where negative offset collapses or splits the usable region; those remain explicit validation failures.

## Verification baseline

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The latest command results and exact counts are recorded in `docs/worklog/2026-09-23.md`.

## Next recommended work

- Add real user-provided failing SVG/DXF files as sanitized fixtures when available.
- Consider property-based generation of simple high-curvature polygons to expand the sharp-corner corpus.
- Add CI so the documented verification baseline is checked on every remote change.
