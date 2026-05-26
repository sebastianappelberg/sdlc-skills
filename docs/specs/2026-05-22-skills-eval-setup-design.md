# Skills Eval Setup — Design

**Status:** design approved; pending spec-document review
**Date:** 2026-05-22
**Scope:** V1 covers the `brainstorming` skill end-to-end. The harness, scenarios format, results layout, and comparator are designed to generalize to `divergent-thinking` and `writing-plans` without structural changes.

## 1. Goal

Produce a reproducible, comparison-friendly signal for the question *"did this skill edit reliably improve outcomes?"*. The signal comes from running an agent through the skill on fixed scenarios, capturing the artifact it produces, and grading that artifact two ways: an absolute rubric and (between any two runs) pairwise preference.

Non-goals:

- Benchmarking models against each other. Provider/model choice is configurable and recorded, but the eval is about skills, not models.
- Unit-testing the prose of `SKILL.md`. Static linting may come later; out of scope here.
- Continuous deployment / CI gating. V1 is a local CLI; a CI hook can be added once the harness is stable.

## 2. Architecture

A standalone TypeScript package at `evals/` depending on `@earendil-works/pi-coding-agent`. Each invocation drives one or more **scenario runs**, where a run is a complete agent dialogue against a simulated user followed by a judge call.

```
┌────────────────────────────────────────────────────────────────┐
│  evals/run.ts (CLI)                                            │
│   --skill brainstorming  --scenarios all|name1,name2  --judge  │
└─────────────────────────────┬──────────────────────────────────┘
                              │ for each (scenario, sample)
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  ScenarioRunner                                                │
│   1. mkdtemp() → workspace                                     │
│   2. pi session: cwd=workspace, skills=this repo's skills      │
│   3. open turn: "/skill:brainstorming <persona.opening>"       │
│   4. loop: while !done(workspace) and turns < cap              │
│        agent reply ──► PersonaSimulator.next(...)              │
│        prompt(session, persona reply)                          │
│   5. capture transcript + spec file                            │
│   6. Judge.grade(spec, transcript, scenario)                   │
│   7. write results/<run-id>/<scenario>/<sample>/...            │
└────────────────────────────────────────────────────────────────┘

  ╔═ shared: AuthStorage.create() reads ~/.pi/agent/auth.json    ╗
  ╚══ subscription auth used by agent + persona + judge ═════════╝
```

Three pi-coding-agent sessions per sample, sharing one `AuthStorage`:

- **Agent session** — the system under test. Loads `sdlc-skills` via `DefaultResourceLoader.skillsOverride` pointing at `plugins/sdlc-skills/skills/`. Runs in a temp `cwd` so it writes `docs/specs/…` into an isolated workspace.
- **Persona session** — separate session with `noTools: "all"` and a system-prompt override containing the persona definition. Driven turn-by-turn from the agent's last assistant message.
- **Judge** — one-shot `session.prompt` with `noTools: "all"` plus a `submit_rubric` / `submit_pairwise` custom tool for structured output.

**Termination signal.** The runner polls the agent's temp workspace for `docs/specs/*.md` and inspects the agent's last assistant message for the brainstorming skill's terminal string ("Spec written to `<path>`"). When both are present, the persona answers "approved" once and the loop exits. A hard turn cap (default 20) prevents runaway loops.

The eval is read-only against this repo's source tree. It reads `SKILL.md` files via the resource loader and writes only inside `evals/results/<run-id>/` and the per-sample `mkdtemp` workspace.

## 3. Comparison & reliability

Three layers, all in V1.

**(a) Runs are versioned and addressable.** Every run gets a directory `evals/results/<run-id>/` where `<run-id>` = `YYYY-MM-DDTHH-MM-SS-<short-sha>` with `<short-sha>` = `git rev-parse --short HEAD` over `plugins/sdlc-skills/skills/`. `manifest.json` records skill commit, scenario-set hash, judge model, sample count, seeds.

