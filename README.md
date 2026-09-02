# UBO Structuring Tool

In-house web tool for Meydan Free Zone Compliance: enter a company's ownership structure, pick a UBO threshold, and get an ownership chart, ownership paths, a UBO summary, and the intermediary companies to screen — each exportable as PNG and PDF.

## Prerequisites

- **Node 22 LTS or newer.** Node 21 is end-of-life and unsupported upstream; it happens to run this project, but don't build on it.
- npm 10 or newer (ships with Node 22).

The dependencies are deliberately pinned to React 18 / Vite 6 / TypeScript 5.6 and stay there regardless of which Node version you run.

## Setup

```
npm install
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server on http://localhost:5173 |
| `npm run build` | Type-check and build static files into `dist/` |
| `npm run preview` | Serve the built `dist/` locally to check the production build |
| `npm test` | Run the engine unit tests once (Vitest) |
| `npm run test:watch` | Run the tests in watch mode |

`dist/` is fully static and path-agnostic — it can be dropped on any Meydan URL.

## Layout

- `src/engine/` — pure calculation engine (no React), unit-tested
- `src/components/` — UI components
- `CLAUDE.md` — the functional spec
