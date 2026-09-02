# Claude AI Configuration

A comprehensive configuration system for Claude AI with custom commands,
development principles, and workflow optimizations.

📌 **[日本語版](./.ja/README.md)**

## 🎯 Overview

This repository contains personal configurations for Claude AI, including:

- Custom slash commands for systematic development workflows (27 skills)
- Specialized AI agents for code review, generation, and analysis (28 agents)
- Core AI operation principles and development best practices
- Quality pipeline hooks (guardrails, formatter, gates) and the unwired reviews
  command
- Japanese language support

## 📁 Structure

```text
.claude/
├── CLAUDE.md              # Main configuration (AI reads this)
├── README.md              # This file - Quick start guide
├── rules/                 # Rule definitions
│   ├── core/             # Core AI operation principles
│   ├── conventions/      # Documentation conventions
│   └── development/      # Development patterns & methodologies
├── skills/               # Skill-based knowledge modules (27 skills)
├── agents/               # Specialized AI agents (28 agents)
│   ├── critics/          # Finding challengers (devils-advocate)
│   ├── enhancers/        # Code enhancers & simplifiers
│   ├── explorers/        # Codebase exploration agents
│   ├── generators/       # Test & snapshot generation
│   ├── resolvers/        # Build error resolvers
│   └── reviewers/        # Code review agents (18 reviewers)
├── docs/                  # Design docs & guides (DRs under decisions/)
├── hooks/                 # Pre/Post tool-use hooks
├── output-styles/         # Output style definitions
├── .claude-plugin/        # Plugin marketplace config
└── .ja/                   # Japanese translations
```

## 🚀 Quick Start

### Option 1: Install as Claude Code Plugin (Recommended)

This repository is available as a Claude Code plugin, allowing you to easily
install specific workflow sets:

1. **Add this repository as a marketplace**:

   ```bash
   /plugin marketplace add thkt/dotclaude
   ```

2. **Browse available plugins**:

   ```bash
   /plugin
   ```

3. **Install the plugin**:

   ```bash
   /plugin install build
   ```

#### Available Plugins

- **build**: Self-contained development workflow toolkit. Installing it clones
  the whole repository once, so every skill, agent, and workflow loads under the
  build: namespace. File an issue with /issue and hand its number to the build
  workflow. Build creates a draft PR after Load / Revalidate / Branch / Code /
  Cleanup / Verify / Ship.
  Humans invoke /audit and /polish separately on the draft PR.
  Bundles the planning skills (/think, /research, /slice, /outcome), the reviewer
  and critic agents, the code / audit / polish / shake / assert / adrift
  workflows, the git skills (/commit, /checkout, /pr), and /dr, /census.

### Option 2: Manual Installation (Full Configuration)

For using this as your personal `.claude` configuration:

1. Clone this repository to your home directory:

   ```bash
   git clone https://github.com/thkt/dotclaude.git ~/.claude
   ```

2. Or if you already have a `.claude` directory, back it up first:

   ```bash
   mv ~/.claude ~/.claude.backup
   git clone https://github.com/thkt/dotclaude.git ~/.claude
   ```

**Note**: Manual installation applies all skills, agents, rules, and personal
configuration. Plugin installation also clones the whole repository, but Claude
Code loads only its skills, agents, and workflows; personal `CLAUDE.md`,
`rules/`, and `settings.json` are not applied as rules or settings. A skill that
cites `rules/` reads the copy inside the plugin.

## 📦 Dependencies & Setup

### Sandbox Feature (Optional but Recommended)

Claude Code's sandbox feature provides secure command execution with automatic
permission handling, reducing approval fatigue while maintaining safety.

#### System Requirements

- macOS or Linux (Windows not yet supported)
- Node.js with npm/npx
- ripgrep (typically pre-installed)
- jq (required by the current hooks): `brew install jq`

#### Setup

```bash
# 1. Install sandbox runtime
npm install -g @anthropic-ai/sandbox-runtime

# 2. Verify installation
srt --version

# 3. Enable in Claude Code
# Run this command in Claude Code session:
/sandbox
# Select option 1: "Sandbox BashTool, with auto-allow in accept edits mode"
```

#### What it does

- Restricts file system access to allowed directories
- Controls network access via proxy
- Auto-executes safe commands in sandbox
- Requests approval only when sandbox restrictions are hit

#### Configuration (optional)