**(b) K samples per scenario, mean + bootstrap CI.** The runner accepts `--samples K` (default `K=1` for fast feedback, `K=5` for "I'm about to merge this"). Each sample gets a different RNG seed passed to the persona simulator. The summary stores all K rubric scores per scenario. `compare <run-A> <run-B>` reports per-scenario delta with a bootstrap 95% CI (10k iterations); only deltas whose CI excludes zero are flagged "reliable" vs. "within noise".

**(c) Pairwise preference judge.** Takes two specs for the same scenario, order-randomized, and votes which is better — then repeats with order flipped to control position bias. Only counts as a real preference when both orders agree; otherwise tie. Aggregated across K samples per scenario and across scenarios into a win-rate with Wilson 95% CI.

A "reliable improvement" is a delta whose CI excludes zero across enough scenarios that a Bonferroni-corrected aggregate also clears zero. V1 ships without correction; we add it if false positives appear.

## 4. Components

### 4a. `ScenarioRunner`

Drives a single (scenario, sample) pair to completion and produces one result directory.

**Inputs:** `scenario` (parsed YAML), `sampleIndex`, `runDir`, `skillsBaseDir`, `authStorage`, `modelRegistry`.

**Behavior:**

1. `mkdtemp()` → `workspace`.
2. Build a `DefaultResourceLoader` with `skillsOverride` exposing only the skill under test plus any skills it explicitly references (e.g. `brainstorming` references `writing-plans`). Skipping unrelated skills keeps activation deterministic.
3. `createAgentSession({ cwd: workspace, resourceLoader, sessionManager: SessionManager.inMemory(), authStorage, modelRegistry, model: getModel(scenario.agent.provider, scenario.agent.id), thinkingLevel: scenario.agent.thinkingLevel })`.
4. `session.subscribe(...)` → append every event to `transcript[]`.
5. Send opening turn: `await session.prompt(\`/skill:brainstorming\n\n${scenario.persona.opening_message}\`)`.
6. Loop until termination or `turn >= scenario.turnCap`:
   - Read last assistant message from `session.agent.state.messages`.
   - `personaReply = await PersonaSimulator.next({ persona, agentMessage, history, seed: scenario.seed + sampleIndex })`.
   - If termination signal met before reply, send `"approved"` once and break.
   - Otherwise `await session.prompt(personaReply)`.
7. Capture spec file: glob `workspace/docs/specs/*.md` → expect exactly one. Record `spec.md` and `workspace-files.json` listing anything else the agent wrote.
8. Write `runDir/<scenario>/<sample>/{transcript.json, spec.md, workspace-files.json, run.json}` with `run.json` carrying timestamps, turn count, termination reason, status, and any errors.

**Failure modes encoded as result data, not exceptions:** `turn_cap`, `no_spec`, `multi_spec`, `agent_error`, `persona_error`. Each becomes a structured `status` we can chart.

### 4b. `PersonaSimulator`

`next({ persona, agentMessage, history, seed }) → Promise<string>`.

A fresh `createAgentSession` with `noTools: "all"` and a system prompt override containing the persona definition plus the rules:

- "You are the user, not the assistant. Reply naturally as the persona."
- "Never break character or comment on the meta-task."
- "If the agent presents a design and asks for approval, approve it if it matches your intent; push back if it doesn't."
- "If you don't know an answer, say 'I don't know' rather than guessing."
- "Output only your next reply — no prefixes, no quotes."

**Role mapping inside the persona session.** The persona session sees the agent's last assistant message as its `user` turn and produces an `assistant` turn that we extract as the persona reply. The system prompt makes this explicit: "the 'user' messages you receive are from an assistant talking to you; you reply as the persona." The seed varies the persona session's session-id; if pi-coding-agent doesn't expose a sampling seed, we put a `[sample:${index}]` token in the system prompt to perturb behavior without affecting semantics.

**Persona schema (per scenario YAML):**

