import type { Config } from 'tailwindcss'
import {
  accent,
  brand,
  neutral,
  radius,
  state,
  table,
  tints,
  typeScale,
} from './src/theme/tokens'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mfzBlue: { DEFAULT: brand.mfzBlue, ...tints(brand.mfzBlue) },
        mfzGreen: { DEFAULT: brand.mfzGreen, ...tints(brand.mfzGreen) },
        lightGreen: { DEFAULT: brand.lightGreen, ...tints(brand.lightGreen) },
        darkGreen: { DEFAULT: brand.darkGreen, ...tints(brand.darkGreen) },
        navy: { DEFAULT: accent.navy, ...tints(accent.navy) },
        deepTeal: { DEFAULT: accent.deepTeal, ...tints(accent.deepTeal) },
        teal: { DEFAULT: accent.teal, ...tints(accent.teal) },
        steelBlue: { DEFAULT: accent.steelBlue, ...tints(accent.steelBlue) },
        paleSky: accent.paleSky,
        sage: accent.sage,
        purple: { DEFAULT: accent.purple, ...tints(accent.purple) },
        coral: { DEFAULT: accent.coral, ...tints(accent.coral) },
        ink: neutral.ink,
        muted: neutral.muted,
        line: neutral.line,
        field: neutral.field,
        fieldBorder: neutral.fieldBorder,
        disabled: neutral.disabled,
        uboTint: state.uboTint,
        gapTint: state.gapTint,
        infoTint: state.infoTint,
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      fontSize: {
        h1: [typeScale.h1.size, { lineHeight: typeScale.h1.lineHeight, letterSpacing: typeScale.h1.tracking }],
        h2: [typeScale.h2.size, { lineHeight: typeScale.h2.lineHeight, letterSpacing: typeScale.h2.tracking }],
        h3: [typeScale.h3.size, { lineHeight: typeScale.h3.lineHeight }],
        h4: [typeScale.h4.size, { lineHeight: typeScale.h4.lineHeight }],
        body: [typeScale.body.size, { lineHeight: typeScale.body.lineHeight }],
        small: [typeScale.small.size, { lineHeight: typeScale.small.lineHeight }],
        cta: [typeScale.cta.size, { lineHeight: typeScale.cta.lineHeight }],
      },
      borderRadius: {
        input: radius.input,
        card: radius.card,
        pill: radius.pill,
      },
      spacing: {
        row: table.rowHeight,
      },
    },
  },
  plugins: [],
} satisfies Config