Create `~/.srt-settings.json` for custom settings:

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker"],
    "network": {
      "allowLocalBinding": true,
      "httpProxyPort": 8080
    }
  }
}
```

The build workflow runs `gh` inside the sandbox. On macOS with the sandbox enabled, `gh`'s TLS verification requires `sandbox.enableWeakerNetworkIsolation: true` in `~/.claude/settings.json`. Without it, the build fails at the issue-fetch step.

### Hook Tools (Recommended)

Quality pipeline hooks wired in `settings.json` run automatically during Claude
Code sessions to catch lint errors, format code, and enforce quality gates. The
install command includes reviews, but `settings.json` does not wire it, so it
does not run automatically.

```bash
brew tap thkt/tap
brew install guardrails formatter reviews gates
```

| Tool       | Hook        | Timing                | Role                              |
| ---------- | ----------- | --------------------- | --------------------------------- |
| guardrails | PreToolUse  | Before Write/Edit     | Lint (oxlint) + security checks   |
| formatter  | PostToolUse | After Write/Edit      | Auto-format (oxfmt)               |
| reviews    | Not wired   | No automatic run      | Static-analysis command           |
| gates      | PostToolUse | After Write/Edit/Bash | Quality gates (knip, tsgo, madge) |

Per-project configuration is done via `.claude/tools.json`. See
[thkt/tap](https://github.com/thkt/homebrew-tap) for details.

### External CLI Tools (Optional)

Some commands use external CLI tools for data source integration. codegraph
needs `codegraph init` per repository to create `.codegraph/` before use.

| Tool        | Required By                           | Purpose                                                      | Install                            |
| ----------- | ------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `gh`        | `/issue`, `/pr`, `/preview`, `/build` | GitHub API access                                            | `brew install gh && gh auth login` |
| `scout`     | `/research`, use-cli-scout skill      | Web search, page fetch, GitHub repo exploration, Slack fetch | `brew install thkt/tap/scout`      |
| `codegraph` | `/research`, use-cli-codegraph skill  | Symbol-level structure queries (callers, impact)             | `npm i -g @colbymchenry/codegraph` |

**Slack reading**: `scout fetch <slack-url>` reads any Slack message/thread URL
directly. No additional setup needed if scout is configured.

### Autonomous Iteration

`/code` can run as an autonomous multi-turn loop via the native `/goal` command
(Claude Code 2.1.139+). No plugin install is required.

```bash
/goal all tests pass and lint is clean
```

Wrap a `/code` session in `/goal <condition>`; Claude continues until a fast
model judges the condition met from the conversation.

## 📝 Available Commands

See the complete command reference:

- [English Command Reference](./docs/COMMANDS.md)
- [日本語コマンドリファレンス](./.ja/docs/COMMANDS.md)

## 🔄 Standard Workflows

### Feature Development

```txt
/research → /think → /issue → build workflow → /audit · /polish
```

### Bug Investigation & Fix

```txt
/research → /fix
```

## 🌏 Language Support

- **AI Processing**: English internally
- **User Output**: Japanese (configurable)
- **Documentation**: README.md and `docs/*.md` are available in English and Japanese; the seven `docs/wiki/*.md` files are English-only

## 🛠️ Key Features

### Core AI Principles

- **Safety First**: File deletion uses trash (`~/.Trash/`), destructive
  operations require confirmation
- **User Authority**: Your instructions are the ultimate authority
- **Output Verifiability**: Confirm exact formats by reading files, never assert
  about unread code, and stop when a knowledge gap blocks critical verification

### Development Approach

- **Occam's Razor**: Choose the simplest solution that works
- **Progressive Enhancement**: Build simple, enhance gradually
- **TDD/RGRC**: Red-Green-Refactor-Commit cycle for reliable code

Full details: [PRINCIPLES.md](./rules/PRINCIPLES.md)

## 📚 Documentation

### Core Documentation

- [Design Philosophy](./docs/DESIGN.md) - **Why this design** (設計思想・意図)
- [SPEC](./docs/SPEC.md) - Execution contract of hooks, skills, agents, and workflows
- [Commands Reference (English)](./docs/COMMANDS.md)
- [Commands Reference (Japanese)](./.ja/docs/COMMANDS.md)
- [Configuration Guide](./CLAUDE.md)
- [Japanese Configuration](./.ja/CLAUDE.md)

### Development Guides

- [Principles Guide](./rules/PRINCIPLES.md) - Complete overview of all
  development principles
- [Markdown Conventions](./rules/conventions/MARKDOWN.md) - Markdown writing
  and reference rules

## 🤝 Contributing

Feel free to fork this repository and customize it for your needs. Pull requests
for improvements are welcome!

## 📜 License

MIT License - Feel free to use and modify as needed.

## 👤 Author

thkt
