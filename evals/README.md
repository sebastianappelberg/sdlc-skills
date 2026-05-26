# sdlc-skills evals

Reproducible eval harness for skills in `plugins/sdlc-skills/`. V1 covers `brainstorming`.

## Setup

```sh
pnpm install
pi /login anthropic   # for default models
```

## Run

```sh
pnpm smoke                                                  # 1-sample smoke test
pnpm eval -- run --skill brainstorming                      # default K=1, all scenarios
pnpm eval -- run --skill brainstorming --samples 5          # K=5
pnpm eval -- run --skill brainstorming --scenarios small-cli,ambiguous-fix
pnpm eval -- compare results/<run-A> results/<run-B>        # absolute deltas
pnpm eval -- compare results/<run-A> results/<run-B> --pairwise
```

Results land in `results/<YYYY-MM-DDTHH-MM-SS-<short-sha>>/`. The directory is
gitignored; only `.gitkeep` is committed.

## Layout

- `config.yaml` — default model triple (agent/persona/judge).
- `scenarios/<skill>/manifest.yaml` — declared scenarios with sha256 content hashes.
- `scenarios/<skill>/*.yaml` — one persona+intent per file.
- `src/run.ts` — CLI.

## Tests

```sh
pnpm test         # schema + stats unit tests
pnpm typecheck
```
