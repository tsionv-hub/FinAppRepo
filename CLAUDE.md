# Finance Planner: notes for Claude

## Replies (owner's rule, every session)
After every actionable turn (one where you changed files, the sheet, GitHub, a deploy, or settings), end your normal reply with a section **"What I did, at a glance"**: a short numbered list, one line per action, in the order you did them. Skip it for turns that only answer a question.

## Project
- Mobile PWA, Vite + TypeScript (vanilla DOM). It reads and writes the user's own Google Sheet; there is no backend. Spec: `docs/SPEC.md`. Manuals: `docs/MANUAL.md` and `docs/MANUAL.he.md`.
- **Never put personal data in the repo:** no sheet IDs, names, emails, account numbers or real amounts, and no real fund numbers in code, tests or docs. Use made-up data only.
- The English and Hebrew strings live in `src/ui/i18n.ts`. `he` is typed against `en`, so every key needs both.

## Release flow
- Work on the session's `claude/...` branch, based on `beta`.
- Open a PR into **`beta`** and merge it yourself, with the real head SHA.
- Check Beta CI and the "Deploy to GitHub Pages" run, then tell the owner which version to look for (shown as `vX.Y.Z-beta`).
- The beta app is at `/FinAppRepo/beta/`. The stable app is at `/FinAppRepo/`, built from `main`.
- **"Promote"** means merge `beta` into `main`.
- Bump `package.json` `version` for every release.

## Checks before a PR
- `npx tsc --noEmit`
- `npx vitest run`
- Build with `VITE_FEEDBACK_EMAIL=feedback@example.com npx vite build`, then run `npx vite preview --port 4173`.
- With the preview running: `NODE_PATH=/opt/node22/lib/node_modules npx tsx tests/e2e/smoke.ts http://localhost:4173/ <outdir>`. Every line must be `ok`.
