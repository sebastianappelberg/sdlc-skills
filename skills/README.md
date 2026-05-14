# Skills index

All skills, grouped by their upstream category. The directory layout under `skills/` is flat (each skill at `skills/<name>/SKILL.md`); the category tag lives in each SKILL.md's frontmatter.

## architecture

- [`preserving-productive-tensions`](./preserving-productive-tensions/SKILL.md) — **Preserving Productive Tensions** — Recognize when disagreements reveal valuable context, preserve multiple valid approaches instead of forcing premature resolution

## collaboration

- [`brainstorming`](./brainstorming/SKILL.md) — **Brainstorming Ideas Into Designs** — Interactive idea refinement using Socratic method to develop fully-formed designs
- [`dispatching-parallel-agents`](./dispatching-parallel-agents/SKILL.md) — **Dispatching Parallel Agents** — Use multiple Claude agents to investigate and fix independent problems concurrently
- [`executing-plans`](./executing-plans/SKILL.md) — **Executing Plans** — Execute detailed plans in batches with review checkpoints
- [`finishing-a-development-branch`](./finishing-a-development-branch/SKILL.md) — **Finishing a Development Branch** — Complete feature development with structured options for merge, PR, or cleanup
- [`receiving-code-review`](./receiving-code-review/SKILL.md) — **Code Review Reception** — Receive and act on code review feedback with technical rigor, not performative agreement or blind implementation
- [`remembering-conversations`](./remembering-conversations/SKILL.md) — **Remembering Conversations** — Search previous Claude Code conversations for facts, patterns, decisions, and context using semantic or text search
- [`requesting-code-review`](./requesting-code-review/SKILL.md) — **Requesting Code Review** — Dispatch code-reviewer subagent to review implementation against plan or requirements before proceeding
- [`subagent-driven-development`](./subagent-driven-development/SKILL.md) — **Subagent-Driven Development** — Execute implementation plan by dispatching fresh subagent for each task, with code review between tasks
- [`using-git-worktrees`](./using-git-worktrees/SKILL.md) — **Using Git Worktrees** — Create isolated git worktrees with smart directory selection and safety verification
- [`writing-plans`](./writing-plans/SKILL.md) — **Writing Plans** — Create detailed implementation plans with bite-sized tasks for engineers with zero codebase context

## debugging

- [`defense-in-depth`](./defense-in-depth/SKILL.md) — **Defense-in-Depth Validation** — Validate at every layer data passes through to make bugs impossible
- [`root-cause-tracing`](./root-cause-tracing/SKILL.md) — **Root Cause Tracing** — Systematically trace bugs backward through call stack to find original trigger
- [`systematic-debugging`](./systematic-debugging/SKILL.md) — **Systematic Debugging** — Four-phase debugging framework that ensures root cause investigation before attempting fixes. Never jump to solutions.
- [`verification-before-completion`](./verification-before-completion/SKILL.md) — **Verification Before Completion** — Run verification commands and confirm output before claiming success

## meta

- [`gardening-skills-wiki`](./gardening-skills-wiki/SKILL.md) — **Gardening Skills Wiki** — Maintain skills wiki health - check links, naming, cross-references, and coverage
- [`pulling-updates-from-skills-repository`](./pulling-updates-from-skills-repository/SKILL.md) — **Pulling Updates from Skills Repository** — Sync local skills repository with upstream changes from obra/superpowers-skills
- [`sharing-skills`](./sharing-skills/SKILL.md) — **Sharing Skills** — Contribute skills back to upstream via branch and PR
- [`testing-skills-with-subagents`](./testing-skills-with-subagents/SKILL.md) — **Testing Skills With Subagents** — RED-GREEN-REFACTOR for process documentation - baseline without skill, write addressing failures, iterate closing loopholes
- [`writing-skills`](./writing-skills/SKILL.md) — **Writing Skills** — TDD for process documentation - test with subagents before writing, iterate until bulletproof

## problem-solving

- [`collision-zone-thinking`](./collision-zone-thinking/SKILL.md) — **Collision-Zone Thinking** — Force unrelated concepts together to discover emergent properties - "What if we treated X like Y?"
- [`inversion-exercise`](./inversion-exercise/SKILL.md) — **Inversion Exercise** — Flip core assumptions to reveal hidden constraints and alternative approaches - "what if the opposite were true?"
- [`meta-pattern-recognition`](./meta-pattern-recognition/SKILL.md) — **Meta-Pattern Recognition** — Spot patterns appearing in 3+ domains to find universal principles
- [`scale-game`](./scale-game/SKILL.md) — **Scale Game** — Test at extremes (1000x bigger/smaller, instant/year-long) to expose fundamental truths hidden at normal scales
- [`simplification-cascades`](./simplification-cascades/SKILL.md) — **Simplification Cascades** — Find one insight that eliminates multiple components - "if this is true, we don't need X, Y, or Z"
- [`when-stuck`](./when-stuck/SKILL.md) — **When Stuck - Problem-Solving Dispatch** — Dispatch to the right problem-solving technique based on how you're stuck

## research

- [`tracing-knowledge-lineages`](./tracing-knowledge-lineages/SKILL.md) — **Tracing Knowledge Lineages** — Understand how ideas evolved over time to find old solutions for new problems and avoid repeating past failures

## testing

- [`condition-based-waiting`](./condition-based-waiting/SKILL.md) — **Condition-Based Waiting** — Replace arbitrary timeouts with condition polling for reliable async tests
- [`test-driven-development`](./test-driven-development/SKILL.md) — **Test-Driven Development (TDD)** — Write the test first, watch it fail, write minimal code to pass
- [`testing-anti-patterns`](./testing-anti-patterns/SKILL.md) — **Testing Anti-Patterns** — Never test mock behavior. Never add test-only methods to production classes. Understand dependencies before mocking.

## using-skills

- [`using-skills`](./using-skills/SKILL.md) — **Getting Started with Skills** — Skills wiki intro - mandatory workflows, search tool, brainstorming triggers

_31 skills total._
