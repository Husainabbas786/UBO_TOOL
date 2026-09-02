# Meydan Free Zone — Brand Spec for the UBO Tool

Distilled from the official *Meydan Free Zone Brand Guidelines* (151-page deck). Every value below
is taken directly from the guidelines. This file is the single source of truth for `src/theme/tokens.ts`.

## Logo
- File: `public/brand/mfz-logo.png` (2195×820, transparent background). Primary lock-up:
  "meydan : FZ" wordmark with the gradient ring and "DUBAI TO THE WORLD" tagline.
- Use on white or the pale-sky background only. Never recolour, stretch, or place on a busy background.
- Header size: ~40px tall at desktop, ~32px on mobile. Keep clear space of at least the height of the "FZ" around it.

## Colours

### Primary (use these for structure — headers, buttons, key states)
| Token            | Hex       | Notes                                      |
|------------------|-----------|--------------------------------------------|
| `mfzBlue`        | `#00518C` | Pantone 2945 C. Core brand blue. Headings, primary UI. |
| `mfzGreen`       | `#62A830` | Pantone 369 CP. Core brand green. Positive/UBO state. |
| `lightGreen`     | `#029956` |                                            |
| `darkGreen`      | `#06603A` |                                            |

Each primary has a tint scale (5 steps toward white). Generate tints programmatically by mixing with white
at 80/60/40/20/10% — the guidelines show exactly this ramp under each swatch.

### Secondary / accents (use sparingly — one accent job each)
| Token         | Hex       | Suggested job in the UBO tool                          |
|---------------|-----------|--------------------------------------------------------|
| `navy`        | `#1F3F76` | Dark surfaces, target-entity node, gradient end        |
| `deepTeal`    | `#0B7A9E` | Primary button gradient start, focus rings, links      |
| `teal`        | `#64BEC7` | Hover/secondary accent                                 |
| `steelBlue`   | `#6A9DBF` | Chart edges, dividers, muted labels                    |
| `paleSky`     | `#D2F0FC` | Page/hero background wash, info banners                |
| `sage`        | `#75B677` | Success tint                                           |
| `lime`        | `#C5D344` | Reserve — logo ring only; don't use for UI             |
| `purple`      | `#8B65A4` | "Control" badge and dashed control edges               |
| `magenta`     | `#A8498B` | Reserve — do not use in this tool                      |
| `coral`       | `#D26153` | Errors, blocked state, unidentified-owner warning      |

### Brand gradients (from the guidelines)
- Blue: `#1F3F76 → #D2F0FC` (navy to pale sky) — hero band / header wash
- Teal-green: `#0B7A9E → #06603A → #62A830`
- Green: `#06603A → #62A830 → #C5D344`
- Buttons in the web-elements section use a teal→navy gradient (`#0B7A9E → #1F3F76`) or green gradient (`#62A830 → #06603A`).

### Neutrals
Derive greys from the blue tint ramp, not pure grey — the guidelines' neutral field is a cool blue-grey
(`~#C9D3DC` for the pattern background). Text: `#0F1F33` (near-navy) for body, `#00518C` for headings.
Page background: white. Card background: white with a 1px `#E3EBF2` border. Avoid pure `#000`.

## Typography — Plus Jakarta Sans (open source, OFL)
Install: `npm i @fontsource/plus-jakarta-sans` and import weights 300, 400, 500, 600, 700.
Fallback stack: `"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif`.

Type scale from the guidelines (size/line-height):
| Role | Weight   | Size/LH   |
|------|----------|-----------|
| H1   | SemiBold | 36/38     |
| H2   | SemiBold | 24/28     |
| H3   | SemiBold | 18/21     |
| H4   | Medium   | 12/15 → use 14/18 on screen for legibility |
| Body | Light/Regular | 12 → use 14/20 on screen; Regular 400 for readability, Light 300 for large lead text only |
| CTA  | SemiBold | 14        |

Headings in **sentence case**. Never all-caps labels. Slight negative tracking on H1/H2 (−0.01em).

## Web elements (Section 20 of the guidelines)
- **Buttons are pills** (fully rounded, `border-radius: 9999px`).
  - Primary: teal→navy gradient fill (`#0B7A9E → #1F3F76`), white SemiBold text, small trailing arrow on CTAs.
  - Secondary: white fill, 1.5px `#0B7A9E` border, `#0B7A9E` text.
  - Green variant (for the main "Calculate ownership" action): `#62A830 → #06603A` gradient.
  - Disabled: `#C9D3DC` fill, `#6A7C8F` text, no gradient.
- **Forms**: label above the field in Medium 12–13px navy; input has a light `#F4F8FB` fill, 1px `#D6E0E8`
  border, 6px radius (inputs are NOT pills — only buttons are). Focus: 2px `#0B7A9E` ring. Title case for
  form titles, sentence case for field labels. Keep forms short.
- **Navigation/header**: white bar, logo left, actions right, 1px bottom border. A pill CTA on the right.
- **Lists/tables**: generous row height (44–48px), thin `#E3EBF2` row dividers, headings in navy Medium.

## Pattern
Concentric thin rings/arcs in `#6A9DBF` at ~15% opacity on a navy or pale-sky field. Use once, as a subtle
decoration in the header band behind the title — never behind tables or the chart.

## Applying the brand to the UBO tool's states
| State / element             | Treatment                                                      |
|-----------------------------|----------------------------------------------------------------|
| UBO (meets threshold)       | `#62A830` pill, `#ECF6E4` tint background, dark-green text     |
| Below threshold             | `#F4F8FB` pill, `#6A7C8F` text                                 |
| No owners entered (gap)     | `#FBE9E6` tint, `#D26153` border/text                          |
| Control badge               | `#8B65A4` fill, white text, small pill                         |
| Validation errors / blocked | `#D26153` text and border, `#FBE9E6` background                |
| Company total at 100%       | `#62A830` chip                                                 |
| Company total ≠ 100%        | `#D26153` chip                                                 |

### Chart palette (concrete hex in the SVG — never CSS variables, so exports render identically)
| Node / edge         | Fill      | Stroke    | Text      |
|---------------------|-----------|-----------|-----------|
| Individual (plain)  | `#FFFFFF` | `#6A9DBF` | `#0F1F33` |
| Individual — UBO    | `#ECF6E4` | `#62A830` | `#06603A` |
| Company (intermediary) | `#F4F8FB` | `#00518C` | `#0F1F33` |
| Target company      | `#1F3F76` | `#1F3F76` | `#FFFFFF` |
| Ownership edge      | —         | `#6A9DBF` | label `#0F1F33` on white chip |
| Control edge (dashed)| —        | `#8B65A4` | label `#8B65A4` |
| Icons               | inherit stroke colour                                    |
