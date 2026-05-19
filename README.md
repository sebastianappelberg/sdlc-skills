# sdlc-skills

Skills sourced from https://github.com/obra/superpowers but modified to fit my needs. 

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

## Credit

All skill content is the work of the [`obra/superpowers`](https://github.com/obra/superpowers) authors and contributors, used under MIT.

Inspiration taken from https://github.com/mattpocock/skills too. 
