# Quick Start (5 minutes)

## 1. Basic Commands

| Command     | When to Use                                |
| ----------- | ------------------------------------------ |
| `/fix`      | Small bugs, fixes across 1-3 files         |
| `/research` | Investigate before doing                   |
| `/think`    | Plan a feature or a 4+ file change         |
| `/issue`    | File the plan into an issue's Plan section |
| `/audit`    | Review code quality                        |
| `/commit`   | Create commit message                      |

## 2. Decision Flow

```text
Is it a quick fix? → /fix
Need to understand first? → /research → /fix
Building a feature? → /research → /think → /issue → build workflow → /audit
```

## 3. Example Session

```bash
# Quick bug fix
> /fix the login button is not working

# Feature development
> /research how does auth work in this codebase?
> /think add logout functionality
> /issue

# Hand the issue number to the build workflow, then once the draft PR is up
> /audit
> /commit
```

## 4. Key Principles

- **One command at a time**: Let each complete before the next
- **Trust the workflow**: Commands chain naturally
- **Ask when unclear**: Claude will clarify if needed

## 5. Next Steps

- Run `/help` for all commands
- See [COMMANDS](./COMMANDS.md) for the full development flow
