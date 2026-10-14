# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hytteboka: a booking site for the company cabin of Havbris AS (a fictional customer, Gro), with lottery draws for the weeks everyone wants (Easter, winter break). It is the starting point of the Miles course «Agentisk koding»: the `start` branch is the first version; `main` holds a worked run-through, one commit per customer request. Runs locally with one command, no cloud, no login. Not meant for real use.

`ANTAKELSER.md` records every assumption made on the customer's behalf (what a week is, draw rules, no login, etc.). Read it before treating behaviour as a bug, and update it when a customer answer changes an assumption.

## Commands

Node.js >= 20, ES modules, **no dependencies** (keep it that way unless asked). Use `pnpm` for scripts.

- `pnpm start` — server on http://localhost:44210 (bound to 127.0.0.1). The book is stored in `data/hytteboka.json` (gitignored); delete it to start over from `firstState()`.
- `pnpm test` — runs `node --test` over `test/`.
- Single file: `node --test test/cabin.test.js`
- Single test by name: `node --test --test-name-pattern="Easter" test/weeks.test.js`

There is no build step, bundler or linter.

## Architecture

Request flow: `server.js` → `createApp` (`src/app.js`) → a rule in `src/cabin.js` via `store.change` → redirect, or a page from `src/pages.js`.

- **`src/cabin.js` — the rules.** All state is one object `{ bookings: { [week]: { name, at } }, draws: { [week]: { label, weeks, entries } } }`. Each rule (`book`, `cancel`, `enter`, `withdraw`, `drawWinner`, `markDraw`, `unmarkDraw`) takes `(state, wish)`, mutates state and returns `{ ok: true }`, or leaves it and returns `{ ok: false, status, message }` with a Norwegian message for the user. A draw is kept under its first week and covers `weeks` weeks in a row (1 or 2; missing means 1); the winner gets a booking on each, and `calendar` shows it as one entry. A draw is "done" when its first week has a booking — that booking is the winner.
- **`src/store.js`** — one JSON file, loaded at start. `change(rule, wish)` runs the rule on a `structuredClone` and only keeps/writes it if `ok`. Writes go to `<file>.ny` then rename. Correctness relies on rules being synchronous in a single process.
- **`src/weeks.js`** — week IDs like `"2027-W08"` (sort as text). A cabin week runs **Friday 12:00 to Friday 12:00** and is named after the ISO week its weekdays fall in; Easter week starts on Good Friday. Dates are held as midnight UTC; "now" is interpreted in Europe/Oslo. All date formatting (Norwegian) lives here.
- **`src/app.js`** — routing by `pathname` with regexes. GET renders pages and serves the fixed list in `FILES` from `public/`. POST is a form: successful changes answer 303 to the page showing the result; refused ones re-render that page with the message and the rule's status. Identity is just the `navn` cookie (no login). Cross-site POSTs are rejected via `Sec-Fetch-Site`. Strict CSP: no inline scripts or styles — put browser code in `public/` and add it to `FILES`.
  The draw POST (`/trekning/:week/trekk`) also answers JSON when `Accept: application/json`, used by the draw show.
- **`src/html.js` / `src/pages.js`** — server-rendered HTML via the `html` tagged template, which escapes every interpolated value unless it is itself `html` output. Never build markup by string concatenation.
- **`public/`** — progressive enhancement only. Every form must work as a plain POST without JavaScript. `trekning.js` intercepts the draw form, fetches the result and animates it; `hopp.js` holds the pure animation plan (`planHops`) so it can be unit-tested from Node. Respect `prefers-reduced-motion`.

`createApp({ store, now })` takes an injectable clock; tests pin it to Wednesday 14 October 2026 (week 42) and run a real HTTP server against a temp-dir store (`test/app.test.js`). Rule tests in `test/cabin.test.js` call rules directly on plain state.

## The customer's rules

These come from Gro and are not up for reinterpretation. If code, tests or copy disagree with them, the code is wrong.

- **A cabin week runs Friday to Friday, with handover at 12:00 on Friday.** Why: whoever arrives gets the whole weekend on the mountain, and whoever leaves gets their weekend at home. Those leaving are out by 12:00 so the cleaner has time before the next group arrives after work. So:
  - A Friday before 12:00 still belongs to the week that is leaving; from 12:00 it belongs to the week that is arriving (`currentWeek`).
  - A week is shown with both Fridays as its dates ("19.–26. februar"), never Monday–Sunday.
  - Week numbers follow the ISO week of the weekdays the stay covers, so "uke 8" is the winter-break week people mean.
  - Easter week starts on Good Friday, so it covers the Easter weekend and Easter Monday.
- **Easter is one trip of two weeks, and one winner gets both:** the week before Easter and Easter week, Friday before Palm Sunday to the Friday after Easter (2027: uke 12 og 13, 19. mars – 2. april). Why: nobody goes to the mountain for half an Easter. So the Easter draw is for two weeks, neither week can be booked on its own, and a winner who gives up one gives up both.

## Conventions

- UI text is Norwegian bokmål; code, identifiers and comments are English. Route paths are Norwegian (`/kontorsjef`, `/uker/:week/book|avbestill|meld-pa|meld-av`).
- Comments are short plain-language prose explaining *why*, often written from the user's point of view; test names read as sentences. Match that style.
- Names compare case-insensitively (`sameName`); max 60 chars for names, 40 for draw labels. Booking horizon is `HORIZON` = 52 weeks including the current one.
- The project agent `frontend-reviewer` (`.claude/agents/`) reviews changes to pages, `public/` and CSS for a11y, progressive enhancement and XSS.
