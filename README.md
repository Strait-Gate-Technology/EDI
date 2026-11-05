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
- **Tax:** each scenario has an effective tax rate applied to income cards marked *Taxable*.
- **Analysis:** side-by-side columns (1–6). Swipe a column away to return it to the pool, drag/click
  pool scenarios in, drag a column title onto another to swap.
- Everything persists in `localStorage`; the ☰ menu exports/imports JSON.

Source: `src/formula.ts` (parser), `src/calc.ts` (card & scenario maths), `src/store.ts` (state),
`src/components/*` (UI), `src/styles.css` (glass + per-component hue cycling).
