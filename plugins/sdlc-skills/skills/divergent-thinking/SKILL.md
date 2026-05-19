---
name: divergent-thinking
description: "Use when agent needs broad SDLC design-space exploration from an existing design, spec, brainstorming output, architecture proposal, product workflow, implementation approach, refactor strategy, or early technical direction before committing to a plan. Trigger for requests to explore alternatives, expand options, challenge assumptions, generate multiple approaches, investigate problem framings, or avoid premature convergence in software, product, architecture, process, and engineering-design work."
---

# Divergent Thinking

Explore the useful design space before choosing an approach. Optimize for breadth, distinct frames, and decision-relevant tradeoffs. Treat strong creative output as novelty times usefulness times realization potential, but do not rank or choose a winner unless the user explicitly asks for convergence or decision support.

The most common input is an existing design artifact, not a pile of raw observations. Start by understanding that artifact, then widen the design space around it. Keep evaluation separate from generation.

Use this skill as a reasoning scaffold, not a checklist. Apply the moves that materially improve breadth for the problem at hand, skip moves that would add ritual without insight, and let stronger model judgment choose better decompositions, lenses, and synthesis strategies as capabilities improve.

## Flexible Process

Default to this order when it helps, but do not perform steps mechanically. Preserve the intent: understand the input design, widen the space, synthesize option families, and leave a useful next exploration.

1. Read the input design:
   - Extract the proposed design, goal, intended users, success criteria, constraints, non-goals, rationale, unresolved questions, and implied implementation direction.
   - Treat design statements as claims. Separate observed facts, explicit decisions, assumptions, preferences, and unknowns.
   - Do not require raw observations. If user quotes, logs, examples, metrics, or prior attempts are absent, mark them as `not provided` only when that absence matters.
   - Build a compact design substrate: core proposal, key commitments, load-bearing assumptions, tensions, likely blind spots, and highest-leverage uncertainties.

2. Frame the work from first principles:
   - Restate the real problem, user intent, scope boundaries, hard constraints, soft preferences, success criteria, known context, and important unknowns.
   - Reduce to invariants: what must remain true no matter which solution is chosen?
   - Decompose into primitives: user goal, constraint, interface, feedback loop, data, incentives, cost, risk, and operational burden.
   - Rephrase the problem using useful frames such as optimization, bottleneck, information, incentive, coordination, interface, migration, and feedback-loop problems.
   - Ask `compared to what?`, distinguish local wins from global system effects, check units and scaling where claims are quantitative, and identify what changes slowly versus quickly.
   - Move up and down abstraction levels: describe the general pattern, then test it against one concrete user, request, transaction, deployment, or failure.
   - Include a blank-slate frame: if this system or workflow did not exist today, how would it be designed from the actual constraints?
   - Identify the main exploration axes, such as architecture, workflow, domain model, integration strategy, operational risk, UX, cost, time, reversibility, and testability.

3. Diamond 1: diverge on problem framings:
   - Use subagents when the environment permits them and independent passes are likely to improve breadth. If subagents are unavailable or excessive for the task, run the useful roles sequentially and label them as `Local role pass`.
   - Give each subagent or role pass a narrow, isolated prompt with only task-local context. Ask for framings, constraints, invariants, precedents, risks, and analogies. Do not include expected answers, preferred conclusions, or synthesis notes.
   - Choose from roles such as:
     - `Framing scout`: alternative problem statements, stakeholder goals, and ways the request could be misunderstood.
     - `First-principles scout`: invariants, primitives, fact/assumption splits, limit cases, and hidden baselines.
     - `Constraint scout`: hard constraints, hidden coupling, non-goals, dependencies, and failure modes.
     - `Precedent scout`: comparable patterns from existing systems, architecture styles, product workflows, and adjacent domains.
     - `Risk scout`: reversibility, operational load, testability, security, migration, and maintenance risks.

4. Synthesize Diamond 1:
   - Merge overlapping findings into a small set of distinct problem frames.
   - For each frame, record why it matters, what it optimizes for, what it may obscure, and what assumptions it depends on.
   - Search for anomalies the dominant frame cannot explain and assumptions shared by all frames.
   - Keep frames alive without selecting a preferred one.

5. Diamond 2: diverge on option families:
   - Use subagents when helpful, or run labeled local role passes when sequential exploration is enough.
   - Assign each subagent or role pass a different frame or design lens. Ask for option families, not one-off ideas.
   - Favor lenses that create real distance between options: conservative extension, deep refactor, platform abstraction, workflow redesign, domain-model shift, operational simplification, user-experience shift, automation, staged migration, and deliberate non-change.
   - Select divergent operators that fit the task:
     - Quantity first: generate enough candidates that obvious ideas are exhausted before synthesis.
     - Distant analogies: map structure from other domains, not surface metaphors.
     - Morphological analysis: split the problem into the dimensions that matter, vary each dimension, then combine unusual but coherent configurations.
     - Rotating constraints: one-hour build, no new dependency, offline-first, 10x cheaper, zero training, highest trust, smallest reversible step.
     - Contradiction search: ask how to achieve both sides of a tradeoff or which assumption makes them look mutually exclusive.
     - Inversion: ask what would guarantee failure, make the problem impossible, or falsify the current view.
     - Limit cases: push cost, time, scale, latency, precision, risk, and friction toward extremes.
     - Associative perturbation: inject strange-but-relevant neighboring concepts when options converge too early.
     - Impasse packet: when exploration stalls, externalize failed attempts, recurring assumptions, unvaried variables, and a reframing prompt for later incubation.

6. Synthesize Diamond 2:
   - Cluster options by underlying strategy rather than surface implementation detail.
   - For each cluster, include rationale, when it fits, tradeoffs, assumptions, likely first experiment, and evidence that would strengthen or weaken it.
   - Preserve both originality and usefulness, but do not let feasibility kill strange options before they are understood.
   - Preserve minority or surprising options when they expose a real possibility, even if they seem unlikely to win later.
   - Run an anti-homogenization check: are these genuinely different option families, or agent-flavored variants of the same idea?

## Subagent Policy

- Spawn real subagents when they are available, permitted, and useful for independent exploration.
- Keep subagent prompts short, independent, and minimally contextual.
- Ask subagents for exploration artifacts, not decisions.
- Do not leak synthesis conclusions, suspected winners, or the user's likely preference into subagent prompts.
- If subagents cannot be used, label sequential passes clearly when that helps preserve independence, for example `Local role pass: <role>`.

## Human-Agent Split

- Treat the human as owner of values, taste, stakes, context, and final judgment.
- Treat the agent as responsible for breadth, memory, structured variation, analogies, contradiction tracking, failure-mode enumeration, and disciplined separation of generation from evaluation.
- When collaboration allows it, ask the human for a private seed list before showing agent-generated options; merge afterward to reduce conformity. If that would stall the work, proceed and note that the human-first pass was skipped.

## Default Output

Use this structure unless the user asks for a different artifact:

```markdown
# <Topic> Divergence

**Source design:** docs/specs/YYYY-MM-DD-<topic>-design.md

## Problem Frame

## Design Substrate

## Divergence Map

## Option Portfolio

## Key Tensions

## Recommended Next Exploration
```

The `Recommended Next Exploration` section should suggest the next question, experiment, prototype, or comparison to run. It should not make a final recommendation unless the user explicitly asked to converge.

If the user asks to converge after divergent exploration, switch modes explicitly: score originality, usefulness, feasibility, strategic leverage, reversibility, and evidence in separate passes; use the outside view and a pre-mortem before recommending a bet.

Store the output in docs/explorations/YYYY-MM-DD-<topic>-divergence.md
