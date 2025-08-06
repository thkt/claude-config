# CLAUDE.md

## Priority Rules (FOLLOW IN ORDER)

### [P1] Language

- Input: Japanese from thkt
- Process: English internally
- Output: **JAPANESE ONLY** - NO ENGLISH OUTPUT TO USER
- Translation: **MANDATORY** for:
  - All format templates (Understanding Level → 理解レベル)
  - All messages and prompts (Proceed? → 進めてよろしいですか？)
  - All labels and status (completed → 完了)
- **CRITICAL**: Even if rule files show English, output MUST be Japanese

### [P2] Development Approach

- **Default philosophy**: Progressive Enhancement → [@~/.claude/rules/development/PROGRESSIVE_ENHANCEMENT.md](./rules/development/PROGRESSIVE_ENHANCEMENT.md)
  - Build simple → enhance progressively
  - Root cause over quick fixes
  - CSS-first for UI solutions
  - Elegance through simplicity
- **Code readability**: The Art of Readable Code → [@~/.claude/rules/development/READABLE_CODE.md](./rules/development/READABLE_CODE.md)
  - Clear naming and intent
  - Simple and direct solutions
  - Code that explains itself
  - Minimize understanding time
- **Container/Presentational**: Component design pattern → [@~/.claude/rules/development/CONTAINER_PRESENTATIONAL.md](./rules/development/CONTAINER_PRESENTATIONAL.md)
  - Separate logic from UI
  - Props-only Presentational components
  - Hooks in Container components
  - Maximize reusability
- Development methodologies integrated in commands:
  - `/code` - TDD/RGRC [@~/.claude/rules/reference/TDD_RGRC.md], SOLID [@~/.claude/rules/reference/SOLID.md], DRY principles [@~/.claude/rules/reference/DRY.md]
  - `/think` - SOLID design principles [@~/.claude/rules/reference/SOLID.md]

### [P3] File Deletion Behavior

- **NEVER use rm command**: rm is disabled in settings.json
- **Always use trash**: Move files to ~/.Trash/ instead of permanent deletion
- **Command**: Use `mv [file] ~/.Trash/` for file deletion
- **Reason**: Safety - allows recovery of accidentally deleted files

### Commands Reference

- Command list: [@~/.claude/docs/COMMANDS.md](./docs/COMMANDS.md)
- Japanese version: [@~/.claude/ja/docs/COMMANDS.md](./ja/docs/COMMANDS.md)

### Reference

JP version for human review: [@~/.claude/ja/CLAUDE.md](./ja/CLAUDE.md)
AI reads English version only.
