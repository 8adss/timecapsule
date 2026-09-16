# TimeCapsule

[![CI](https://github.com/8adss/timecapsule/actions/workflows/ci.yml/badge.svg)](https://github.com/8adss/timecapsule/actions/workflows/ci.yml)

> Write to your future self — then wait for the reply.

Seal a decision you're making today into a **time capsule** and set a date for it to open. Until then, keep the promise with a task list; streaks, levels, and achievement badges record the road you walked.

**Local-first** — no account, no server. Everything lives in your own browser, and it works fully offline.

[中文](README.md) | **English**

---

## Features

| | |
| --- | --- |
| **Time capsules** | Write a message to your future self and pick an opening date. When the date arrives it **opens by itself** — not a reminder to go click something, but the letter actually appearing |
| **Task list** | Create, edit, and abandon tasks organised by category and due date. Overdue tasks are flagged automatically |
| **Knowledge base** | Import what you've written — self-introductions, journals, notes — and edit, search, or sort it. It is where a persona gets its material |
| **Persona** | Turn your knowledge base into "who you were at a point in time". The profile and speaking style are written by hand for now, and can be generated once a model is connected. A capsule holds the moment you wrote something; a persona holds who you were then |
| **Streaks** | Recomputed from your completion history, so there's nothing to maintain. Your streak doesn't reset just because you haven't finished anything *yet today* |
| **Levels** | One level per five completed tasks, also derived from your history |
| **Achievements** | Milestones at 1/3/5/10/20/50 tasks, 1/2/3/5/10 capsules, and 2/3/7/14/30/100 streak days |
| **Export & import** | Export everything to a single JSON file, import it to restore on another device. Merge or replace, with an automatic snapshot you can roll back |
| **Bilingual UI** | Chinese and English, switchable from the settings page. Adding a language takes one JSON file |
| **Fully offline** | No network requests, no analytics, no account |

## Getting started

Node.js 18 or newer.

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:4113>.

Build the static bundle:

```bash
npm run build     # outputs to frontend/dist — plain static files, host anywhere
npm run preview   # preview the production build locally
```

Run the tests:

```bash
npm test
```

## Where your data lives

**Browser IndexedDB**, database name `timecapsule`. It never goes over the network and no other copy exists.

That comes with a cost you have to remember: **clearing browser data, using private browsing, or switching devices will make it disappear.**
So the export under *Settings → Backup & restore* isn't optional — it's the only insurance. Export regularly.

Imports are fully validated; a single invalid field rejects the entire file, so you never end up with half-restored data.
A snapshot is taken automatically before every import and wipe, and can be rolled back one step.

## Project structure

```
frontend/          The current app — the only directory that gets built
  src/
    domain/        Pure business logic (task state transitions, capsule opening rules,
                   achievement milestones, streaks and levels, backup validation).
                   Side-effect free, unit-testable in plain Node
    storage/       Storage adapters. IndexedDB and in-memory implementations behind
                   a replaceable interface — the WeChat Mini Program port only needs
                   a wx.setStorage adapter, with no business logic rewritten
    repository/    Orchestration. Holds the write lock and persists several
                   collections in a single transaction
    api/           The only boundary the views depend on; wiring up external
                   storage later stays inside this layer
    views/         Pages      layouts/  Layouts      components/  Components
  scripts/         Post-build step (SPA fallback files for static hosting)

legacy/            The original Spring Boot + MySQL implementation. **Not built**,
                   kept for reference and for the planned AI features.
                   See legacy/README.md
```

## Stack

Vue 3 · Vite · Pinia · Vue Router · Element Plus · idb-keyval · Vitest

No backend, no database, no server-side dependency.

## Design decisions worth knowing

- **Time is stored as `yyyy-MM-dd HH:mm:ss` strings**, not timestamps. The format is fixed-width and zero-padded, so lexicographic order *is* chronological order — comparisons and sorting work directly, with no timezone traps.
- **Stats are recomputed, never accumulated.** Delete a completed task and your streak corrects itself; an accumulator would drift forever.
- **Writes are serialised.** Every repository operation is "read the collection → mutate in memory → write it all back", so two tabs would silently overwrite each other. Web Locks provide the mutex.
- **Related collections are written together.** There are no database transactions here; `writeMany` using a single IndexedDB transaction is the closest equivalent, and it prevents half-applied states like "the task completed but no achievement was granted".
- **Element Plus components are imported on demand, styles are not.** The theme file contains roughly thirty `.el-*` refinements at the *same* specificity as the library's own rules, and wins purely by load order. On-demand styles get pushed into lazy chunks and land after the theme, silently reverting the UI to the default blue. See the comments at the top of `frontend/vite.config.js`.

## Roadmap

- **v2**: bring back the AI features — talking to your past self, and one-click persona distillation (the page and the data model are already in place; all that's missing is reading your knowledge base into a profile and a speaking style). The plan is to have **users supply their own API key**, so no key ever has to sit on a server
- **v2**: a WeChat Mini Program client, reusing the same storage adapter interface
- **Finishing i18n**: the interface and the common validation errors are bilingual. What's left is the per-field diagnostic output from `domain/backup.js` when an import file is malformed (messages like `data.tasks[0].title 应为字符串`), which is still Chinese only. Fixing it means turning the error collection into a structured issue list — see [CONTRIBUTING.md](CONTRIBUTING.md)
- An external storage adapter (self-hosted server or object storage sync). The contract is defined in `frontend/src/storage/adapters/remote.js`
- More interface languages — translations welcome, one JSON file each

## Contributing

Issues and pull requests are welcome. Before submitting, make sure both of these pass:

```bash
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) — it covers five conventions that will build successfully but break at runtime if you violate them.

## License

[MIT](LICENSE)
