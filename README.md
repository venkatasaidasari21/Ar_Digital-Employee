# VoxOS

VoxOS is a voice-first AI operating system. Speak or type a goal and VoxOS plans it, delegates work to background agents, retries failures, gates only decisions that need a human, and persists memory across runs.

## Run locally

Requirements: [Bun](https://bun.sh/).

```bash
bun install
bun run serve.ts
```

Or build and serve the published app:

```bash
bun run publish
```

The app runs with no API keys by using its built-in default planner.

## Architecture

The codebase is organized as a strict layering from the client UI down to
persistence. New engineers should follow this map to find where a concern lives.

```
client / UI ──► orchestrator ──► model providers ──► store / persistence
```

- **Client / UI** — `src/routes/`, `src/components/`, and `src/api.ts`. The
  voice-first UI (speak or type a goal) and a thin `src/api.ts` client that
  calls the `/api/*` routes. `src/types.ts` holds the shared domain types the
  UI and server both rely on.
- **HTTP / API layer** — `src/server/api.ts` contains the raw `Request` →
  `Response` handler for all `/api/*` routes (goals, runs, provider, health).
  `serve.ts` only bootstraps the Bun server and delegates requests to it, so the
  routes are testable without starting a server. The handler maps typed
  `AppError`s (see `src/types.ts`) to status codes; a small `src/server/logger.ts`
  emits structured JSON logs.
- **Orchestrator** — `src/server/orchestrator/core.ts` is the brain: it turns a
  goal into a plan of tasks, runs them in the background, retries failures, and
  gates only human decisions (approve/revise). `store.ts` is its persistence
  boundary.
- **Model providers** — `src/server/providers/` is a pluggable `LLMProvider`
  interface with OpenAI and Gemini adapters (`openai.ts`, `gemini.ts`) plus a
  built-in default planner, so the loop runs with no API keys.
  `provider.ts` selects the active provider from environment variables.
- **Store / persistence** — `src/server/orchestrator/store.ts` persists runs as
  JSON on disk (keyed by run id) behind a small async API (`getRun`, `saveRun`,
  `allRuns`). The orchestrator never touches storage directly.

`src/server/api.ts`, `src/server/logger.ts`, and the provider layer sit under
`src/server/` and are server-only — keep them free of browser/runtime imports.

## Model providers

VoxOS includes a model-provider layer with a built-in planner and optional OpenAI and Gemini adapters. Configure the provider with environment variables (copy `.env.example` to `.env` for local use):

- `VOXOS_PROVIDER=default|openai|gemini` (or `openai` / `gemini`)
- `OPENAI_API_KEY` or `GEMINI_API_KEY`
- Optional `OPENAI_MODEL`, `GEMINI_MODEL`
- Optional `OPENAI_BASE_URL`, `GEMINI_BASE_URL` endpoint overrides

No provider keys are required to run the app.

## Tests & CI

Run the test suite (orchestrator, providers, API handler, health, and logger):

```bash
bun test
```

The shared CI workflow (`.github/workflows/ci.yml`) runs on every push and pull
request and enforces, in order:

1. `bun install --frozen-lockfile` — clean install from the committed lockfile
2. `bun run build` — production build
3. `bunx tsc --noEmit` — type-check (run after build so the generated route tree is present)
4. `bun test` — full test suite
5. `bunx prettier --check .` — formatting
6. `bun audit --production` — production dependency-vulnerability gate

Before pushing, you can run the same checks locally:

```bash
bun run build
bunx tsc --noEmit
bun test
bunx prettier --check .
```

Dependabot is configured (`.github/dependabot.yml`) and automatically files pull
requests for dependency updates, plus dependency-security audit updates.

## Live demo

https://b5933fdab1aaacd95f34fd82f605fb86.ctonew.app
