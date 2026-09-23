# Fixture contract

Every geometry fixture records its source format, physical unit, expected support
status, and stable failure reason when rejection is expected. Tests should prefer
small analytic shapes whose area and containment can be checked independently.

The initial corpus is intentionally text based so it is reviewable in diffs:

- `svg/rectangle-mm.svg`: one supported closed outer contour.
- `svg/transformed-rectangle.svg`: nested affine transforms.
- `svg/reject-script.svg`: active content that must be rejected.
- `dxf/rectangle-mm.dxf`: one closed millimetre LWPOLYLINE.
- `dxf/rectangle-unitless.dxf`: valid geometry that requires a physical-unit gate.

Additional optimization and directional fixtures should be added only with an
analytic expectation or a reviewed golden preview.
