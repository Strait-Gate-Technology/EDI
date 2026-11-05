# EDI — Equivalent Disposable Income

Compare life/work scenarios by their **EDI / hour**:

```
EDI       = net income − scenario-specific expenses
EDI/hour  = EDI ÷ irreducible hours (work, commute, prep, …)
```

## Run

```bash
npm install
npm run dev      # http://localhost:5178
```

## How it works

- **Library (left):** design Income, Expense and Hours cards. Each card has a value + frequency;
  the (+) menu adds **Variables** and **Equations**. Any field accepts `=formula`
  (e.g. `=Fuel Price * Distance / 100 * Efficiency`, `[Name]` for odd names, `12%`,
  `min/max/round/abs/floor/ceil/sqrt/pow`). Circular references are detected and flagged.
- **Scenarios (right):** `+ New Scenario`, then drag cards by their grip into the matching zone
  (type-enforced). Dropped cards are **linked** copies: parent edits flow through. Click the chain
  icon to unlink and customise; re-drag from the library to get a linked copy again.
- **Tax:** pick a nation (Canada / U.S.) and province / state with the flag pills in the top bar.
  Every scenario follows that default; change it in the scenario's *Incomes* zone and the scenario
  gets a suffix such as "(Ontario 🏳)" or "(U.S. 🏳, Maine 🏳)". Setting it back to the default
  re-links it and drops the suffix. Income marked *Taxable* is taxed with 2026 federal + provincial /
  state brackets (see *Tax data* below); the *Income tax* card shows the breakdown.
- **Analysis:** side-by-side columns (1–6). Drag a column onto another to swap, onto the pool or the
  top rack to take it off stage; drag scenarios from the top rack or pool into a column.
- Everything persists in `localStorage`; the ☰ menu exports/imports JSON and has
  *Reduce visual effects* for slower machines.

Source: `src/formula.ts` (parser), `src/calc.ts` (card & scenario maths), `src/store.ts` (state),
`src/components/*` (UI), `src/styles.css` (glass + per-component hue cycling).

## Deploy (Vercel)

The app is a static Vite build; `vercel.json` pins the settings.

1. In Vercel: **Add New → Project → Import** `Strait-Gate-Technology/EDI`.
2. Leave the detected settings (Framework: Vite, build `npm run build`, output `dist`) and **Deploy**.

Every push to `master` then redeploys production, and other branches/PRs get preview URLs.
Requires Node ≥ 22.12 (Vercel's default Node 22/24 is fine). Data lives in each visitor's
browser (`localStorage`), so there is no backend or environment variables to configure.

## Tax data

`src/tax/tax-data.json` holds the 2026 brackets, compiled on 2026-11-05 from:

- **Canada federal & provinces/territories (except QC):** CRA *T4127 Payroll Deductions Formulas*,
  Jan 1 and Jul 1 2026 editions (annual, non-prorated values).
- **Quebec:** Revenu Québec *Income tax rates* (brackets). The 2026 basic personal amount is
  derived from the 2025 amount and the 2026 indexation rate, and is marked unverified.
- **U.S. federal:** IRS IR-2025-103 (tax year 2026).
- **U.S. states:** Tax Foundation, *State Individual Income Tax Rates and Brackets, as of January 1, 2026*.

Assumptions: single filer, employment income, basic/standard credits and deductions only; Ontario
surtax, Health Premium and low-income reduction, BC tax reduction and the Quebec abatement are
included; payroll contributions (CPP/EI, FICA) and local taxes are not.

**Quarterly re-check.** `.github/workflows/tax-source-check.yml` runs
`scripts/check-tax-sources.mjs` on Jan 1, Apr 1, Jul 1 and Oct 1 (or manually from the Actions
tab). It confirms every shipped threshold still appears in the official sources, watches for a
newer edition / tax year, and commits the result to `public/tax-status.json`, which redeploys the
site. The app shows a small dismissible warning if that check failed, if it hasn't run for over
100 days, or once the calendar year passes the data year. The script does not rewrite the brackets
itself: when it flags a problem, update `tax-data.json` and the `expect` lists, then re-run it.
Revenu Québec refuses automated requests, so Quebec is re-checked by hand.

## Credits

Flag images in `public/flags/` are rasterised from Wikimedia Commons SVGs (mostly public domain).