```yaml
persona:
  role: "solo backend engineer"
  intent: "wants a small CLI that re-posts liked tweets to mastodon"
  hard_constraints:
    - "no database"
    - "must run as a single Go binary"
  soft_preferences:
    - "prefers fewer dependencies over fancy abstractions"
  knowledge_gaps:
    - "doesn't know which Mastodon library to use"
  opening_message: "I want to build a thing that mirrors my Twitter likes to Mastodon."
```

The persona is intentionally incomplete so we can see whether the brainstorming skill surfaces constraints via questioning.

### 4c. `Judge` (absolute rubric)

Pure function `grade({ spec, transcript, scenario }) → Promise<RubricResult>`.

Implemented as a pi-coding-agent session with `noTools: "all"` and a `submit_rubric` custom tool that forces JSON. Rubric for the brainstorming skill (V1):

| Criterion | Type | Weight |
|---|---|---|
| `spec_exists` | hard pass/fail | gate |
| `spec_path_correct` (`docs/specs/YYYY-MM-DD-*.md`) | hard pass/fail | gate |
| `no_placeholders` (no "TBD"/"TODO"/"fill in") | hard pass/fail | gate |
| `captures_purpose` | 1–5 | 1.0 |
| `captures_constraints` (incl. *unstated* ones surfaced via questioning) | 1–5 | 1.5 |
| `captures_success_criteria` | 1–5 | 1.0 |
| `architecture_section_appropriate` (right depth for complexity) | 1–5 | 1.0 |
| `decomposed_or_flagged` (large scope → flagged for decomposition) | 1–5 conditional | 1.0 when applicable |
| `asked_clarifying_questions` (judges transcript, not spec) | 1–5 | 0.5 |
| `respected_hard_gate` (didn't start coding) | hard pass/fail | gate |

Gates short-circuit: any gate fail → `{ status: "gate_failed", failed_gate: <name>, partial_scores: {...} }`. Otherwise a weighted average over 1–5 scores → headline `score`. The judge prompt includes the persona definition so it can check whether hard constraints were captured.

### 4d. `PairwiseJudge`

`pairwise({ specA, specB, transcriptA, transcriptB, scenario }) → Promise<{ winner: "A"|"B"|"tie", confidence: "low"|"med"|"high", reasoning: string }>`.

Same shape as the absolute judge but with a `submit_pairwise` tool.

**Pairing strategy:** sample-index-paired. For each scenario with K samples per side, the comparator constructs K pairs `(run-A.sample_i, run-B.sample_i)` and calls `pairwise` twice per pair with order swapped — `2K` calls per scenario. A pair counts as a "real" preference only when both order-swapped calls agree on the winner; otherwise it is recorded as tie. We deliberately do *not* do all K×K cross-pairs: it inflates the call budget quadratically and the additional pairs are not independent observations.

Per-scenario win-rate aggregates the K paired votes; the cross-scenario report aggregates per-scenario win-rates with a Wilson 95% CI over total scored pairs.

### 4e. `Comparator`

CLI: `npm run eval -- compare <run-A> <run-B> [--pairwise]`.

For each scenario present in both runs:

- **Absolute deltas:** `mean_B − mean_A` per criterion, with bootstrap 95% CI over K samples (resample with replacement, 10k iterations).
- **Gate-fail deltas:** count of gate failures per run.
- **Pairwise (if flag set):** run `PairwiseJudge` over the K sample-index-paired pairs per scenario (`2K` calls each with order swap); aggregate to per-scenario and cross-scenario win-rates with Wilson 95% CIs.

**Scenario-set drift check:** the comparator reads each run's `manifest.json` and refuses to aggregate scenarios whose content hash differs between runs. Those scenarios are listed as "set drift" and excluded from headline numbers; their individual rows are still printed. `--force` overrides.

**Output:** a markdown report to stdout and `evals/results/<run-B>/compare-vs-<run-A>.md`. Per-scenario rows color-coded by reliability ("reliable improvement" / "reliable regression" / "within noise"), one summary line per criterion.

### 4f. Scenarios (data, not code)

`evals/scenarios/brainstorming/*.yaml`. V1 set, 6 scenarios spanning failure modes the skill cares about:

1. `tiny-feature.yaml` — "add a verbose flag to this CLI". Tests anti-pattern resistance ("too simple to design").
2. `small-cli.yaml` — Twitter-likes-to-Mastodon CLI. Standard happy path.
3. `existing-codebase.yaml` — "improve performance of the search endpoint" (workspace seeded with a small repo stub). Tests "explore current structure before proposing changes".
4. `decomposable-platform.yaml` — "build a multi-tenant SaaS with chat, billing, analytics". Should be flagged as needing decomposition.
5. `ambiguous-fix.yaml` — "fix the report". Persona resists giving details until pressed. Tests clarifying-question quality.
6. `hard-constraints.yaml` — "build a thing" but persona has 4 hard constraints they only volunteer when asked. Tests whether the skill surfaces them.

Each scenario YAML carries: `id`, `persona`, `turnCap` (default 20), `seed`, optional per-role model overrides, optional `notes` for human reviewers. A separate `smoke.yaml` is used by the smoke test.

## 5. Provider-agnostic model handling

**Per-role, per-scenario model selection.** `evals/config.yaml` defines defaults; each scenario can override any slot:

```yaml
defaults:
  agent:   { provider: "anthropic", id: "claude-sonnet-4-6", thinkingLevel: "medium" }
  persona: { provider: "anthropic", id: "claude-haiku-4-5" }
  judge:   { provider: "anthropic", id: "claude-opus-4-7" }
```

A scenario can override `agent`, `persona`, or `judge` independently — e.g. `agent: { provider: "openai", id: "gpt-5" }` to evaluate how the brainstorming skill behaves on a GPT model.

**Auth stays single-source.** One `AuthStorage.create()` reads `~/.pi/agent/auth.json`, which can hold credentials for both Anthropic and OpenAI subscriptions after `pi /login` is run for each provider. The eval code does not branch on provider for auth; pi resolves the right credential per model at call time.

**Provider-specific options gated in one place.** `thinkingLevel` is Anthropic-only. An `applyProviderOptions(modelConfig)` helper applies it only when `provider === "anthropic"`, keeping the rest of the runner provider-agnostic.

**Structured output fallback.** The judge passes its tool and instructs the model to call it. If the model returns JSON in assistant text instead, a strict JSON-block parser extracts it. The per-sample `judgment.json` records `judgeOutputMode: "tool" | "text-fallback"` so we can spot providers where forcing isn't reliable.

**Comparator surfaces model identity.** `manifest.json` records the resolved `agent`/`persona`/`judge` triple. `compare A B` shows those triples in the header.

**Persona pinning to avoid drift.** When comparing two runs of the same scenario, persona model must match between runs. The comparator enforces this: scenarios with persona drift between runs are excluded from aggregates and flagged in the report.

**Agent ≠ judge default.** The defaults intentionally keep agent and judge in different families/checkpoints. The runner warns if a scenario sets `agent.id == judge.id` but does not refuse — sanity checks are legitimate.

## 6. Data flow & file layout

```
evals/
├── config.yaml                       # default agent/persona/judge models
├── package.json                      # @earendil-works/pi-coding-agent dep
├── tsconfig.json
├── src/
│   ├── run.ts                        # CLI entry: run, compare
│   ├── runner.ts                     # ScenarioRunner
│   ├── persona.ts                    # PersonaSimulator
│   ├── judge.ts                      # absolute rubric judge
│   ├── pairwise.ts                   # pairwise judge
│   ├── compare.ts                    # Comparator + bootstrap CI
│   ├── schema.ts                     # zod types for scenarios + results
│   └── auth.ts                       # provider preflight
├── scenarios/
│   └── brainstorming/
│       ├── manifest.yaml             # scenario IDs + content hashes
│       ├── tiny-feature.yaml
│       ├── small-cli.yaml
│       ├── existing-codebase.yaml
│       ├── decomposable-platform.yaml
│       ├── ambiguous-fix.yaml
│       ├── hard-constraints.yaml
│       └── smoke.yaml
└── results/
    └── <run-id>/                     # run-id = YYYY-MM-DDTHH-MM-SS-<short-sha>
        ├── manifest.json             # skill SHA, scenario-set hash, models, K, seeds
        ├── summary.json              # aggregated scores
        ├── compare-vs-<other>.md     # written by Comparator
        └── <scenario>/<sample>/
            ├── transcript.json       # all events from session.subscribe
            ├── spec.md               # captured spec file
            ├── workspace-files.json  # everything else the agent wrote
            ├── judgment.json         # rubric output
            └── run.json              # status, timings, turn count, errors
```

The agent's working dir is a `mkdtemp` outside the repo; only what we need is copied out. Scenarios reference skills under `plugins/sdlc-skills/skills/` via the resource loader — they are not copied.

## 7. Error handling

**Failures encoded as data.** Per-sample `run.json` has `status: "ok" | "gate_failed" | "turn_cap" | "no_spec" | "multi_spec" | "agent_error" | "persona_error" | "judge_error"` and optional `error: { kind, message, stack }`. Aggregation is status-aware: a `turn_cap` result contributes a `turn_cap` count but does not pollute the score mean.

**Hard-fail before any runs** (non-zero CLI exit):

1. Required providers in the scenario set are missing from `AuthStorage` — message: `run \`pi /login\` for <provider>`.
2. Scenario YAML fails schema validation.
3. `evals/results/<run-id>/` already exists (collision on the SHA-timestamp ID).

**Transient model failures** (rate limit, timeout) get one retry with 5s/20s backoff, then the status flips to the appropriate `*_error`.

## 8. Testing the eval

This is a tool for grading skills, not a shipped product, so we test only what would silently corrupt results:

1. **Schema test (unit).** `vitest` over `scenarios/**/*.yaml` confirming each parses against the zod schema.
2. **Smoke test (integration).** A single tiny scenario (`smoke.yaml`) run end-to-end against current `main`; assertion is "produced a non-null judgment with `status: ok` or `gate_failed`". Catches harness regressions. Run on eval-code changes via `npm run smoke`.
3. **Baseline snapshot.** First production run on `main` is committed as `evals/results/<baseline-run-id>/` so future PRs have something to compare against without re-running history.

The bootstrap function gets a trivial unit test with known-distribution inputs. The rubric, persona prompts, and comparator math are validated by reading actual run outputs.

## 9. Open questions / future work

- **Pairwise budget control.** For K=5 samples per scenario × 6 scenarios × two-way order = 60 pairwise judge calls per `compare --pairwise`. Tolerable on a subscription but worth measuring. May add `--pairwise-budget N` to cap total calls.
- **Persona realism knob.** Early runs may show persona being too cooperative or too verbose. If so, add a `stubbornness: low|med|high` field to the persona schema and corresponding system-prompt tuning.
- **Generalizing to `divergent-thinking` and `writing-plans`.** Each gets its own `evals/scenarios/<skill>/` and its own rubric, but the runner, persona, judge, and comparator should not need structural changes. `writing-plans` rubric will rely heavily on the "no placeholders" gate; `divergent-thinking` is the hard case (the skill's own exploration notes "no success signal" as a defect) — the rubric will likely have to focus on falsifiable success markers like "≥3 strategy-distinct option families" and "an anomaly the dominant frame can't explain".
- **CI integration.** Once a baseline exists and the harness is stable, a GitHub Action could run a reduced scenario set (K=2) on PRs that touch `plugins/sdlc-skills/skills/**` and post a `compare` summary as a PR comment.
- **Cost tracking.** Subscription auth makes per-run dollar cost opaque. The runner records token counts from `session.subscribe` events into `run.json` so we have at least a relative measure for capacity planning.
