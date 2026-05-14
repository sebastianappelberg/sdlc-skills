# sdlc-skills

A library of 31 software-development skills (TDD, systematic debugging, brainstorming, code review, collaboration patterns, and more), packaged as a plugin for both **Claude Code** and **OpenAI Codex**.

Adapted from [`obra/superpowers-skills`](https://github.com/obra/superpowers-skills) (MIT, archived 2025-10-27). Skills are the same content; the directory layout is flattened to `skills/<name>/SKILL.md` so both Claude Code and Codex can discover them with their default loaders.

## Install

### Claude Code

```sh
# In a Claude Code session
/plugin marketplace add /path/to/this/repo
/plugin install sdlc-skills@sdlc-skills-marketplace
```

To verify: `/plugin` should list `sdlc-skills` as enabled. The 31 skills become available via Claude Code's skill-discovery mechanism.

### Codex

```sh
# In a Codex session (CLI)
/plugin install /path/to/this/repo
```

Refer to [Codex plugin docs](https://developers.openai.com/codex/plugins) for the exact install command if it differs.

## Layout

```
.
├── .claude-plugin/
│   ├── plugin.json          # Claude Code plugin manifest
│   └── marketplace.json     # Local marketplace (so /plugin marketplace add works)
├── .codex-plugin/
│   └── plugin.json          # Codex plugin manifest
├── skills/
│   ├── README.md            # Index of all skills, grouped by category
│   ├── <skill-name>/
│   │   └── SKILL.md         # Frontmatter has: name, description, when_to_use, category, version
│   └── using-skills/        # Special: also ships helper scripts (find-skills, skill-run)
├── LICENSE                  # MIT
└── README.md                # this file
```

## What changed from upstream

- **Flattened layout.** Upstream nested skills as `skills/<category>/<skill>/SKILL.md`; here they're at `skills/<skill>/SKILL.md`. The original category is preserved as a `category:` field in each SKILL.md's frontmatter and indexed in [`skills/README.md`](skills/README.md).
- **Helper scripts in `using-skills/`** (`find-skills`, `skill-run`) were carried over verbatim. They assume the upstream nested layout and a `~/.config/superpowers/skills/` install location, so they will not work out-of-the-box in this fork. Treat them as reference; rewrite if you want them functional.

## Credit

All skill content is the work of the [`obra/superpowers-skills`](https://github.com/obra/superpowers-skills) authors and contributors, used under MIT.
