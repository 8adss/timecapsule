# TimeCapsule

[![CI](https://github.com/8adss/timecapsule/actions/workflows/ci.yml/badge.svg)](https://github.com/8adss/timecapsule/actions/workflows/ci.yml)

> Write to your future self — then wait for the reply.

Seal a decision you're making today into a **time capsule** and set a date for it to open. Until then, keep the promise with a task list; streaks, levels, and achievement badges record the road you walked.

**Local-first** — no account, no server database. Everything lives in your own browser. Only **Chat** goes online, using your own API key.

[中文](README.md) | **English**

---

## Features

| | |
| --- | --- |
| **Time capsules** | Write a message to your future self and pick an opening date. When the date arrives it **opens by itself** — not a reminder to go click something, but the letter actually appearing |
| **Task list** | Create, edit, and abandon tasks organised by category and due date. Overdue tasks are flagged automatically |
| **Knowledge base** | Import what you've written — self-introductions, journals, notes — and edit, search, or sort it. It is where a persona gets its material |
| **Persona** | Turn your knowledge base into "who you were at a point in time". The profile and speaking style are written by hand for now, and can be generated once a model is connected. A capsule holds the moment you wrote something; a persona holds who you were then |
| **Chat** | Talk with your past self (an opened capsule) or with who you were then (a persona). A persona **recalls relevant passages** from the documents it references and treats them as things it remembers, so it answers from what you actually lived through. **The only online feature**, using your own API key |
| **Streaks** | Recomputed from your completion history, so there's nothing to maintain. Your streak doesn't reset just because you haven't finished anything *yet today* |
| **Levels** | One level per five completed tasks, also derived from your history |
| **Achievements** | Milestones at 1/3/5/10/20/50 tasks, 1/2/3/5/10 capsules, and 2/3/7/14/30/100 streak days |
| **Export & import** | Export everything to a single JSON file, import it to restore on another device. Merge or replace, with an automatic snapshot you can roll back |
| **Bilingual UI** | Chinese and English, switchable from the settings page. Adding a language takes one JSON file |
| **Local-first** | No account, no analytics, no server database. Tasks, capsules, knowledge and personas all live in your own browser. **Only Chat goes online** — see below |

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

## Chat and AI

Chat is **the only feature that goes online**, and it uses the user's own API key (set it under *Settings → AI setup*).

- **The key lives only in your browser.** It travels with each request as a header; the server neither stores nor logs it.
  It is also **never written into a backup file** — backups get copied around and handed to other people, and a secret inside one is a trap
- Requests go to the **same-origin `/api/ai`** (a Cloudflare Pages Function, see `frontend/functions/api/ai.js`), which forwards them to the provider. Same origin, so no CORS problem
- The browser sends a **provider id**, never a URL: which host to call is decided by the whitelist in `src/domain/ai.js`.
  That is why "point the endpoint at an internal address and make their function fetch it" is not a thing here
- DeepSeek / Volcengine Ark (Doubao) / Zhipu GLM / Kimi / OpenAI / OpenRouter, all OpenAI-compatible.
  "Test connection" in settings fetches the models your key can actually use

No wrangler needed for local development: `vite.config.js` has a dev middleware that **imports the very same function**
used in production, so both run identical code and **you can test the whole thing locally with a real key**.

> Deployment note: once a project has a `functions/` directory, Cloudflare Pages **invokes a Function for every request**,
> which starts burning the 100k/day Functions quota on static assets too. So `scripts/postbuild.mjs` writes a
> `_routes.json` allowing only `/api/*` — everything else stays on the unmetered static tier.

## Project structure

```
frontend/          The current app — the only directory that gets built
  src/
    domain/        Pure business logic (task state transitions, capsule opening rules,
                   achievement milestones, streaks and levels, backup validation,
                   chat prompts and memory recall). Side-effect free, unit-testable
                   in plain Node
    storage/       Storage adapters. IndexedDB and in-memory implementations behind
                   a replaceable interface — the WeChat Mini Program port only needs
                   a wx.setStorage adapter, with no business logic rewritten
    repository/    Orchestration. Holds the write lock and persists several
                   collections in a single transaction
    api/           The only boundary the views depend on; also the only two places
                   that make network requests (api/ai.js and api/chat.js)
    views/         Pages      layouts/  Layouts      components/  Components
  functions/       The Cloudflare Pages Function that forwards chat to the provider
                   (the only server-side code, and it stores nothing)
  scripts/         Post-build step (SPA fallback files and _routes.json)

legacy/            The original Spring Boot + MySQL implementation. **Not built**,
                   kept for reference and for the planned AI features.
                   See legacy/README.md
```

## Stack

Vue 3 · Vite · Pinia · Vue Router · Element Plus · idb-keyval · Vitest ·
Cloudflare Pages Functions (only to forward chat requests)

No backend service, no database, no accounts. The only server-side code is that
small forwarding function, and it stores nothing.

## Design decisions worth knowing

- **Time is stored as `yyyy-MM-dd HH:mm:ss` strings**, not timestamps. The format is fixed-width and zero-padded, so lexicographic order *is* chronological order — comparisons and sorting work directly, with no timezone traps.
- **Stats are recomputed, never accumulated.** Delete a completed task and your streak corrects itself; an accumulator would drift forever.
- **Writes are serialised.** Every repository operation is "read the collection → mutate in memory → write it all back", so two tabs would silently overwrite each other. Web Locks provide the mutex.
- **Related collections are written together.** There are no database transactions here; `writeMany` using a single IndexedDB transaction is the closest equivalent, and it prevents half-applied states like "the task completed but no achievement was granted".
- **Element Plus components are imported on demand, styles are not.** The theme file contains roughly thirty `.el-*` refinements at the *same* specificity as the library's own rules, and wins purely by load order. On-demand styles get pushed into lazy chunks and land after the theme, silently reverting the UI to the default blue. See the comments at the top of `frontend/vite.config.js`.
- **Chat goes through a same-origin relay rather than calling providers from the browser.** None of the providers send CORS headers, so a direct call is always blocked; a same-origin function removes that problem *and* removes request forgery — the browser sends a provider **id**, and the server's whitelist decides the address.
- **The prompts and the memory recall are pure functions.** They used to live in Spring services, where verifying them meant booting a whole backend. Once they moved into `domain/chat.js`, every constraint (the 150-word cap, "do not degrade into a generic assistant", empathise first when the user sounds frustrated…) became a plain Node assertion.

## Roadmap

- **v2**: one-click persona distillation — reading your knowledge base into a profile and a speaking style (both are hand-written today; everything else chat needs is already in place: key setup, material recall, prompts)
- **v2**: a WeChat Mini Program client, reusing the same storage adapter interface
- **Streaming output**: replies are non-streaming today (you see "who you were then is remembering…" while waiting). SSE would mean streaming through the function and a different request path in the browser
- **Finishing i18n**: the interface and the common validation errors are bilingual. What's left is the per-field diagnostic output from `domain/backup.js` when an import file is malformed (messages like `data.tasks[0].title 应为字符串`), which is still Chinese only. Fixing it means turning the error collection into a structured issue list — see [CONTRIBUTING.md](CONTRIBUTING.md)
- An external storage adapter (self-hosted server or object storage sync). The contract is defined in `frontend/src/storage/adapters/remote.js`
- More interface languages — translations welcome, one JSON file each

## Contributing

Issues and pull requests are welcome. Before submitting, make sure both of these pass:

```bash
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) — it covers eight conventions that will build successfully but break at runtime if you violate them.

## License

[MIT](LICENSE)
