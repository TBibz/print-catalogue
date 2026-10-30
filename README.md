# Print Catalogue

A private web app for our household 3D-printing setup: a catalogue Dad can
browse and (later) request models from, and print management for Tomi.

The full plan is in [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md).

Built with Next.js (App Router, TypeScript, Tailwind) and Supabase (Postgres +
Auth), hosted on Vercel.

## Running it locally

1. Copy `.env.local.example` to `.env.local` and fill in the Supabase values.
2. `npm install`
3. `npm run dev`, then open http://localhost:4000

## Database

SQL files live in `supabase/migrations/` and are run by hand, in number order,
in the Supabase SQL Editor. `supabase/snippets/` has one-off helpers (such as
making an account admin).

## Importing the catalogue

```
npm run import:catalogue -- --dry-run   # preview, writes nothing
npm run import:catalogue                # import data/catalogue.csv
```

> **Initial setup only.** Once models are edited in the app, don't re-run the
> import: it would overwrite each model's name, category, availability and NEW
> badge with the values from the CSV.
