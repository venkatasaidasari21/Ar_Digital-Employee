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

## Model providers

VoxOS includes a model-provider layer with a built-in planner and optional OpenAI and Gemini adapters. Configure the provider with environment variables (copy `.env.example` to `.env` for local use):

- `VOXOS_PROVIDER=default|openai|gemini` (or `openai` / `gemini`)
- `OPENAI_API_KEY` or `GEMINI_API_KEY`
- Optional `OPENAI_MODEL`, `GEMINI_MODEL`
- Optional `OPENAI_BASE_URL`, `GEMINI_BASE_URL` endpoint overrides

No provider keys are required to run the app.

## Live demo

https://b5933fdab1aaacd95f34fd82f605fb86.ctonew.app
