# UBO Structuring Tool — Meydan Free Zone (Compliance)

## What this is
An in-house web tool for the Compliance department at Meydan Free Zone (MFZ). A compliance agent enters a company's ownership structure (who owns what %), selects a UBO threshold, clicks **Calculate**, and gets back:
1. An **ownership chart** (visual diagram) — THE core requirement
2. An **Ownership Paths table**
3. A **Summary** listing the UBOs
4. An **Intermediary Companies** list (for screening in the ERP)

Each output block is downloadable separately as **PNG and PDF**.

The reference we are replicating (and improving) is Lexflag's free "Beneficial Ownership / UBO calculator". Regulatory driver: UAE Ministry of Economy (MOE) UBO rules. This is Phase 1: a clean, deterministic tool — no AI, no backend, no login.

## Tech stack (decided — do not change without asking)
- **Vite + React + TypeScript**, single-page app, fully client-side
- **Tailwind CSS** for styling
- **dagre** for automatic top-down graph layout; render nodes/edges as **SVG** ourselves (no heavy graph library)
- **html-to-image** for PNG export, **jsPDF** for PDF export
- No backend, no database, no external API calls
- Must build to static files (`npm run build` → `dist/`) so it can be hosted on any Meydan URL later

## Domain rules (the calculation engine — get these exactly right)

### Entities
- Every named party is a **node**, typed as `individual` or `company`.
- A name appearing on both sides of links (e.g. "XYZ Ltd" owns ABC and is also owned by Husain) is ONE node. Match names case-insensitively and trimmed. The type is set once per node (a company that owns things is still a company). Do NOT repeat the reference tool's bug where XYZ Ltd rendered with a person icon.
- The **target entity** is the company being analysed: the node that owns nothing (a root/sink). If there are several, let the user pick one from a dropdown; default to the first.

### Ownership links
- One link = `owner` owns `percent` % of `entity`. Percent is 0–100, up to 2 decimals.
- Soft cap: **50 links**. Engine must handle arbitrary chain depth. Detect **circular ownership** and show a clear error rather than looping forever.

### Effective ownership
- **Direct**: taken at face value.
- **Indirect**: multiply down the chain. Husain 50% of XYZ, XYZ 75% of ABC → Husain effectively holds 50% × 75% = **37.50%** of ABC.
- **Aggregation**: if the same ultimate owner reaches the target through multiple paths, **sum** them. 20% via one company + 5% via another = 25% → qualifies. Show each path in the table AND the aggregated total in the summary.
- **Qualifying rule**: effective % **≥ threshold** qualifies (25.00% at a 25% threshold qualifies). Status label: `UBO` if ≥ threshold, `Below threshold` otherwise. Do not use the word "Exceeds" — it is wrong at exactly the threshold.
- Display percentages to 2 decimals.

### Threshold (exactly two options)
- **25% — Standard (Low / Medium risk)** — default
- **10% — High risk (Enhanced due diligence)**
- The same threshold applies to both UBOs and intermediary companies.

### Control-based UBO (manual flag)
- A UBO can also be established by **control** (e.g. via documents), regardless of ownership %.
- Each individual row/node must have a **"Controller" checkbox**. A flagged person is a UBO even at 0% ownership.
- Show them in the Summary with basis = `Control` (or `Ownership + Control` if they also meet the %). The chart should mark controllers distinctly (e.g. a small "Control" badge on the node).

### Validation (must block calculation)
- For every **company** that has owners entered, the owners' percentages must total **exactly 100%** (allow ±0.01 rounding). If not, show an inline error naming the company and the current total (e.g. "XYZ Ltd: owners total 50% — 50% missing") and **disable Calculate** until fixed.
- Empty names, percent ≤ 0 or > 100, a party owning itself, duplicate identical links → inline errors.
- Individuals cannot be owned by anyone (an individual cannot appear as an `entity`).

### Intermediary Companies (for ERP screening)
- An intermediary is any **company** node that is not the target and sits on a path to the target.
- List every intermediary whose **effective % of the target ≥ threshold**, with its effective %.
- Compliance copies these names into the ERP for sanctions/PEP/adverse-media screening, so include a **"Copy names"** button that copies one name per line.

## UI (Phase 1 — neutral styling; Meydan branding applied later)
Single page, in this order:

1. **Header** — "UBO Structuring Tool", subtitle "Meydan Free Zone — Compliance".
2. **Ownership Links builder** — one row per link: `[Owner name] [Individual|Company toggle] owns [ %] % of [Entity name] [Company]` + Controller checkbox (only when owner is Individual) + remove button. "Add Ownership Link" button. Live per-company totals shown under the builder (green when 100%, red otherwise).
3. **Threshold** — the two-option select.
4. **Target entity** — auto-detected, dropdown if ambiguous.
5. **Calculate Ownership** button (disabled with reasons while validation fails). "Start Over" button that clears everything.
6. **Results** (appear below after calculate):
   - **Ownership Chart** — top-down: individuals at the top, companies below, target at the bottom. Person icon for individuals, building icon for companies. Edge labels show %. UBO nodes highlighted; controller badge where relevant. Download PNG / Download PDF buttons on this block.
   - **Ownership Paths** table — columns: Ultimate Owner · Path (A → B → C) · Target Entity · Effective % · Status. Download PNG / PDF buttons.
   - **Summary** — banner "N beneficial owner(s) identified at the X% threshold", then one line per UBO: "Husain holds 37.50% of ABC LTD (Ownership)" / "(Control)". Note line: "Considered N entities and M ownership paths. Multiple paths for the same owner are aggregated." Download PNG / PDF buttons.
   - **Intermediary Companies (for screening)** — table: Company · Effective % of target. Copy names button. Download PNG / PDF buttons.
7. Footer note: "For internal compliance use. Informational only — does not constitute legal advice."

Downloads: filename pattern `UBO_<TargetEntity>_<Chart|Paths|Summary|Intermediaries>_<YYYY-MM-DD>.png|pdf`. PDF should contain the block at readable size on A4 landscape for the chart, portrait for tables.

## Sample data (use as the built-in "Load example" and for tests)
```
Masood (individual)  owns 25% of ABC LTD
XYZ Ltd (company)    owns 75% of ABC LTD
Husain (individual)  owns 50% of XYZ Ltd
Dinesh (individual)  owns 50% of XYZ Ltd
Threshold 25% → target ABC LTD
```
Expected: Masood 25.00% UBO · Husain 37.50% UBO · Dinesh 37.50% UBO · 5 entities · 3 paths · Intermediary: XYZ Ltd 75.00%.

Second test (aggregation): add `Masood owns 10% of XYZ Ltd` and change Husain/Dinesh to 45% each. Expected Masood = 25% + (10% × 75%) = **32.50%** via two paths.

Third test (validation): remove Dinesh's row → Calculate must be blocked with "XYZ Ltd: owners total 50%".

## Engineering conventions
- Keep the calculation engine in a pure module `src/engine/` with unit tests (Vitest). No React in the engine.
- Components in `src/components/`. Keep files small and readable — this will be handed to other developers.
- TypeScript strict. No `any`.
- Run `npm run build` and `npm test` before saying a task is done.
- Commit after each working milestone with a clear message.

## Out of scope for now
- Meydan branding (colours, logo, fonts) — later phase, keep styling neutral but clean
- Saving/loading structures, user accounts, backend
- Drag-and-drop editing of the chart
- ERP integration (separate IT workstream — the tool only needs to output PNG/PDF the ERP can accept)
